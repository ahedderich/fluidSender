<template>
  <svg viewBox="0 0 300 215" class="w-full h-auto">
    <defs>
      <marker id="dco-ah" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
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

    <!-- WCS origin crosshair at center of stock top -->
    <g :transform="`translate(${centerPt.x},${centerPt.y})`">
      <line x1="-7" y1="0" x2="7" y2="0" stroke="#10b981" stroke-width="1.5"/>
      <line x1="0" y1="-7" x2="0" y2="7" stroke="#10b981" stroke-width="1.5"/>
    </g>

    <!-- Approach arrows from outside each edge toward center -->
    <!-- X- (from left) -->
    <line :x1="g.xNeg.x" :y1="g.xNeg.y" :x2="centerPt.x" :y2="centerPt.y"
      :stroke="c.arrow" :stroke-opacity="props.skipX ? 0.3 : 1"
      stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dco-ah)"/>
    <!-- X+ (from right) -->
    <line :x1="g.xPos.x" :y1="g.xPos.y" :x2="centerPt.x" :y2="centerPt.y"
      :stroke="c.arrow" :stroke-opacity="props.skipX ? 0.3 : 1"
      stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dco-ah)"/>
    <!-- Y- (from back) -->
    <line :x1="g.yNeg.x" :y1="g.yNeg.y" :x2="centerPt.x" :y2="centerPt.y"
      :stroke="c.arrow" :stroke-opacity="props.skipY ? 0.3 : 1"
      stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dco-ah)"/>
    <!-- Y+ (from front) -->
    <line :x1="g.yPos.x" :y1="g.yPos.y" :x2="centerPt.x" :y2="centerPt.y"
      :stroke="c.arrow" :stroke-opacity="props.skipY ? 0.3 : 1"
      stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dco-ah)"/>

    <!-- Probe above center -->
    <circle :cx="probePt.x" :cy="probePt.y" r="5" fill="#f59e0b" stroke="#d97706" stroke-width="1"/>

    <!-- Callout: safeHeightMm -->
    <g :class="hl === 'safeHeightMm' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'safeHeightMm' ? 0.15 : 1">
      <line :x1="shX - 4" :y1="shBot" :x2="shX + 4" :y2="shBot" :stroke="hlC('safeHeightMm')" stroke-width="1"/>
      <line :x1="shX" :y1="shBot" :x2="shX" :y2="shTop" :stroke="hlC('safeHeightMm')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="shX - 4" :y1="shTop" :x2="shX + 4" :y2="shTop" :stroke="hlC('safeHeightMm')" stroke-width="1"/>
      <text :x="shX - 7" :y="(shBot + shTop) / 2" :fill="hlC('safeHeightMm')"
        font-size="8" text-anchor="end" dominant-baseline="middle">safe h</text>
    </g>

    <!-- Callout: buffer (from stock edge outward to arrow origin) -->
    <g :class="hl === 'buffer' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'buffer' ? 0.15 : 1">
      <line :x1="bufEdge.x - 3" :y1="bufEdge.y - 2" :x2="bufEdge.x + 3" :y2="bufEdge.y + 2"
        :stroke="hlC('buffer')" stroke-width="1"/>
      <line :x1="bufEdge.x" :y1="bufEdge.y" :x2="g.yNeg.x" :y2="g.yNeg.y"
        :stroke="hlC('buffer')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="g.yNeg.x - 3" :y1="g.yNeg.y - 2" :x2="g.yNeg.x + 3" :y2="g.yNeg.y + 2"
        :stroke="hlC('buffer')" stroke-width="1"/>
      <text :x="(bufEdge.x + g.yNeg.x) / 2 + 12" :y="(bufEdge.y + g.yNeg.y) / 2"
        :fill="hlC('buffer')" font-size="8" text-anchor="middle" dominant-baseline="middle">buf</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
  skipX: boolean
  skipY: boolean
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

const centerPt = iso(1, 0.5, 0.85)
const probePt  = iso(1, 0.5, 1.55)

// Cylinder geometry for round stock
const cylCenter = iso(1, 0.5, 0.85)
const cylRx = Math.round(38 * 0.5 * Math.SQRT2)
const cylRy = Math.round(22 * 0.5 * Math.SQRT2)
const cylDepth = Math.round(0.85 * 44)

const g = {
  xNeg: iso(-0.5, 0.5, 0.85),  // from X- side
  xPos: iso( 2.5, 0.5, 0.85),  // from X+ side
  yNeg: iso( 1,  -0.5, 0.85),  // from Y- side (back)
  yPos: iso( 1,   1.5, 0.85),  // from Y+ side (front)
}

// safeHeight callout at fixed back-left position
const shAnchor = (z: number) => iso(-0.35, 0.12, z)
const shTop = shAnchor(1.55).y
const shBot = shAnchor(0.85).y
const shX   = shAnchor(0).x

// Buffer callout: Y=0 edge to yNeg arrow origin
const bufEdge = iso(1, 0, 0.85)

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
