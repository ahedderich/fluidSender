<template>
  <svg viewBox="0 0 300 215" class="w-full h-auto">
    <defs>
      <marker id="dr-ah" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" :fill="c.arrow"/>
      </marker>
    </defs>

    <!-- Stock block: rectangular or cylindrical -->
    <template v-if="stockShape !== 'round'">
      <polygon :points="topFace"   :fill="c.top"   :stroke="c.edge" stroke-width="0.8"/>
      <polygon :points="rightFace" :fill="c.right" :stroke="c.edge" stroke-width="0.8"/>
      <polygon :points="frontFace" :fill="c.front" :stroke="c.edge" stroke-width="0.8"/>
    </template>
    <template v-else>
      <ellipse :cx="cylCenter.x" :cy="cylCenter.y + cylDepth" :rx="cylRx" :ry="cylRy"
        :fill="c.front" :stroke="c.edge" stroke-width="0.8"/>
      <line :x1="cylCenter.x - cylRx" :y1="cylCenter.y"
            :x2="cylCenter.x - cylRx" :y2="cylCenter.y + cylDepth"
            :stroke="c.edge" stroke-width="0.8"/>
      <line :x1="cylCenter.x + cylRx" :y1="cylCenter.y"
            :x2="cylCenter.x + cylRx" :y2="cylCenter.y + cylDepth"
            :stroke="c.edge" stroke-width="0.8"/>
      <ellipse :cx="cylCenter.x" :cy="cylCenter.y" :rx="cylRx" :ry="cylRy"
        :fill="c.top" :stroke="c.edge" stroke-width="0.8"/>
    </template>

    <!-- Highlighted edge face overlay -->
    <polygon :points="g.edgeFace" fill="#3b82f6" fill-opacity="0.12"/>

    <!-- Dashed vertical lines from probe dots down to edge surface -->
    <line v-for="(dot, i) in g.dots" :key="i"
      :x1="dot.above.x" :y1="dot.above.y" :x2="dot.surface.x" :y2="dot.surface.y"
      :stroke="c.arrow" stroke-width="1" stroke-dasharray="3,2"/>

    <!-- Probe dots -->
    <circle v-for="(dot, i) in g.dots" :key="`d${i}`"
      :cx="dot.above.x" :cy="dot.above.y" r="4" fill="#f59e0b" stroke="#d97706" stroke-width="1"/>

    <!-- Rotation arc annotation -->
    <path :d="g.arc" fill="none" :stroke="c.callout" stroke-width="1.5" stroke-dasharray="4,3"/>
    <text :x="g.arcLabel.x" :y="g.arcLabel.y" :fill="c.callout" font-size="8" text-anchor="middle">θ</text>

    <!-- Callout: safeHeightMm -->
    <g :class="hl === 'safeHeightMm' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'safeHeightMm' ? 0.15 : 1">
      <line :x1="shX - 4" :y1="shBot" :x2="shX + 4" :y2="shBot" :stroke="hlC('safeHeightMm')" stroke-width="1"/>
      <line :x1="shX" :y1="shBot" :x2="shX" :y2="shTop" :stroke="hlC('safeHeightMm')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="shX - 4" :y1="shTop" :x2="shX + 4" :y2="shTop" :stroke="hlC('safeHeightMm')" stroke-width="1"/>
      <text :x="shX - 7" :y="(shBot + shTop) / 2" :fill="hlC('safeHeightMm')"
        font-size="8" text-anchor="end" dominant-baseline="middle">safe h</text>
    </g>

    <!-- Callout: insideOffset -->
    <g :class="hl === 'insideOffset' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'insideOffset' ? 0.15 : 1">
      <line :x1="g.offFrom.x" :y1="g.offFrom.y" :x2="g.offTo.x" :y2="g.offTo.y"
        :stroke="hlC('insideOffset')" stroke-width="1" stroke-dasharray="3,2" marker-end="url(#dr-ah)"/>
      <text :x="(g.offFrom.x + g.offTo.x) / 2" :y="g.offFrom.y - 5"
        :fill="hlC('insideOffset')" font-size="8" text-anchor="middle">offset</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
  edge: 'top' | 'bottom' | 'left' | 'right'
  highlightedParam: string | null
  stockShape?: 'rect' | 'round'
}>()

const ui = useUiStore()
const hl = computed(() => props.highlightedParam)

function iso(x: number, y: number, z: number) {
  return { x: 148 + (x - y) * 38, y: 125 + (x + y) * 22 - z * 44 }
}
function pt(x: number, y: number, z: number) {
  const p = iso(x, y, z); return `${p.x},${p.y}`
}

const topFace   = `${pt(0,0,.85)} ${pt(2,0,.85)} ${pt(2,1,.85)} ${pt(0,1,.85)}`
const rightFace = `${pt(2,0,0)} ${pt(2,0,.85)} ${pt(2,1,.85)} ${pt(2,1,0)}`
const frontFace = `${pt(0,1,0)} ${pt(2,1,0)} ${pt(2,1,.85)} ${pt(0,1,.85)}`

// Cylinder geometry for round stock
const cylCenter = iso(1, 0.5, 0.85)
const cylRx = Math.round(38 * 0.5 * Math.SQRT2)
const cylRy = Math.round(22 * 0.5 * Math.SQRT2)
const cylDepth = Math.round(0.85 * 44)

// Edge config: 3 probe points along each edge at insideOffset=0.3 from corners
const EDGES = {
  top:    { pts: [[0.3, 0.1], [1, 0.1], [1.7, 0.1]],   face: `${pt(0,0,.85)} ${pt(2,0,.85)} ${pt(2,0,0)} ${pt(0,0,0)}`, arcX: 1.85, arcY: 0.05 },
  bottom: { pts: [[0.3, 0.9], [1, 0.9], [1.7, 0.9]],   face: `${pt(0,1,.85)} ${pt(2,1,.85)} ${pt(2,1,0)} ${pt(0,1,0)}`, arcX: 1.85, arcY: 0.95 },
  left:   { pts: [[0.1, 0.3], [0.1, 0.5], [0.1, 0.7]], face: `${pt(0,0,.85)} ${pt(0,1,.85)} ${pt(0,1,0)} ${pt(0,0,0)}`, arcX: 0.05, arcY: 0.85 },
  right:  { pts: [[1.9, 0.3], [1.9, 0.5], [1.9, 0.7]], face: `${pt(2,0,.85)} ${pt(2,1,.85)} ${pt(2,1,0)} ${pt(2,0,0)}`, arcX: 1.95, arcY: 0.15 },
} as const

const probeZ = 1.2

const g = computed(() => {
  const cfg = EDGES[props.edge]
  const dots = cfg.pts.map(([x, y]) => ({
    above:   iso(x, y, probeZ),
    surface: iso(x, y, 0.85),
  }))

  const edgeFace = cfg.face

  // Rotation arc: small arc near one corner of the edge
  const arcPivot = iso(cfg.arcX, cfg.arcY, 0.85)
  const r = 12
  const arc = `M${arcPivot.x + r},${arcPivot.y} A${r},${r} 0 0,0 ${arcPivot.x},${arcPivot.y - r}`
  const arcLabel = { x: arcPivot.x + r + 4, y: arcPivot.y - r / 2 }

  // insideOffset arrow: from corner to first probe point (horizontal)
  const isHoriz = props.edge === 'top' || props.edge === 'bottom'
  const edgeStr: string = props.edge
  const offFrom = isHoriz
    ? iso(edgeStr === 'right' ? 2 : 0, cfg.pts[0][1], probeZ)
    : iso(cfg.pts[0][0], edgeStr === 'bottom' ? 1 : 0, probeZ)
  const offTo   = iso(cfg.pts[0][0], cfg.pts[0][1], probeZ)

  return { dots, edgeFace, arc, arcLabel, offFrom, offTo }
})

// safeHeight callout
const shAnchor = (z: number) => iso(-0.35, 0.12, z)
const shTop = shAnchor(probeZ).y
const shBot = shAnchor(0.85).y
const shX   = shAnchor(0).x

const c = computed(() => {
  const d = ui.darkMode
  return {
    top:   d ? '#334155' : '#e2e8f0',
    right: d ? '#293548' : '#cbd5e1',
    front: d ? '#2a3444' : '#d1d5db',
    edge:  d ? '#475569' : '#94a3b8',
    arrow: '#3b82f6',
    callout: d ? '#64748b' : '#94a3b8',
    calloutActive: '#3b82f6',
  }
})

function hlC(param: string) {
  return hl.value === param ? c.value.calloutActive : c.value.callout
}
</script>
