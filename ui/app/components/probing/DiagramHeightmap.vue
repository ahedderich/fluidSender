<template>
  <svg viewBox="0 0 300 215" class="w-full h-auto">
    <defs>
      <marker id="dhm-ah" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" :fill="c.arrow"/>
      </marker>
    </defs>

    <!-- Stock block -->
    <polygon :points="topFace"   :fill="c.top"   :stroke="c.edge" stroke-width="0.8"/>
    <polygon :points="rightFace" :fill="c.right" :stroke="c.edge" stroke-width="0.8"/>
    <polygon :points="frontFace" :fill="c.front" :stroke="c.edge" stroke-width="0.8"/>

    <!-- Grid dots on top face -->
    <circle v-for="(dot, i) in gridDots" :key="i"
      :cx="dot.x" :cy="dot.y" r="2.5" :fill="c.dot"/>

    <!-- Probe descent arrow above first dot -->
    <line :x1="probeAbove.x" :y1="probeAbove.y"
          :x2="gridDots[0]?.x ?? probeAbove.x" :y2="gridDots[0]?.y ?? probeAbove.y"
      :stroke="c.arrow" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dhm-ah)"/>
    <circle :cx="probeAbove.x" :cy="probeAbove.y" r="4.5" fill="#f59e0b" stroke="#d97706" stroke-width="1"/>

    <!-- Callout: safeHeightMm -->
    <g :class="hl === 'safeHeightMm' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'safeHeightMm' ? 0.15 : 1">
      <line :x1="shX - 4" :y1="shBot" :x2="shX + 4" :y2="shBot" :stroke="hlC('safeHeightMm')" stroke-width="1"/>
      <line :x1="shX" :y1="shBot" :x2="shX" :y2="shTop" :stroke="hlC('safeHeightMm')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="shX - 4" :y1="shTop" :x2="shX + 4" :y2="shTop" :stroke="hlC('safeHeightMm')" stroke-width="1"/>
      <text :x="shX - 7" :y="(shBot + shTop) / 2" :fill="hlC('safeHeightMm')"
        font-size="8" text-anchor="end" dominant-baseline="middle">safe h</text>
    </g>

    <!-- Callout: buffer (probe range) -->
    <g :class="hl === 'buffer' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'buffer' ? 0.15 : 1">
      <line :x1="bufX - 4" :y1="bufBot" :x2="bufX + 4" :y2="bufBot" :stroke="hlC('buffer')" stroke-width="1"/>
      <line :x1="bufX" :y1="bufBot" :x2="bufX" :y2="bufTop" :stroke="hlC('buffer')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="bufX - 4" :y1="bufTop" :x2="bufX + 4" :y2="bufTop" :stroke="hlC('buffer')" stroke-width="1"/>
      <text :x="bufX + 7" :y="(bufBot + bufTop) / 2" :fill="hlC('buffer')"
        font-size="8" text-anchor="start" dominant-baseline="middle">range</text>
    </g>

    <!-- Callout: edgeOffset (from stock edge to nearest grid row) -->
    <g :class="hl === 'edgeOffset' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'edgeOffset' ? 0.15 : 1">
      <line :x1="eoCallout.from.x - 3" :y1="eoCallout.from.y - 1" :x2="eoCallout.from.x + 3" :y2="eoCallout.from.y + 1"
        :stroke="hlC('edgeOffset')" stroke-width="1"/>
      <line :x1="eoCallout.from.x" :y1="eoCallout.from.y" :x2="eoCallout.to.x" :y2="eoCallout.to.y"
        :stroke="hlC('edgeOffset')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="eoCallout.to.x - 3" :y1="eoCallout.to.y - 1" :x2="eoCallout.to.x + 3" :y2="eoCallout.to.y + 1"
        :stroke="hlC('edgeOffset')" stroke-width="1"/>
      <text :x="(eoCallout.from.x + eoCallout.to.x) / 2 - 2" :y="(eoCallout.from.y + eoCallout.to.y) / 2 + 9"
        :fill="hlC('edgeOffset')" font-size="8" text-anchor="middle">edge off</text>
    </g>

    <!-- Callout: resolution (between adjacent dots) -->
    <g v-if="resCallout" :class="hl === 'resolution' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'resolution' ? 0.15 : 1">
      <line :x1="resCallout.from.x - 3" :y1="resCallout.from.y - 1" :x2="resCallout.from.x + 3" :y2="resCallout.from.y + 1"
        :stroke="hlC('resolution')" stroke-width="1"/>
      <line :x1="resCallout.from.x" :y1="resCallout.from.y" :x2="resCallout.to.x" :y2="resCallout.to.y"
        :stroke="hlC('resolution')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="resCallout.to.x - 3" :y1="resCallout.to.y - 1" :x2="resCallout.to.x + 3" :y2="resCallout.to.y + 1"
        :stroke="hlC('resolution')" stroke-width="1"/>
      <text :x="(resCallout.from.x + resCallout.to.x) / 2 + 4" :y="(resCallout.from.y + resCallout.to.y) / 2 + 9"
        :fill="hlC('resolution')" font-size="8" text-anchor="middle">res</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
  highlightedParam: string | null
  stockWidth: number
  stockHeight: number
  edgeOffset: number
  resolution: number
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

// Reactive grid dots matching server-side formula from _runHeightmap
const gridDots = computed(() => {
  const W = props.stockWidth
  const H = props.stockHeight
  const eo = props.edgeOffset
  const res = props.resolution

  const effW = W - 2 * eo
  const effH = H - 2 * eo
  const colCount = Math.max(2, Math.floor(effW / res) + 1)
  const rowCount = Math.max(2, Math.floor(effH / res) + 1)
  const spacingX = effW / (colCount - 1)
  const spacingY = effH / (rowCount - 1)

  const dots: { x: number; y: number }[] = []
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const mmX = -effW / 2 + c * spacingX
      const mmY = -effH / 2 + r * spacingY
      const modelX = 1 + (mmX / W) * 2
      const modelY = 0.5 + (mmY / H) * 1
      dots.push(iso(modelX, modelY, 0.85))
    }
  }
  return dots.slice(0, 200)
})

const probeAbove = computed(() => {
  const first = gridDots.value[0]
  if (!first) return iso(1, 0.25, 1.45)
  return { x: first.x, y: first.y - 30 }
})

// safeHeight callout
const shAnchor = (z: number) => iso(-0.35, 0.12, z)
const shTop = shAnchor(1.45).y
const shBot = shAnchor(0.85).y
const shX   = shAnchor(0).x

// Buffer callout: extra height above safe height (taller arrow)
const bufAnchor = (z: number) => iso(-0.6, 0.12, z)
const bufTop = bufAnchor(1.8).y
const bufBot = bufAnchor(1.45).y
const bufX   = bufAnchor(0).x

// edgeOffset callout: from stock front edge to first grid row
const eoCallout = computed(() => {
  const H_model = 1
  const eoNorm = (props.edgeOffset / props.stockHeight) * H_model
  const from = iso(0.5, H_model, 0.85)
  const to   = iso(0.5, H_model - eoNorm, 0.85)
  return { from, to }
})

// resolution callout: between first two adjacent dots
const resCallout = computed(() => {
  const dots = gridDots.value
  if (dots.length < 2) return null
  return { from: dots[0]!, to: dots[1]! }
})

const c = computed(() => {
  const d = ui.darkMode
  return {
    top:   d ? '#334155' : '#e2e8f0',
    right: d ? '#293548' : '#cbd5e1',
    front: d ? '#2a3444' : '#d1d5db',
    edge:  d ? '#475569' : '#94a3b8',
    dot:   d ? '#60a5fa' : '#3b82f6',
    arrow: '#3b82f6',
    callout: d ? '#64748b' : '#94a3b8',
    calloutActive: '#3b82f6',
  }
})

function hlC(param: string) {
  return hl.value === param ? c.value.calloutActive : c.value.callout
}
</script>
