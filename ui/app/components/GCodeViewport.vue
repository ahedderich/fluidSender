<template>
  <div ref="containerRef" class="relative bg-slate-950 dark:bg-slate-950 bg-gray-100 rounded-lg overflow-hidden">
    <canvas ref="canvasRef" class="w-full h-full block" />

    <!-- Loading -->
    <div v-if="!ready" class="absolute inset-0 flex items-center justify-center">
      <div class="text-slate-500 dark:text-slate-500 text-gray-400 text-sm">Initializing 3D viewport...</div>
    </div>

    <!-- View presets (top-left) -->
    <div class="absolute top-2.5 left-2.5 flex gap-1.5 z-10">
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
        <span class="w-3 h-0.5 rounded-full inline-block" :style="{ backgroundColor: layer.color }" />
        <span class="text-slate-300">{{ layer.label }}</span>
      </button>
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

// Three.js refs (non-reactive — plain refs to avoid proxy issues)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let threeCtx: any = null
let animId: number | null = null
const objectMap: Record<string, unknown> = {}

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
  controls.target.set(100, 75, 0)

  // Grid (XY plane, Z=0)
  const gridHelper = new THREE.GridHelper(600, 30, 0x1e293b, 0x1e293b)
  gridHelper.rotation.x = Math.PI / 2
  gridHelper.position.set(100, 75, 0)
  scene.add(gridHelper)

  // Axes helper at origin
  const axes = new THREE.AxesHelper(35)
  scene.add(axes)

  // Stock outline: 200 × 150 × 25 mm box
  const stockGeo = new THREE.BoxGeometry(200, 150, 25)
  const stockEdges = new THREE.EdgesGeometry(stockGeo)
  const stockMesh = new THREE.LineSegments(stockEdges, new THREE.LineBasicMaterial({ color: 0xa855f7 }))
  stockMesh.position.set(100, 75, -12.5)
  scene.add(stockMesh)
  objectMap['stock'] = stockMesh

  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  // Travel moves (green) — rapid moves above stock
  const travelPts = [
    V3(0, 0, 30), V3(200, 0, 30),
    V3(200, 0, 30), V3(200, 150, 30),
    V3(200, 150, 30), V3(0, 150, 30),
    V3(0, 150, 30), V3(0, 0, 30),
    V3(0, 0, 30), V3(30, 30, 30),
    V3(80, 60, 30), V3(200, 150, 30),
  ]
  const travelLine = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(travelPts),
    new THREE.LineBasicMaterial({ color: 0x22c55e }),
  )
  scene.add(travelLine)
  objectMap['travel'] = travelLine

  // Z moves (yellow) — plunge / retract at key positions
  const zPts = [
    V3(0, 0, 30), V3(0, 0, -5),
    V3(200, 150, 30), V3(200, 150, -5),
    V3(30, 30, 30), V3(30, 30, -5),
    V3(80, 60, 30), V3(80, 60, -5),
    V3(120, 90, 30), V3(120, 90, -5),
    V3(170, 120, 30), V3(170, 120, -5),
  ]
  const zLine = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(zPts),
    new THREE.LineBasicMaterial({ color: 0xeab308 }),
  )
  scene.add(zLine)
  objectMap['zmove'] = zLine

  // Cutting moves (blue) — outer profile + pocket + circles
  const cutPts: THREE.Vector3[] = []

  // Outer profile
  const outerProfile = [
    [5, 5], [195, 5], [195, 145], [5, 145], [5, 5],
  ] as [number, number][]
  for (let i = 0; i < outerProfile.length - 1; i++) {
    cutPts.push(V3(outerProfile[i][0], outerProfile[i][1], -5))
    cutPts.push(V3(outerProfile[i + 1][0], outerProfile[i + 1][1], -5))
  }

  // Inner pocket
  const pocket = [
    [30, 30], [170, 30], [170, 120], [30, 120], [30, 30],
  ] as [number, number][]
  for (let i = 0; i < pocket.length - 1; i++) {
    cutPts.push(V3(pocket[i][0], pocket[i][1], -5))
    cutPts.push(V3(pocket[i + 1][0], pocket[i + 1][1], -5))
  }

  // Slot
  const slot = [
    [80, 55], [120, 55], [120, 95], [80, 95], [80, 55],
  ] as [number, number][]
  for (let i = 0; i < slot.length - 1; i++) {
    cutPts.push(V3(slot[i][0], slot[i][1], -15))
    cutPts.push(V3(slot[i + 1][0], slot[i + 1][1], -15))
  }

  // Spiral finishing passes (inner pocket)
  for (let r = 8; r <= 60; r += 6) {
    const segs = 48
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2
      const a1 = ((s + 1) / segs) * Math.PI * 2
      cutPts.push(V3(100 + r * Math.cos(a0), 75 + r * Math.sin(a0), -5))
      cutPts.push(V3(100 + r * Math.cos(a1), 75 + r * Math.sin(a1), -5))
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

  // Animation loop
  const animate = () => {
    animId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  // Resize
  const ro = new ResizeObserver(() => {
    if (!container) return
    const { width: w, height: h } = container.getBoundingClientRect()
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  ro.observe(container)

  ready.value = true
}

function setView(view: ViewKey) {
  if (!threeCtx) return
  const { camera, controls } = threeCtx
  const cx = 100, cy = 75, cz = 0
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
      camera.position.set(cx + 300, cy - 220, cz + 190)
      camera.up.set(0, 0, 1)
      break
  }
  controls.target.set(cx, cy, cz)
  controls.update()
}

function toggleLayer(layer: (typeof layers)[number]) {
  layer.visible = !layer.visible
  const obj = objectMap[layer.key]
  if (obj) (obj as { visible: boolean }).visible = layer.visible
}

onMounted(() => initThree())

onUnmounted(() => {
  if (animId !== null) cancelAnimationFrame(animId)
  threeCtx?.renderer.dispose()
  threeCtx = null
})
</script>
