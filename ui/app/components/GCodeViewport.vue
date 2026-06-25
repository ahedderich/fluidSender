<template>
  <div ref="containerRef" class="relative bg-gray-100 dark:bg-slate-950 rounded-lg overflow-hidden">
    <!-- 3D canvas — always full container, hidden only in cam-only mode -->
    <canvas
      ref="canvasRef"
      class="block"
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
      <div class="text-center">
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

    <!-- Active tool (bottom-left, above progress bar) -->
    <div
      v-if="currentTool"
      class="absolute bottom-14 left-2.5 z-10 flex items-center gap-2 px-2.5 py-1.5 bg-slate-800/80 backdrop-blur-sm border border-slate-600/50 rounded-md text-xs"
    >
      <span class="font-bold text-amber-400">T{{ currentTool.number }}</span>
      <span class="text-slate-300">{{ currentTool.description }}</span>
    </div>

    <!-- Progress bar (bottom) -->
    <div class="absolute bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-sm border-t border-slate-700/50 px-4 py-2 z-10">
      <div class="flex items-center justify-between text-xs text-slate-400 mb-1.5">
        <span>{{ startLabel }}</span>
        <span class="font-medium text-slate-200">
          {{ machine.job?.progress ?? 0 }}%
          <span v-if="machine.job?.filename" class="text-slate-400 ml-1">({{ machine.job.filename }})</span>
        </span>
        <span>{{ etaLabel }}</span>
      </div>
      <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-blue-500 rounded-full transition-all duration-500"
          :style="{ width: (machine.job?.progress ?? 0) + '%' }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'

const machine = useMachineStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const ready = ref(false)

type CamMode = '3d' | 'split' | 'cam' | 'pip'
const viewMode = ref<CamMode>('3d')
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
])

const startLabel = computed(() => {
  if (!machine.job?.startTime) return 'Start: --:--'
  return `Start: ${new Date(machine.job.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
})

const etaLabel = computed(() => {
  if (!machine.job?.startTime || !machine.job.estimatedRuntime) return 'ETA: --:--'
  const eta = machine.job.startTime + machine.job.estimatedRuntime * 1000
  return `ETA: ${new Date(eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
})

const currentTool = computed(() => {
  if (!machine.tools.length) return null
  const line = machine.job?.currentLine ?? 0
  return (
    machine.tools.find(t => line >= t.lineStart && line <= t.lineEnd) ??
    machine.tools[0]
  )
})

// Three.js refs (non-reactive — plain refs to avoid proxy issues)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let threeCtx: any = null
let animId: number | null = null
const objectMap: Record<string, unknown> = {}
let removeRotateListeners: (() => void) | null = null
let removeVisibilityListener: (() => void) | null = null

// No-op defaults until initThree() assigns real implementations
let requestRender: () => void = () => {}
let renderFrame: () => void = () => {}

async function initThree() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — resolved via importmap at runtime; Vite skips bundling with /* @vite-ignore */
  const THREE = await import(/* @vite-ignore */ 'three')
  // @ts-ignore
  const { OrbitControls } = await import(/* @vite-ignore */ 'three/examples/jsm/controls/OrbitControls.js')

  const { width, height } = container.getBoundingClientRect()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020617) // slate-950

  const camera = new THREE.PerspectiveCamera(45, width / (height || 1), 0.1, 10000)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height || 400)

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

  // Grid (XY plane, Z=0)
  const gridHelper = new THREE.GridHelper(600, 30, 0x1e293b, 0x1e293b)
  gridHelper.rotation.x = Math.PI / 2
  gridHelper.position.set(0, 0, 0)
  scene.add(gridHelper)

  // Origin axes: X (red) + Y (green) with tick marks and labels
  const originGroup = new THREE.Group()
  const axisExt = 500   // ± extent in mm
  const tickStep = 100  // label every 100 mm
  const tickLen = 8

  // Canvas sprite helper — always faces camera, renders on top
  function makeLabel(text: string, color: string, fontPx = 22) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 64
    const ctx2d = canvas.getContext('2d')!
    ctx2d.font = `bold ${fontPx}px monospace`
    ctx2d.fillStyle = color
    ctx2d.textAlign = 'center'
    ctx2d.textBaseline = 'middle'
    ctx2d.fillText(text, canvas.width / 2, canvas.height / 2)
    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.renderOrder = 1
    return sprite
  }

  // X axis line (red), −500 → +500
  originGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([V3(-axisExt, 0, 0), V3(axisExt, 0, 0)]),
    new THREE.LineBasicMaterial({ color: 0xef4444 }),
  ))

  // X ticks + number labels (both sides, skip 0)
  const xTickPts: THREE.Vector3[] = []
  for (let x = -axisExt; x <= axisExt; x += tickStep) {
    if (x === 0) continue
    xTickPts.push(V3(x, 0, 0), V3(x, -tickLen, 0))
    const lbl = makeLabel(`${x}`, '#ef4444')
    lbl.scale.set(20, 10, 1)
    lbl.position.set(x, -20, 0)
    originGroup.add(lbl)
  }
  originGroup.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(xTickPts),
    new THREE.LineBasicMaterial({ color: 0xef4444 }),
  ))

  // X axis label near origin
  const xLabel = makeLabel('X', '#ef4444', 32)
  xLabel.scale.set(16, 8, 1)
  xLabel.position.set(30, 16, 0)
  originGroup.add(xLabel)

  // Y axis line (green), −500 → +500
  originGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([V3(0, -axisExt, 0), V3(0, axisExt, 0)]),
    new THREE.LineBasicMaterial({ color: 0x22c55e }),
  ))

  // Y ticks + number labels (both sides, skip 0)
  const yTickPts: THREE.Vector3[] = []
  for (let y = -axisExt; y <= axisExt; y += tickStep) {
    if (y === 0) continue
    yTickPts.push(V3(0, y, 0), V3(-tickLen, y, 0))
    const lbl = makeLabel(`${y}`, '#22c55e')
    lbl.scale.set(20, 10, 1)
    lbl.position.set(-20, y, 0)
    originGroup.add(lbl)
  }
  originGroup.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(yTickPts),
    new THREE.LineBasicMaterial({ color: 0x22c55e }),
  ))

  // Y axis label near origin
  const yLabel = makeLabel('Y', '#22c55e', 32)
  yLabel.scale.set(16, 8, 1)
  yLabel.position.set(16, 30, 0)
  originGroup.add(yLabel)

  scene.add(originGroup)
  objectMap['origin'] = originGroup

  // Stock outline: 200 × 150 × 25 mm box, centred at origin (Z top = 0)
  const stockGeo = new THREE.BoxGeometry(200, 150, 25)
  const stockEdges = new THREE.EdgesGeometry(stockGeo)
  const stockMesh = new THREE.LineSegments(stockEdges, new THREE.LineBasicMaterial({ color: 0xa855f7 }))
  stockMesh.position.set(0, 0, -12.5)
  scene.add(stockMesh)
  objectMap['stock'] = stockMesh

  // Travel moves (green) — rapid moves above stock (stock centred at origin)
  const travelPts = [
    V3(-100, -75, 30), V3(100, -75, 30),
    V3(100, -75, 30),  V3(100, 75, 30),
    V3(100, 75, 30),   V3(-100, 75, 30),
    V3(-100, 75, 30),  V3(-100, -75, 30),
    V3(-100, -75, 30), V3(-70, -45, 30),
    V3(-20, -15, 30),  V3(100, 75, 30),
  ]
  const travelLine = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(travelPts),
    new THREE.LineBasicMaterial({ color: 0x22c55e }),
  )
  scene.add(travelLine)
  objectMap['travel'] = travelLine

  // Z moves (yellow) — plunge / retract at key positions
  const zPts = [
    V3(-100, -75, 30), V3(-100, -75, -5),
    V3(100, 75, 30),   V3(100, 75, -5),
    V3(-70, -45, 30),  V3(-70, -45, -5),
    V3(-20, -15, 30),  V3(-20, -15, -5),
    V3(20, 15, 30),    V3(20, 15, -5),
    V3(70, 45, 30),    V3(70, 45, -5),
  ]
  const zLine = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(zPts),
    new THREE.LineBasicMaterial({ color: 0xeab308 }),
  )
  scene.add(zLine)
  objectMap['zmove'] = zLine

  // Cutting moves (blue) — outer profile + pocket + slot + spiral
  const cutPts: THREE.Vector3[] = []

  // Outer profile (5 mm inset from stock edges)
  const outerProfile = [
    [-95, -70], [95, -70], [95, 70], [-95, 70], [-95, -70],
  ] as [number, number][]
  for (let i = 0; i < outerProfile.length - 1; i++) {
    cutPts.push(V3(outerProfile[i][0], outerProfile[i][1], -5))
    cutPts.push(V3(outerProfile[i + 1][0], outerProfile[i + 1][1], -5))
  }

  // Inner pocket
  const pocket = [
    [-70, -45], [70, -45], [70, 45], [-70, 45], [-70, -45],
  ] as [number, number][]
  for (let i = 0; i < pocket.length - 1; i++) {
    cutPts.push(V3(pocket[i][0], pocket[i][1], -5))
    cutPts.push(V3(pocket[i + 1][0], pocket[i + 1][1], -5))
  }

  // Slot (centred at origin)
  const slot = [
    [-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20],
  ] as [number, number][]
  for (let i = 0; i < slot.length - 1; i++) {
    cutPts.push(V3(slot[i][0], slot[i][1], -15))
    cutPts.push(V3(slot[i + 1][0], slot[i + 1][1], -15))
  }

  // Spiral finishing passes (centred at origin)
  for (let r = 8; r <= 60; r += 6) {
    const segs = 48
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2
      const a1 = ((s + 1) / segs) * Math.PI * 2
      cutPts.push(V3(r * Math.cos(a0), r * Math.sin(a0), -5))
      cutPts.push(V3(r * Math.cos(a1), r * Math.sin(a1), -5))
    }
  }

  const cutLine = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(cutPts),
    new THREE.LineBasicMaterial({ color: 0x3b82f6 }),
  )
  scene.add(cutLine)
  objectMap['cutting'] = cutLine

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

  // Resize
  const ro = new ResizeObserver(() => {
    if (!container) return
    const { width: w, height: h } = container.getBoundingClientRect()
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    requestRender()
  })
  ro.observe(container)

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
  const { camera, controls } = threeCtx
  const cx = 0, cy = 0, cz = 0
  const d = 420
  switch (view) {
    case 'top':
      camera.position.set(cx, cy, d)
      camera.up.set(0, 1, 0)
      break
    case 'front':
      camera.position.set(cx, cy - d, cz + 80)
      camera.up.set(0, 0, 1)
      break
    case 'right':
      camera.position.set(cx + d, cy, cz + 80)
      camera.up.set(0, 0, 1)
      break
    case 'iso':
      camera.position.set(cx - 150, cy - 350, cz + 190)
      camera.up.set(0, 0, 1)
      break
  }
  controls.target.set(cx, cy, cz)
  controls.update()
  requestRender()
}

function toggleLayer(layer: (typeof layers)[number]) {
  layer.visible = !layer.visible
  const obj = objectMap[layer.key]
  if (obj) (obj as { visible: boolean }).visible = layer.visible
  requestRender()
}

onMounted(() => initThree())

onUnmounted(() => {
  if (animId !== null) cancelAnimationFrame(animId)
  removeRotateListeners?.()
  removeVisibilityListener?.()
  threeCtx?.renderer.dispose()
  threeCtx = null
})
</script>
