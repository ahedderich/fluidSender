<template>
  <svg viewBox="0 0 300 215" class="w-full h-auto">
    <defs>
      <marker id="dc-ah" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
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
      <!-- Cylinder: bottom ellipse, side tangent lines, top ellipse -->
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

    <!-- Selected corner highlight -->
    <circle :cx="g.cornerTop.x" :cy="g.cornerTop.y" r="13" fill="#3b82f6" fill-opacity="0.18"/>

    <!-- WCS origin crosshair at corner -->
    <g :transform="`translate(${g.cornerTop.x},${g.cornerTop.y})`">
      <line x1="-7" y1="0" x2="7" y2="0" stroke="#10b981" stroke-width="1.5"/>
      <line x1="0" y1="-7" x2="0" y2="7" stroke="#10b981" stroke-width="1.5"/>
    </g>

    <!-- Approach arrows -->
    <line :x1="g.xFrom.x" :y1="g.xFrom.y" :x2="g.xTo.x" :y2="g.xTo.y"
      :stroke="c.arrow" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dc-ah)"/>
    <line :x1="g.yFrom.x" :y1="g.yFrom.y" :x2="g.yTo.x" :y2="g.yTo.y"
      :stroke="c.arrow" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dc-ah)"/>
    <line :x1="g.zFrom.x" :y1="g.zFrom.y" :x2="g.zTo.x" :y2="g.zTo.y"
      :stroke="c.arrowZ" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dc-ah)"/>

    <!-- Probe dot -->
    <circle :cx="g.probe.x" :cy="g.probe.y" r="5" fill="#f59e0b" stroke="#d97706" stroke-width="1"/>

    <!-- Callout: safeHeightMm -->
    <g :class="hl === 'safeHeightMm' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'safeHeightMm' ? 0.15 : 1">
      <line :x1="g.shX - 4" :y1="g.shBot" :x2="g.shX + 4" :y2="g.shBot" :stroke="hlC('safeHeightMm')" stroke-width="1"/>
      <line :x1="g.shX" :y1="g.shBot" :x2="g.shX" :y2="g.shTop" :stroke="hlC('safeHeightMm')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="g.shX - 4" :y1="g.shTop" :x2="g.shX + 4" :y2="g.shTop" :stroke="hlC('safeHeightMm')" stroke-width="1"/>
      <text :x="g.shX - 7" :y="(g.shBot + g.shTop) / 2" :fill="hlC('safeHeightMm')"
        font-size="8" text-anchor="end" dominant-baseline="middle">safe h</text>
    </g>

    <!-- Callout: buffer -->
    <g :class="hl === 'buffer' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'buffer' ? 0.15 : 1">
      <line :x1="g.bufFrom.x - 3" :y1="g.bufFrom.y - 2" :x2="g.bufFrom.x + 3" :y2="g.bufFrom.y + 2"
        :stroke="hlC('buffer')" stroke-width="1"/>
      <line :x1="g.bufFrom.x" :y1="g.bufFrom.y" :x2="g.bufTo.x" :y2="g.bufTo.y"
        :stroke="hlC('buffer')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="g.bufTo.x - 3" :y1="g.bufTo.y - 2" :x2="g.bufTo.x + 3" :y2="g.bufTo.y + 2"
        :stroke="hlC('buffer')" stroke-width="1"/>
      <text :x="(g.bufFrom.x + g.bufTo.x) / 2 - 2" :y="(g.bufFrom.y + g.bufTo.y) / 2 + 9"
        :fill="hlC('buffer')" font-size="8" text-anchor="middle">buf</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
  corner: 'front-left' | 'front-right' | 'back-left' | 'back-right'
  highlightedParam: string | null
  stockShape?: 'rect' | 'round'
}>()

const ui = useUiStore()
const hl = computed(() => props.highlightedParam)

// Isometric projection: X→(+38,+22), Y→(-38,+22), Z→(0,-44), origin at (148,125)
function iso(x: number, y: number, z: number) {
  return { x: 148 + (x - y) * 38, y: 125 + (x + y) * 22 - z * 44 }
}
function pt(x: number, y: number, z: number) {
  const p = iso(x, y, z); return `${p.x},${p.y}`
}

// Static stock box face strings (W=2, D=1, H=0.85)
const topFace   = `${pt(0,0,.85)} ${pt(2,0,.85)} ${pt(2,1,.85)} ${pt(0,1,.85)}`
const rightFace = `${pt(2,0,0)} ${pt(2,0,.85)} ${pt(2,1,.85)} ${pt(2,1,0)}`
const frontFace = `${pt(0,1,0)} ${pt(2,1,0)} ${pt(2,1,.85)} ${pt(0,1,.85)}`

// Cylinder geometry for round stock (r=0.5, centered at iso(1,0.5,0.85))
const cylCenter = iso(1, 0.5, 0.85)
const cylRx = Math.round(38 * 0.5 * Math.SQRT2)
const cylRy = Math.round(22 * 0.5 * Math.SQRT2)
const cylDepth = Math.round(0.85 * 44)

const CORNERS = {
  'front-left':  { cx: 0, cy: 1, dx: -1, dy: 1  },
  'front-right': { cx: 2, cy: 1, dx:  1, dy: 1  },
  'back-left':   { cx: 0, cy: 0, dx: -1, dy: -1 },
  'back-right':  { cx: 2, cy: 0, dx:  1, dy: -1 },
} as const

const g = computed(() => {
  const { cx, cy, dx, dy } = CORNERS[props.corner]
  const buf = 0.5
  const safeZ = 1.55  // probe z above stock

  const probe    = iso(cx + dx * buf, cy + dy * buf, safeZ)
  const cornerTop = iso(cx, cy, 0.85)

  // Approach arrows: X, Y, Z
  const ay = cy + dy * 0.2
  const xFrom = iso(cx + dx * buf, ay, 1.0)
  const xTo   = iso(cx,             ay, 1.0)

  const ax = cx + dx * 0.2
  const yFrom = iso(ax, cy + dy * buf, 1.0)
  const yTo   = iso(ax, cy,            1.0)

  const zqx = cx + dx * 0.15, zqy = cy + dy * 0.25
  const zFrom = iso(zqx, zqy, safeZ)
  const zTo   = iso(zqx, zqy, 0.85)

  // safeHeight callout: vertical bracket at fixed position outside stock
  const shPt = (z: number) => iso(-0.35, 0.12, z)
  const shTop = shPt(safeZ).y
  const shBot = shPt(0.85).y
  const shX   = shPt(0).x

  // Buffer callout: from stock corner edge outward
  const bufFrom = dy > 0
    ? iso(cx + dx * 0.08, cy, 0.85)
    : iso(cx, cy + dy * 0.08, 0.85)
  const bufTo = dy > 0
    ? iso(cx + dx * 0.08, cy + dy * buf, 0.85)
    : iso(cx + dx * buf, cy + dy * 0.08, 0.85)

  return { probe, cornerTop, xFrom, xTo, yFrom, yTo, zFrom, zTo, shX, shTop, shBot, bufFrom, bufTo }
})

const c = computed(() => {
  const d = ui.darkMode
  return {
    top:   d ? '#334155' : '#e2e8f0',
    right: d ? '#293548' : '#cbd5e1',
    front: d ? '#2a3444' : '#d1d5db',
    edge:  d ? '#475569' : '#94a3b8',
    arrow: '#3b82f6',
    arrowZ: '#60a5fa',
    callout: d ? '#64748b' : '#94a3b8',
    calloutActive: '#3b82f6',
  }
})

function hlC(param: string) {
  return hl.value === param ? c.value.calloutActive : c.value.callout
}
</script>
