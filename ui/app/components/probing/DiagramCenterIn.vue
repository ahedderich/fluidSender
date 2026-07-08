<template>
  <svg viewBox="0 0 300 215" class="w-full h-auto">
    <defs>
      <marker id="dci-ah" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
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

    <!-- Bore opening ellipse on top face -->
    <ellipse :cx="borePt.x" :cy="borePt.y" :rx="boreRx" :ry="boreRy"
      :fill="c.boreTop" :stroke="c.edge" stroke-width="1.2"/>

    <!-- Bore walls (two vertical lines) -->
    <line :x1="borePt.x - boreRx" :y1="borePt.y"
          :x2="borePt.x - boreRx" :y2="borePt.y + boreDepth"
          :stroke="c.edge" stroke-width="1"/>
    <line :x1="borePt.x + boreRx" :y1="borePt.y"
          :x2="borePt.x + boreRx" :y2="borePt.y + boreDepth"
          :stroke="c.edge" stroke-width="1"/>

    <!-- Bore bottom ellipse -->
    <ellipse :cx="borePt.x" :cy="borePt.y + boreDepth" :rx="boreRx" :ry="boreRy"
      :fill="c.boreBot" :stroke="c.edge" stroke-width="0.8"/>

    <!-- WCS origin at bore center -->
    <g :transform="`translate(${borePt.x},${borePt.y})`">
      <line x1="-6" y1="0" x2="6" y2="0" stroke="#10b981" stroke-width="1.5"/>
      <line x1="0" y1="-6" x2="0" y2="6" stroke="#10b981" stroke-width="1.5"/>
    </g>

    <!-- Probe dot inside bore -->
    <circle :cx="probePt.x" :cy="probePt.y" r="4.5" fill="#f59e0b" stroke="#d97706" stroke-width="1"/>

    <!-- 4 outward arrows (probe → bore walls) -->
    <!-- +X direction -->
    <line :x1="probePt.x" :y1="probePt.y"
          :x2="probePt.x + 38 * boreR" :y2="probePt.y + 22 * boreR"
          :stroke="c.arrow" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dci-ah)"/>
    <!-- -X direction -->
    <line :x1="probePt.x" :y1="probePt.y"
          :x2="probePt.x - 38 * boreR" :y2="probePt.y - 22 * boreR"
          :stroke="c.arrow" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dci-ah)"/>
    <!-- +Y direction -->
    <line :x1="probePt.x" :y1="probePt.y"
          :x2="probePt.x - 38 * boreR" :y2="probePt.y + 22 * boreR"
          :stroke="c.arrow" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dci-ah)"/>
    <!-- -Y direction -->
    <line :x1="probePt.x" :y1="probePt.y"
          :x2="probePt.x + 38 * boreR" :y2="probePt.y - 22 * boreR"
          :stroke="c.arrow" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#dci-ah)"/>

    <!-- Step badge -->
    <rect x="56" y="130" width="58" height="18" rx="4" :fill="c.badge" fill-opacity="0.9"/>
    <text x="85" y="143" font-size="8.5" text-anchor="middle" :fill="c.badgeText" font-weight="600">① Jog inside</text>
    <!-- Badge connector line to probe -->
    <line x1="114" y1="139" :x2="probePt.x" :y2="probePt.y + 5"
      :stroke="c.callout" stroke-width="0.8" stroke-dasharray="3,2"/>

    <!-- Callout: buffer (inward from bore wall) -->
    <g :class="hl === 'buffer' ? 'animate-pulse' : ''"
       :opacity="hl && hl !== 'buffer' ? 0.15 : 1">
      <line :x1="borePt.x + boreRx - 3" :y1="probePt.y - 1"
            :x2="borePt.x + boreRx + 3" :y2="probePt.y + 1"
        :stroke="hlC('buffer')" stroke-width="1"/>
      <line :x1="borePt.x + boreRx" :y1="probePt.y"
            :x2="probePt.x + 38 * boreR" :y2="probePt.y"
        :stroke="hlC('buffer')" stroke-width="1" stroke-dasharray="3,2"/>
      <line :x1="probePt.x + 38 * boreR - 3" :y1="probePt.y - 1"
            :x2="probePt.x + 38 * boreR + 3" :y2="probePt.y + 1"
        :stroke="hlC('buffer')" stroke-width="1"/>
      <text :x="borePt.x + boreRx + 8" :y="probePt.y - 4"
        :fill="hlC('buffer')" font-size="8" text-anchor="start">buf</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
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

// Bore geometry (centered at top face)
const boreR  = 0.32  // radius in model units
const boreRx = Math.round(38 * boreR * Math.SQRT2)  // ≈ 17
const boreRy = Math.round(22 * boreR * Math.SQRT2)  // ≈ 10
const boreDepth = 22  // px depth (visual)

const borePt  = iso(1, 0.5, 0.85)
const probePt = iso(1, 0.5, 0.5)

const c = computed(() => {
  const d = ui.darkMode
  return {
    top:     d ? '#334155' : '#e2e8f0',
    right:   d ? '#293548' : '#cbd5e1',
    front:   d ? '#2a3444' : '#d1d5db',
    edge:    d ? '#475569' : '#94a3b8',
    boreTop: d ? '#1e293b' : '#cbd5e1',
    boreBot: d ? '#0f172a' : '#9ca3af',
    arrow:   '#3b82f6',
    callout: d ? '#64748b' : '#94a3b8',
    calloutActive: '#3b82f6',
    badge:     d ? '#1e3a5f' : '#dbeafe',
    badgeText: d ? '#93c5fd' : '#1d4ed8',
  }
})

function hlC(param: string) {
  return hl.value === param ? c.value.calloutActive : c.value.callout
}
</script>
