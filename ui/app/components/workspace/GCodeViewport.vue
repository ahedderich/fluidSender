<template>
  <div ref="containerRef" class="relative bg-gray-100 dark:bg-slate-950 rounded-lg overflow-hidden">
    <!-- 3D canvas — always full container, hidden only in cam-only mode.
         absolute + inset-0 (not w-full h-full) keeps it out of normal flow entirely,
         so its intrinsic aspect ratio (from the width/height attributes Three.js sets)
         can never feed back into the container's own flex/grid sizing. -->
    <canvas
      ref="canvasRef"
      class="absolute inset-0"
      :class="viewMode === 'cam' ? 'invisible' : ''"
    />

    <!-- Camera overlay: full in cam mode, right half in split, quarter pip -->
    <div
      v-if="viewMode !== '3d'"
      :class="[
        viewMode === 'split' ? 'absolute top-0 right-0 bottom-0 left-1/2' : '',
        viewMode === 'cam' ? 'absolute inset-0' : '',
        viewMode === 'pip' ? 'absolute right-3 bottom-10 w-1/4 h-1/4 rounded-lg overflow-hidden border border-slate-600 shadow-lg' : '',
        'flex items-center justify-center bg-slate-900',
      ]"
    >
      <!-- Split divider line -->
      <div v-if="viewMode === 'split'" class="absolute left-0 top-0 bottom-0 w-px bg-slate-700 z-10" />

      <!-- Stream only mounts while a cam-showing mode is active — kills the connection/decode on hide -->
      <WorkspaceWebcamPlayer
        v-if="webcam?.enabled && webcam.streamUrl"
        :key="webcam.streamUrl"
        :stream-url="webcam.streamUrl"
        :stream-type="webcam.streamType"
        class="w-full h-full"
      />
      <div v-else class="text-center">
        <svg class="w-8 h-8 text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p class="text-slate-500 text-xs">Webcam not configured</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="!ready" class="absolute inset-0 flex items-center justify-center">
      <div class="text-gray-400 dark:text-slate-500 text-sm">Initializing 3D viewport...</div>
    </div>

    <!-- Webcam/view mode switcher (top-left) -->
    <div class="absolute top-2.5 left-2.5 flex gap-1 z-10">
      <button
        v-for="m in viewModes"
        :key="m.key"
        @click="viewMode = m.key"
        :class="viewMode === m.key ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800/80 text-slate-300 border-slate-600/50 hover:bg-slate-700/90'"
        class="px-2 py-1 rounded text-xs backdrop-blur-sm border transition-colors font-medium"
      >{{ m.label }}</button>
    </div>

    <!-- View presets (top-left, offset for mode switcher) -->
    <div class="absolute top-10 left-2.5 flex gap-1.5 z-10">
      <button
        v-for="v in viewPresets"
        :key="v.key"
        @click="setView(v.key)"
        class="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700/90 text-slate-300 text-xs rounded-md backdrop-blur-sm border border-slate-600/50 transition-colors"
      >{{ v.label }}</button>
    </div>

    <!-- Layer visibility (top-right) -->
    <div class="absolute top-2.5 right-2.5 flex flex-col gap-1 z-10">
      <button
        v-for="layer in layers"
        :key="layer.key"
        @click="toggleLayer(layer)"
        :class="layer.visible ? 'opacity-100' : 'opacity-40'"
        class="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700/90 rounded-md backdrop-blur-sm border border-slate-600/50 transition-opacity text-xs"
      >
        <span
          v-if="layer.key === 'origin'"
          class="w-3 h-0.5 rounded-full inline-block"
          style="background: linear-gradient(to right, #ef4444 50%, #22c55e 50%)"
        />
        <span
          v-else
          class="w-3 h-0.5 rounded-full inline-block"
          :style="{ backgroundColor: layer.color }"
        />
        <span class="text-slate-300">{{ layer.label }}</span>
      </button>
    </div>

    <!-- Loaded tool (bottom-left, above progress bar) -->
    <div v-if="machine.connected" class="group absolute bottom-14 left-2.5 z-10 flex items-center gap-2 px-2.5 py-1.5 bg-slate-800/80 backdrop-blur-sm border border-slate-600/50 rounded-md text-xs">
      <template v-if="loadedLibTool">
        <span :class="loadedBadgeClass" class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0">{{ loadedLibTool.number }}</span>
        <span class="text-slate-300 max-w-36 truncate">{{ loadedLibTool.name }}</span>
        <span class="text-slate-500">⌀{{ loadedLibTool.diameter }}</span>
      </template>
      <template v-else-if="machine.loadedToolNumber !== null">
        <span :class="loadedBadgeClass" class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0">{{ machine.loadedToolNumber }}</span>
        <span class="text-slate-500 italic">T{{ machine.loadedToolNumber }} (not in library)</span>
      </template>
      <template v-else>
        <svg class="w-3 h-3 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
        </svg>
        <span class="text-slate-500 italic">No tool loaded</span>
      </template>

      <template v-if="toolchangeStrategy !== 'manual-basic'">
      <span class="w-px h-4 bg-slate-600/50 shrink-0" />

      <span
        v-if="machine.toolLengthOffset !== null"
        class="text-slate-400 font-mono whitespace-nowrap"
        title="Currently active tool length offset (G43.1), as confirmed by the machine"
      >TLO {{ machine.toolLengthOffset.toFixed(3) }}</span>
      <span
        v-else
        class="flex items-center gap-1 text-amber-400 whitespace-nowrap"
        title="Tool length offset not confirmed this session — probe the loaded tool on the toolsetter before starting a job"
      >
        <svg class="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm0 5.5 6.9 12H5.1L12 7.5zM11 10v5h2v-5h-2zm0 6.5v2h2v-2h-2z"/></svg>
        TLO not set
      </span>
      </template>

      <!-- Measure offset: always shown while TLO is unset, otherwise reveals on hover -->
      <button
        v-if="toolchangeStrategy === 'manual-toolsetter'"
        :class="machine.toolLengthOffset === null
          ? 'opacity-100'
          : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'"
        class="flex items-center gap-1 px-1.5 py-0.5 bg-slate-700/80 hover:bg-blue-600 text-slate-300 hover:text-white rounded transition-[opacity,background-color] whitespace-nowrap"
        title="Probe and set the tool length offset for the loaded tool"
        @click="handleMeasureOffset"
      >
        <svg class="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        Measure
      </button>
    </div>

    <!-- Progress bar (bottom) -->
    <div class="absolute bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-sm border-t border-slate-700/50 px-4 py-2 z-10">
      <div class="flex items-center justify-between text-xs text-slate-400 mb-1.5">
        <span>{{ startLabel }}</span>
        <span class="font-medium">
          <span class="text-blue-400">{{ execPct }}%</span>
          <span v-if="showRuntime" class="text-slate-300 ml-2 font-mono">{{ runtimeLabel }}</span>
          <span v-if="job?.filename" class="text-slate-400 ml-1">({{ job!.filename }})</span>
        </span>
        <span>{{ etaLabel }}</span>
      </div>
      <div class="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <!-- Sent: light blue/grey, wider -->
        <div
          class="absolute inset-y-0 left-0 bg-blue-900 transition-all duration-500"
          :style="{ width: sendPct + '%' }"
        />
        <!-- Executed: blue, narrower, on top -->
        <div
          class="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-500"
          :style="{ width: execPct + '%' }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type * as THREE from 'three'
import { useMachineStore } from '~/stores/machine'
import { useSettingsStore } from '~/stores/settings'
import { useJobControl } from '~/composables/useJobControl'
import { useConfirm } from '~/composables/useConfirm'
import { useToast } from '~/composables/useToast'
import { wsSend } from '~/composables/useWsSend'
import type { LineVector } from '~/types/job'
import type { CamMode } from '~/types/webcam'

const machine = useMachineStore()
const settings = useSettingsStore()
const { job } = useJobControl()
const { confirm } = useConfirm()
const { error: toastError } = useToast()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const ready = ref(false)

const webcam = computed(() => settings.activeMachine?.webcam)

const viewMode = ref<CamMode>(webcam.value?.defaultMode ?? '3d')
// Each machine has its own default view — jump back to it when switching machines,
// rather than carrying the previous machine's cam mode over.
watch(() => settings.activeMachineId, () => {
  viewMode.value = webcam.value?.defaultMode ?? '3d'
})

const viewModes = [
  { key: '3d' as CamMode, label: '3D' },
  { key: 'split' as CamMode, label: '⬛⬛' },
  { key: 'cam' as CamMode, label: 'CAM' },
  { key: 'pip' as CamMode, label: 'PiP' },
]

type ViewKey = 'iso' | 'top' | 'front' | 'right'

const viewPresets = [
  { key: 'iso' as ViewKey, label: 'ISO' },
  { key: 'top' as ViewKey, label: 'Top' },
  { key: 'front' as ViewKey, label: 'Front' },
  { key: 'right' as ViewKey, label: 'Right' },
]

const layers = reactive([
  { key: 'cutting', label: 'Cutting', color: '#3b82f6', visible: true },
  { key: 'travel', label: 'Travel', color: '#22c55e', visible: true },
  { key: 'zmove', label: 'Z Move', color: '#eab308', visible: true },
  { key: 'stock', label: 'Stock', color: '#a855f7', visible: true },
  { key: 'origin', label: 'Origin', color: '', visible: true },
  { key: 'machineBounds', label: 'Machine', color: '#475569', visible: true },
])

const sendPct = computed(() => job.value?.totalLines ? Math.round((job.value.sendPtr / job.value.totalLines) * 100) : 0)
const execPct = computed(() => job.value?.totalLines ? Math.round((job.value.execPtr / job.value.totalLines) * 100) : 0)

const startLabel = computed(() => {
  if (!job.value?.startWallClock) return 'Start: --:--'
  return `Start: ${new Date(job.value.startWallClock).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
})

const etaLabel = computed(() => {
  if (!job.value?.startWallClock || !job.value.estimatedTotalMs) return 'ETA: --:--'
  const eta = job.value.startWallClock + job.value.estimatedTotalMs
  return `ETA: ${new Date(eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
})

// Live runtime timer — ticks locally off the server-owned accumulatedRunMs/startWallClock
// rather than being pushed every second, so it stays a cheap client-side derivation.
const nowTick = ref(Date.now())
let runtimeTickInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  runtimeTickInterval = setInterval(() => { nowTick.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (runtimeTickInterval) clearInterval(runtimeTickInterval)
})

const runtimeMs = computed(() => {
  const j = job.value
  if (!j) return 0
  const base = j.accumulatedRunMs ?? 0
  return j.status === 'running' && j.startWallClock
    ? base + Math.max(0, nowTick.value - j.startWallClock)
    : base
})

const showRuntime = computed(() => runtimeMs.value > 0 || job.value?.status === 'running')

const runtimeLabel = computed(() => {
  const totalSec = Math.floor(runtimeMs.value / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
})

const toolchangeStrategy = computed(() => settings.activeMachine?.toolchange?.strategy ?? 'manual-basic')

const allToolLibrary = computed(() => [
  ...machine.toolLibrary.machine,
  ...machine.toolLibrary.app,
])

const loadedLibTool = computed(() =>
  machine.loadedToolNumber !== null
    ? (allToolLibrary.value.find(e => e.number === machine.loadedToolNumber) ?? null)
    : null,
)

const nextRequiredToolNumber = computed(() => {
  const sections = job.value?.toolSections ?? []
  if (!sections.length) return null
  const sendPtr = job.value?.sendPtr ?? 0
  const status = job.value?.status
  if (!status || status === 'idle' || status === 'analyzing') {
    return sections[0]?.toolNumber ?? null
  }
  return sections.find(s => sendPtr <= s.endLine)?.toolNumber ?? null
})

const loadedBadgeClass = computed(() => {
  if (machine.loadedToolNumber === null) return ''
  return machine.loadedToolNumber === nextRequiredToolNumber.value ? 'bg-green-600' : 'bg-purple-600'
})

const toolDiameter = computed(() => loadedLibTool.value?.diameter ?? 8)

async function handleMeasureOffset() {
  const ok = await confirm({
    title: 'Measure Tool Offset',
    message: 'The machine must be homed. This will move to the toolsetter position (in machine coordinates) and probe the currently loaded tool. Start the measurement now?',
    confirmLabel: 'Start Measurement',
  })
  if (!ok) return
  wsSend({ t: 'tool:measureOffset', payload: {} })
}

const machineBounds = computed(() => {
  const axes = settings.activeMachine?.fluidncConfig?.axes
  return {
    x: axes?.x?.max_travel_mm || 300,
    y: axes?.y?.max_travel_mm || 200,
    z: axes?.z?.max_travel_mm || 100,
  }
})

// Machine home expressed in work coordinates: wpos − mpos.
// When not connected both are (0,0,0) so the box sits at the work origin.
const machineHomeWpos = computed(() => ({
  x: machine.workPos.x - machine.machinePos.x,
  y: machine.workPos.y - machine.machinePos.y,
  z: machine.workPos.z - machine.machinePos.z,
}))

// Three.js refs (non-reactive — plain refs to avoid proxy issues)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let threeCtx: any = null
let animId: number | null = null
const objectMap: Record<string, unknown> = {}
let removeRotateListeners: (() => void) | null = null
let removeVisibilityListener: (() => void) | null = null
let removeResizeListener: (() => void) | null = null

// No-op defaults until initThree() assigns real implementations
let requestRender: () => void = () => {}
let renderFrame: () => void = () => {}
let rebuildSpatialGeometry: (b: { x: number; y: number; z: number }) => void = () => {}
let rebuildStock: (s: import('~/stores/machine').StockDef | null) => void = () => {}
let loadToolpathSegments: (vectors: Array<LineVector | null>) => void = () => {}
let clearToolpath: () => void = () => {}

async function initThree() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  const THREE = await import(/* @vite-ignore */ 'three')
  const { OrbitControls } = await import(/* @vite-ignore */ 'three/examples/jsm/controls/OrbitControls.js')
  const { LineSegments2 } = await import(/* @vite-ignore */ 'three/examples/jsm/lines/LineSegments2.js')
  const { LineSegmentsGeometry } = await import(/* @vite-ignore */ 'three/examples/jsm/lines/LineSegmentsGeometry.js')
  const { LineMaterial } = await import(/* @vite-ignore */ 'three/examples/jsm/lines/LineMaterial.js')

  const { width, height } = container.getBoundingClientRect()

  // Track all LineMaterial instances so their resolution uniform stays in sync on resize.
  // LineMaterial renders lines as triangles (not native GL lines), giving proper AA and width > 1px.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineMats: any[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function lineMat2(color: number, linewidth = 1.5): any {
    const m = new LineMaterial({ color, linewidth, resolution: new THREE.Vector2(width, height) })
    lineMats.push(m)
    return m
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function lineSegs2(pts: { x: number; y: number; z: number }[], mat: any): any {
    const pos: number[] = []
    for (const p of pts) pos.push(p.x, p.y, p.z)
    const geo = new LineSegmentsGeometry()
    geo.setPositions(pos)
    return new LineSegments2(geo, mat)
  }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020617) // slate-950

  const camera = new THREE.PerspectiveCamera(45, width / (height || 1), 0.1, 10000)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  // updateStyle=false: canvas layout size stays CSS-driven (absolute + inset-0 of container)
  // so it can never feed its own size back into the container's layout — only the internal
  // drawing-buffer resolution is set here.
  renderer.setSize(width, height || 400, false)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  }
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enableRotate = false  // custom screen-space rotation below
  controls.panSpeed = 1.5
  controls.target.set(0, 0, 0)

  // Screen-space rotation: mouse axes always map to screen axes, independent of view angle.
  // OrbitControls' built-in rotation rotates around world axes (theta=world-Z, phi=elevation),
  // which produces diagonal motion from non-front views. Instead we rotate around the camera's
  // current screen-right and screen-up vectors each frame.
  {
    const dom = renderer.domElement
    let dragging = false
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      dom.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      const { camera, controls: ctrl } = threeCtx
      const offset = camera.position.clone().sub(ctrl.target)

      // Derive screen-space axes from current camera orientation
      const lookDir = offset.clone().negate().normalize()
      const screenRight = new THREE.Vector3().crossVectors(lookDir, camera.up).normalize()
      const screenUp = new THREE.Vector3().crossVectors(screenRight, lookDir).normalize()

      const speed = 0.005
      // dx: rotate around screen-up;  dy: rotate around screen-right
      const qH = new THREE.Quaternion().setFromAxisAngle(screenUp, -dx * speed)
      const qV = new THREE.Quaternion().setFromAxisAngle(screenRight, -dy * speed)
      const q = qH.multiply(qV)

      offset.applyQuaternion(q)
      camera.up.applyQuaternion(q)
      camera.position.copy(ctrl.target).add(offset)
      camera.lookAt(ctrl.target)
      requestRender()
    }

    const onPointerUp = () => { dragging = false }

    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('pointercancel', onPointerUp)

    removeRotateListeners = () => {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointercancel', onPointerUp)
    }
  }

  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  const tickLen = 8

  function makeLabel(text: string, color: string, fontPx = 22) {
    const cvs = document.createElement('canvas')
    cvs.width = 128; cvs.height = 64
    const ctx2d = cvs.getContext('2d')!
    ctx2d.font = `bold ${fontPx}px monospace`
    ctx2d.fillStyle = color
    ctx2d.textAlign = 'center'
    ctx2d.textBaseline = 'middle'
    ctx2d.fillText(text, cvs.width / 2, cvs.height / 2)
    const tex = new THREE.CanvasTexture(cvs)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.renderOrder = 1
    return sprite
  }

  // Builds (or rebuilds) the grid, axis rulers, and machine boundary box.
  // All three are keyed in objectMap so they can be disposed and recreated when
  // machineBounds changes (i.e. after firmware connects and config loads).
  function buildSpatialGeometry(b: { x: number; y: number; z: number }) {
    // Dispose previous spatial objects — geometry, textures, and materials.
    // Materials that live in lineMats must be removed so the resize handler
    // doesn't call .set() on a disposed object.
    for (const key of ['grid', 'origin', 'machineBounds']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const old = objectMap[key] as any
      if (!old) continue
      scene.remove(old)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      old.traverse((child: any) => {
        child.geometry?.dispose()
        if (child.material) {
          const idx = lineMats.indexOf(child.material)
          if (idx !== -1) lineMats.splice(idx, 1)
          child.material.map?.dispose()
          child.material.dispose()
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete objectMap[key]
    }

    // Pick a grid step that gives ~10 divisions along the shorter axis.
    const minTravel = Math.min(b.x, b.y)
    const gStep = minTravel < 50 ? 5 : minTravel < 150 ? 10 : minTravel < 300 ? 25 : minTravel < 600 ? 50 : minTravel < 1200 ? 100 : 200
    const tStep = gStep * 2  // ruler label interval

    // Grid — origin at top-right; work area extends into negative X and Y.
    // One step of margin beyond the boundary on each side.
    {
      const gPts: number[] = []
      const x0 = -b.x - gStep, x1 = b.x + gStep
      const y0 = -b.y - gStep, y1 = b.y + gStep
      for (let y = Math.round(y0 / gStep) * gStep; y <= y1; y += gStep)
        gPts.push(x0, y, 0, x1, y, 0)
      for (let x = Math.round(x0 / gStep) * gStep; x <= x1; x += gStep)
        gPts.push(x, y0, 0, x, y1, 0)
      const gMat = new LineMaterial({ color: 0x1e293b, linewidth: 1.0,
        resolution: new THREE.Vector2(width, height), depthTest: false, depthWrite: false })
      lineMats.push(gMat)
      const gGeo = new LineSegmentsGeometry()
      gGeo.setPositions(gPts)
      const gLine = new LineSegments2(gGeo, gMat)
      gLine.renderOrder = -1
      scene.add(gLine)
      objectMap['grid'] = gLine
    }

    // Axis rulers: X (red) −bx→0, Y (green) −by→0
    {
      const grp = new THREE.Group()

      grp.add(lineSegs2([V3(-b.x, 0, 0), V3(b.x, 0, 0)], lineMat2(0xef4444, 2.0)))
      const xTickPts: THREE.Vector3[] = []
      for (let x = Math.ceil(-b.x / tStep) * tStep; x <= b.x; x += tStep) {
        xTickPts.push(V3(x, 0, 0), V3(x, -tickLen, 0))
        if (x !== 0) {
          const lbl = makeLabel(`${x}`, '#ef4444')
          lbl.scale.set(20, 10, 1)
          lbl.position.set(x, -20, 0)
          grp.add(lbl)
        }
      }
      grp.add(lineSegs2(xTickPts, lineMat2(0xef4444, 1.0)))
      const xLbl = makeLabel('X', '#ef4444', 32)
      xLbl.scale.set(16, 8, 1)
      xLbl.position.set(b.x + 24, 14, 0)
      grp.add(xLbl)

      grp.add(lineSegs2([V3(0, -b.y, 0), V3(0, b.y, 0)], lineMat2(0x22c55e, 2.0)))
      const yTickPts: THREE.Vector3[] = []
      for (let y = Math.ceil(-b.y / tStep) * tStep; y <= b.y; y += tStep) {
        yTickPts.push(V3(0, y, 0), V3(-tickLen, y, 0))
        if (y !== 0) {
          const lbl = makeLabel(`${y}`, '#22c55e')
          lbl.scale.set(20, 10, 1)
          lbl.position.set(-20, y, 0)
          grp.add(lbl)
        }
      }
      grp.add(lineSegs2(yTickPts, lineMat2(0x22c55e, 1.0)))
      const yLbl = makeLabel('Y', '#22c55e', 32)
      yLbl.scale.set(16, 8, 1)
      yLbl.position.set(14, b.y + 24, 0)
      grp.add(yLbl)

      scene.add(grp)
      objectMap['origin'] = grp
    }

    // Machine boundary box — (−bx, −by, −bz) to (0, 0, 0)
    {
      const bx = b.x, by = b.y, bz = b.z
      const bPts: number[] = [
        // top face (Z=0)
        0,0,0, -bx,0,0,  -bx,0,0, -bx,-by,0,  -bx,-by,0, 0,-by,0,  0,-by,0, 0,0,0,
        // bottom face (Z=−bz)
        0,0,-bz, -bx,0,-bz,  -bx,0,-bz, -bx,-by,-bz,  -bx,-by,-bz, 0,-by,-bz,  0,-by,-bz, 0,0,-bz,
        // vertical edges
        0,0,0, 0,0,-bz,  -bx,0,0, -bx,0,-bz,  -bx,-by,0, -bx,-by,-bz,  0,-by,0, 0,-by,-bz,
      ]
      const bGeo = new LineSegmentsGeometry()
      bGeo.setPositions(bPts)
      const bLine = new LineSegments2(bGeo, lineMat2(0x475569, 1.0))
      const h0 = machineHomeWpos.value
      bLine.position.set(h0.x, h0.y, h0.z)
      scene.add(bLine)
      objectMap['machineBounds'] = bLine
    }

    // Restore layer visibility that was toggled before this rebuild
    for (const layer of layers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = objectMap[layer.key] as any
      if (obj && !layer.visible) obj.visible = false
    }
  }

  buildSpatialGeometry(machineBounds.value)
  rebuildSpatialGeometry = buildSpatialGeometry

  // Stock mesh — built on demand from machine.stock; null = no stock shown.
  // The top-face centre is always at work (0,0,0): rect/round centered in XY, top at Z=0.
  function buildStockMesh(s: import('~/stores/machine').StockDef | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const old = objectMap['stock'] as any
    if (old) {
      scene.remove(old)
      old.geometry?.dispose()
      const idx = lineMats.indexOf(old.material)
      if (idx !== -1) lineMats.splice(idx, 1)
      old.material?.dispose()
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete objectMap['stock']
    }
    if (!s) return

    const zTop = 0
    const zBot = -s.depth
    const pts: number[] = []

    if (s.shape === 'rect') {
      const hw = (s.measuredWidth ?? s.width ?? 100) / 2
      const hh = (s.measuredHeight ?? s.height ?? 100) / 2
      const rad = ((s.rotation ?? 0) * Math.PI) / 180
      const cos = Math.cos(rad), sin = Math.sin(rad)
      const corners = ([ [-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh] ] as [number,number][])
        .map(([x,y]) => [ x*cos - y*sin, x*sin + y*cos ] as [number,number])
      for (let i = 0; i < 4; i++) {
        const [ax,ay] = corners[i]!, [bx,by] = corners[(i+1)%4]!
        pts.push(ax,ay,zTop, bx,by,zTop)   // top edge
        pts.push(ax,ay,zBot, bx,by,zBot)   // bottom edge
        pts.push(ax,ay,zTop, ax,ay,zBot)   // vertical
      }
    } else {
      const r = (s.measuredDiameter ?? s.diameter ?? 100) / 2
      const segs = 64
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i+1) / segs) * Math.PI * 2
        const [x0,y0] = [r*Math.cos(a0), r*Math.sin(a0)]
        const [x1,y1] = [r*Math.cos(a1), r*Math.sin(a1)]
        pts.push(x0,y0,zTop, x1,y1,zTop)   // top circle
        pts.push(x0,y0,zBot, x1,y1,zBot)   // bottom circle
      }
      // Four vertical lines at cardinal points
      for (const a of [0, Math.PI/2, Math.PI, 3*Math.PI/2]) {
        const [x,y] = [r*Math.cos(a), r*Math.sin(a)]
        pts.push(x,y,zTop, x,y,zBot)
      }
    }

    const geo = new LineSegmentsGeometry()
    geo.setPositions(pts)
    const mesh = new LineSegments2(geo, lineMat2(0xa855f7, 1.5))
    const stockLayerVisible = layers.find(l => l.key === 'stock')?.visible ?? true
    mesh.visible = stockLayerVisible
    scene.add(mesh)
    objectMap['stock'] = mesh
  }

  buildStockMesh(machine.stock)
  rebuildStock = buildStockMesh

  // Toolpath rendering — keyed in objectMap under 'travel', 'cutting', 'zmove' so
  // the existing layer toggle logic works automatically.
  const TOOLPATH_KEYS = ['travel', 'cutting', 'zmove'] as const

  function disposeToolpathObjects() {
    for (const key of TOOLPATH_KEYS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const old = objectMap[key] as any
      if (!old) continue
      scene.remove(old)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      old.traverse((child: any) => {
        child.geometry?.dispose()
        if (child.material) {
          const idx = lineMats.indexOf(child.material)
          if (idx !== -1) lineMats.splice(idx, 1)
          child.material.dispose()
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete objectMap[key]
    }
  }

  function tessellateArc(
    sx: number, sy: number, sz: number,
    ex: number, ey: number, ez: number,
    i: number, j: number, k: number,
    cw: boolean,
    plane: 'G17' | 'G18' | 'G19',
    numSegs = 32,
  ): Array<[number, number, number]> {
    // Map the arc plane to in-plane coordinates (pa, pb) and the off-plane linear axis.
    // G17 = XY plane (Z linear), G18 = XZ plane (Y linear), G19 = YZ plane (X linear).
    let pa0: number, pa1: number, pb0: number, pb1: number
    let oa: number, ob: number
    let lin0: number, lin1: number
    let makePt: (pa: number, pb: number, lin: number) => [number, number, number]

    if (plane === 'G18') {
      pa0 = sx; pa1 = ex; pb0 = sz; pb1 = ez
      oa = i; ob = k
      lin0 = sy; lin1 = ey
      makePt = (pa, pb, lin) => [pa, lin, pb]
    } else if (plane === 'G19') {
      pa0 = sy; pa1 = ey; pb0 = sz; pb1 = ez
      oa = j; ob = k
      lin0 = sx; lin1 = ex
      makePt = (pa, pb, lin) => [lin, pa, pb]
    } else {
      // G17 (default)
      pa0 = sx; pa1 = ex; pb0 = sy; pb1 = ey
      oa = i; ob = j
      lin0 = sz; lin1 = ez
      makePt = (pa, pb, lin) => [pa, pb, lin]
    }

    const cx = pa0 + oa
    const cy = pb0 + ob
    const r = Math.sqrt(oa * oa + ob * ob)
    const startAngle = Math.atan2(pb0 - cy, pa0 - cx)
    const endAngle = Math.atan2(pb1 - cy, pa1 - cx)
    // G17 CW (G2) carries +X→−Y = decreasing atan2 angle.
    // G18 CW (G2) carries +X→+Z = increasing atan2 angle (opposite sense).
    // G19 CW (G2) carries +Y→+Z = increasing atan2 angle (opposite sense).
    const sweepCw = plane === 'G17' ? cw : !cw
    let sweep: number
    if (sweepCw) {
      sweep = startAngle - endAngle
      if (sweep <= 0) sweep += 2 * Math.PI
    } else {
      sweep = endAngle - startAngle
      if (sweep <= 0) sweep += 2 * Math.PI
    }
    if (Math.hypot(pa1 - pa0, pb1 - pb0) < 1e-6) sweep = 2 * Math.PI
    const pts: Array<[number, number, number]> = []
    for (let n = 1; n <= numSegs; n++) {
      const t = n / numSegs
      const angle = sweepCw ? startAngle - t * sweep : startAngle + t * sweep
      pts.push(makePt(cx + r * Math.cos(angle), cy + r * Math.sin(angle), lin0 + (lin1 - lin0) * t))
    }
    return pts
  }

  function buildToolpathGeometry(vectors: Array<LineVector | null>) {
    disposeToolpathObjects()

    // Separate point arrays per layer
    const rapidPts: number[] = []
    const feedPts: number[] = []
    const zmovePts: number[] = []

    for (const vec of vectors) {
      if (!vec) continue
      if (vec.t === 'A') {
        // Tessellate arc into line segments
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pts = tessellateArc(vec.x0, vec.y0, vec.z0, vec.x1, vec.y1, vec.z1, vec.i, vec.j, (vec as any).k ?? 0, vec.cw, (vec as any).plane ?? 'G17')
        let px = vec.x0, py = vec.y0, pz = vec.z0
        for (const [nx, ny, nz] of pts) {
          feedPts.push(px, py, pz, nx, ny, nz)
          px = nx; py = ny; pz = nz
        }
      } else {
        const isZOnly = vec.x0 === vec.x1 && vec.y0 === vec.y1
        const arr = vec.t === 'R' ? rapidPts : isZOnly ? zmovePts : feedPts
        arr.push(vec.x0, vec.y0, vec.z0, vec.x1, vec.y1, vec.z1)
      }
    }

    if (rapidPts.length > 0) {
      const geo = new LineSegmentsGeometry()
      geo.setPositions(rapidPts)
      const obj = new LineSegments2(geo, lineMat2(0x22c55e, 1.0))
      obj.visible = layers.find(l => l.key === 'travel')?.visible ?? true
      scene.add(obj)
      objectMap['travel'] = obj
    }

    if (feedPts.length > 0) {
      const geo = new LineSegmentsGeometry()
      geo.setPositions(feedPts)
      const obj = new LineSegments2(geo, lineMat2(0x3b82f6, 1.5))
      obj.visible = layers.find(l => l.key === 'cutting')?.visible ?? true
      scene.add(obj)
      objectMap['cutting'] = obj
    }

    if (zmovePts.length > 0) {
      const geo = new LineSegmentsGeometry()
      geo.setPositions(zmovePts)
      const obj = new LineSegments2(geo, lineMat2(0xeab308, 1.0))
      obj.visible = layers.find(l => l.key === 'zmove')?.visible ?? true
      scene.add(obj)
      objectMap['zmove'] = obj
    }

    requestRender()
  }

  loadToolpathSegments = (vectors: Array<LineVector | null>) => buildToolpathGeometry(vectors)
  clearToolpath = () => { disposeToolpathObjects(); requestRender() }

  // Tool representation — unit CylinderGeometry (r=1, h=1), rotated so axis aligns with world Z.
  // scale.x/z = radius, scale.y = height. Tip placed at workPos.z, body extends upward.
  {
    const toolH = 50
    const toolGeo = new THREE.CylinderGeometry(1, 1, 1, 24)
    const toolMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.8 })
    const toolObj = new THREE.Mesh(toolGeo, toolMat)
    toolObj.rotation.x = -Math.PI / 2
    const r0 = toolDiameter.value / 2
    toolObj.scale.set(r0, toolH, r0)
    const wp0 = machine.workPos
    toolObj.position.set(wp0.x, wp0.y, wp0.z + toolH / 2)
    scene.add(toolObj)
    objectMap['tool'] = toolObj
  }

  threeCtx = { THREE, scene, camera, controls, renderer }
  setView('iso')

  // Demand-driven rendering: only render when something changes
  renderFrame = () => {
    animId = null
    if (!threeCtx) return
    controls.update()                       // advances damping; fires 'change' if still settling
    if (viewMode.value !== 'cam') {
      renderer.render(scene, camera)        // skip GPU work when canvas is invisible
    }
  }

  requestRender = () => {
    if (animId !== null) return             // frame already queued
    animId = requestAnimationFrame(renderFrame)
  }

  // Keeps the loop alive during OrbitControls damping:
  // update() → camera moves → 'change' fires → requestRender() → next frame
  // Loop stops naturally when damping fully settles
  controls.addEventListener('change', requestRender)

  // Re-render when switching back from cam-only mode
  watch(viewMode, (newMode, oldMode) => {
    if (newMode !== 'cam' && oldMode === 'cam') requestRender()
  })

  requestRender() // draw the initial frame

  // Resize — debounced so a continuous drag of the window/panel edge doesn't
  // recalculate camera/renderer/materials on every intermediate frame; wait
  // for the size to settle for 300ms before applying it.
  let resizeTimeout: ReturnType<typeof setTimeout> | null = null
  const applyResize = () => {
    resizeTimeout = null
    if (!container) return
    const { width: w, height: h } = container.getBoundingClientRect()
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    for (const m of lineMats) m.resolution.set(w, h)
    requestRender()
  }
  const ro = new ResizeObserver(() => {
    if (resizeTimeout !== null) clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(applyResize, 300)
  })
  ro.observe(container)
  removeResizeListener = () => {
    ro.disconnect()
    if (resizeTimeout !== null) clearTimeout(resizeTimeout)
  }

  // Resume rendering when the browser tab returns to the foreground
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') requestRender()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  removeVisibilityListener = () => document.removeEventListener('visibilitychange', onVisibilityChange)

  ready.value = true
}

function setView(view: ViewKey) {
  if (!threeCtx) return
  const { THREE, camera, controls } = threeCtx
  const b = machineBounds.value
  const d = Math.max(b.x, b.y, 50) * 1.8  // orbit target is origin — scale so work volume stays visible; min 50 prevents camera collapse to origin

  // All presets orbit around the machine home (work origin = 0,0,0)
  controls.target.set(0, 0, 0)
  switch (view) {
    case 'top':
      camera.position.set(0, 0, d)
      camera.up.set(0, 1, 0)
      break
    case 'front':
      camera.position.set(0, d, 0)
      camera.up.set(0, 0, 1)
      break
    case 'right':
      camera.position.set(d, 0, 0)
      camera.up.set(0, 0, 1)
      break
    case 'iso':
      camera.position.set(-d * 0.25, -d * 0.75, d * 0.45)
      camera.up.set(0, 0, 1)
      break
  }

  // In split mode the 3D canvas is full-width but only the left half is visible.
  // Pan the orbit target to the right so that world (0,0,0) projects to the
  // centre of the visible left half rather than the centre of the full canvas.
  if (viewMode.value === 'split' && containerRef.value) {
    const { width: w, height: h } = containerRef.value.getBoundingClientRect()
    if (w > 0 && h > 0) {
      camera.updateProjectionMatrix()
      const dist = camera.position.distanceTo(controls.target)
      const aspect = w / h
      const frustumHalfW = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect
      // Shift the target 0.5 NDC units to the right → (0,0,0) lands at NDC x = -0.5 = pixel w/4
      const lookDir = new THREE.Vector3()
      camera.getWorldDirection(lookDir)
      const camRight = new THREE.Vector3().crossVectors(lookDir, camera.up).normalize()
      const panDist = 0.5 * frustumHalfW
      controls.target.addScaledVector(camRight, panDist)
      camera.position.addScaledVector(camRight, panDist)
    }
  }

  controls.update()
  requestRender()
}

function toggleLayer(layer: (typeof layers)[number]) {
  layer.visible = !layer.visible
  const obj = objectMap[layer.key]
  if (obj) (obj as { visible: boolean }).visible = layer.visible
  requestRender()
}

// Update tool position when machine moves
watch(
  () => machine.workPos,
  (wp) => {
    const obj = objectMap['tool'] as { position: { set(x: number, y: number, z: number): void } } | undefined
    if (!obj) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = (objectMap['tool'] as any).scale.y as number
    obj.position.set(wp.x, wp.y, wp.z + h / 2)
    requestRender()
  },
  { deep: true }
)

// Recreate tool scale when the active tool's diameter changes
watch(toolDiameter, (d) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = objectMap['tool'] as any
  if (!obj) return
  const h = obj.scale.y as number
  obj.scale.set(d / 2, h, d / 2)
  requestRender()
})

// Rebuild grid, rulers, and boundary box when machine config loads or changes
watch(machineBounds, (b) => {
  rebuildSpatialGeometry(b)
  setView('iso')  // re-centre camera on the new work volume
}, { deep: true })

// Rebuild stock wireframe when the stock definition changes or is cleared
watch(() => machine.stock, (s) => {
  rebuildStock(s)
  requestRender()
})

// Slide the boundary box to track machine home in work coordinates (= wpos − mpos).
// This keeps the box correctly positioned when the operator sets a WCO (G54/G10).
watch(machineHomeWpos, (h) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const box = objectMap['machineBounds'] as any
  if (box) {
    box.position.set(h.x, h.y, h.z)
    requestRender()
  }
}, { deep: true })

// Fetch and render 3D path vectors when a job finishes loading.
// Clear the toolpath when the job is cleared.
let lastLoadedFileId: string | null = null

async function fetchAndLoadVectors(fileId: string) {
  try {
    const vectors = await $fetch<Array<LineVector | null>>(`/api/jobs/vectors?fileId=${encodeURIComponent(fileId)}`)
    loadToolpathSegments(vectors)
  } catch (err) {
    console.warn('[GCodeViewport] vectors not available:', err)
    toastError('Failed to load toolpath preview')
  }
}

watch(
  () => job.value?.status,
  async (status) => {
    if (status === 'loaded') {
      const fileId = job.value?.fileId
      if (!fileId || fileId === lastLoadedFileId) return
      // Skip if Three.js isn't initialised yet — onMounted will retry after initThree() resolves.
      if (!ready.value) return
      lastLoadedFileId = fileId
      await fetchAndLoadVectors(fileId)
    } else if (status === 'idle') {
      lastLoadedFileId = null
      clearToolpath()
    }
  },
  { immediate: true },
)

onMounted(async () => {
  await initThree()
  // If a job was already in 'loaded' state while Three.js was initialising, load its vectors now.
  const j = job.value
  if (j?.status === 'loaded' && j.fileId && j.fileId !== lastLoadedFileId) {
    lastLoadedFileId = j.fileId
    await fetchAndLoadVectors(j.fileId)
  }
})

onUnmounted(() => {
  if (animId !== null) cancelAnimationFrame(animId)
  removeRotateListeners?.()
  removeVisibilityListener?.()
  removeResizeListener?.()
  threeCtx?.renderer.dispose()
  threeCtx = null
})
</script>
