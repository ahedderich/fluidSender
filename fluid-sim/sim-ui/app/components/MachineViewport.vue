<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div
      class="px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0 flex items-center justify-between"
    >
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Machine View
      </h2>
      <div class="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500">
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-sm bg-blue-200 dark:bg-blue-900 border border-blue-400 dark:border-blue-600" />
          Stock
        </span>
        <span v-if="s.stock.hole.enabled" class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-full border border-dashed border-gray-500 dark:border-slate-400" />
          Hole
        </span>
        <span v-if="s.stock.point.enabled" class="flex items-center gap-1.5">
          <span class="inline-block w-2 h-2 rounded-full bg-amber-400" />
          {{ s.stock.point.label }}
        </span>
        <span v-if="s.toolsetter.enabled" class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-full border-2 border-violet-500" />
          Tool-Setter
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-0.5 bg-red-500 rounded-full" />
          Tool
        </span>
        <span v-if="s.probe.triggered" class="text-amber-500 dark:text-amber-400 font-semibold animate-pulse">
          PROBE
        </span>
      </div>
    </div>

    <div class="flex-1 flex gap-2 p-3 min-h-0">
      <!-- XY top-down view -->
      <div class="flex-1 flex flex-col gap-1 min-w-0 min-h-0">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 shrink-0">
          XY · top view
        </p>
        <div class="flex-1 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 overflow-hidden min-h-0">
          <!-- Coordinate mapping: SVG_x = CNC_x, SVG_y = -CNC_y.
               Origin (0,0) is at top-right; work area extends into negative X and Y. -->
          <svg
            :viewBox="`${-s.travel.x - PAD} ${-PAD} ${s.travel.x + PAD * 2} ${s.travel.y + PAD * 2}`"
            class="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <!-- Machine travel envelope: X ∈ [-travel.x, 0], SVG Y ∈ [0, travel.y] -->
            <rect :x="-s.travel.x" y="0" :width="s.travel.x" :height="s.travel.y"
              fill="#f3f4f6" stroke="#d1d5db" stroke-width="0.8" />

            <!-- 50 mm grid -->
            <g opacity="0.6">
              <line v-for="x in gridX" :key="`gx${x}`" :x1="x" y1="0" :x2="x" :y2="s.travel.y" stroke="#e5e7eb" stroke-width="0.3" />
              <line v-for="sy in gridY" :key="`gy${sy}`" :x1="-s.travel.x" :y1="sy" x2="0" :y2="sy" stroke="#e5e7eb" stroke-width="0.3" />
            </g>

            <!-- Stock body. ox/oy is the stock CENTRE (matching the sim's collision
                 math); rect top edge in SVG y = -(oy + height/2). -->
            <rect v-if="s.stock.shape === 'rect'"
              :x="s.stock.ox - s.stock.width / 2"
              :y="-(s.stock.oy + s.stock.height / 2)"
              :width="s.stock.width" :height="s.stock.height"
              fill="#bfdbfe" fill-opacity="0.7" stroke="#3b82f6" stroke-width="0.8"
              :transform="stockTransform" />
            <circle v-else
              :cx="s.stock.ox"
              :cy="-s.stock.oy"
              :r="s.stock.diameter / 2"
              fill="#bfdbfe" fill-opacity="0.7" stroke="#3b82f6" stroke-width="0.8" />

            <!-- Hole -->
            <circle v-if="s.stock.hole.enabled"
              :cx="s.stock.ox + s.stock.hole.x"
              :cy="-(s.stock.oy + s.stock.hole.y)"
              :r="s.stock.hole.diameter / 2"
              fill="#f9fafb" fill-opacity="0.95"
              stroke="#6b7280" stroke-width="0.8" stroke-dasharray="2 1" />

            <!-- Reference point marker -->
            <g v-if="s.stock.point.enabled"
               :transform="`translate(${s.stock.ox + s.stock.point.x}, ${-(s.stock.oy + s.stock.point.y)})`">
              <circle r="3" fill="none" stroke="#f59e0b" stroke-width="0.8" />
              <line x1="-5" y1="0" x2="5" y2="0" stroke="#f59e0b" stroke-width="0.8" />
              <line x1="0" y1="-5" x2="0" y2="5" stroke="#f59e0b" stroke-width="0.8" />
              <text x="4" y="-4" font-size="4" fill="#f59e0b">{{ s.stock.point.label }}</text>
            </g>

            <!-- Tool-setter marker — XY position + contact radius only. Trigger height
                 is deliberately not visualized here; it stays hidden in the panel too,
                 since the point is to calibrate against it via FluidSender, not read it off. -->
            <g v-if="s.toolsetter.enabled" :transform="`translate(${s.toolsetter.x}, ${-s.toolsetter.y})`">
              <circle :r="s.toolsetter.radius" fill="#8b5cf6" fill-opacity="0.15" stroke="#8b5cf6" stroke-width="0.8" />
              <line x1="-3" y1="0" x2="3" y2="0" stroke="#8b5cf6" stroke-width="0.6" />
              <line x1="0" y1="-3" x2="0" y2="3" stroke="#8b5cf6" stroke-width="0.6" />
              <text x="4" y="-4" font-size="4" fill="#8b5cf6">TS</text>
            </g>

            <!-- Machine origin dot (home position) -->
            <circle cx="0" cy="0" r="2" fill="#9ca3af" />

            <!-- Probe triggered ring -->
            <circle v-if="s.probe.triggered"
              :cx="s.pos.x" :cy="-s.pos.y"
              :r="5"
              fill="none" stroke="#f59e0b" stroke-width="1.2" />

            <!-- Tool crosshair -->
            <line :x1="s.pos.x - 7" :y1="-s.pos.y" :x2="s.pos.x + 7" :y2="-s.pos.y" stroke="#ef4444" stroke-width="0.8" />
            <line :x1="s.pos.x" :y1="-s.pos.y - 7" :x2="s.pos.x" :y2="-s.pos.y + 7" stroke="#ef4444" stroke-width="0.8" />
            <circle :cx="s.pos.x" :cy="-s.pos.y"
              :r="1.5"
              fill="#ef4444" fill-opacity="0.45" stroke="#ef4444" stroke-width="0.5" />

            <!-- X dimension (bottom) -->
            <line :x1="-s.travel.x" :y1="s.travel.y + 6" x2="0" :y2="s.travel.y + 6" stroke="#9ca3af" stroke-width="0.5" />
            <line :x1="-s.travel.x" :y1="s.travel.y + 4" :x2="-s.travel.x" :y2="s.travel.y + 8" stroke="#9ca3af" stroke-width="0.5" />
            <line x1="0" :y1="s.travel.y + 4" x2="0" :y2="s.travel.y + 8" stroke="#9ca3af" stroke-width="0.5" />
            <text :x="-s.travel.x / 2" :y="s.travel.y + 11" font-size="4.5" fill="#9ca3af" text-anchor="middle">{{ s.travel.x }} mm</text>

            <!-- Y dimension (right of origin) -->
            <line x1="6" y1="0" x2="6" :y2="s.travel.y" stroke="#9ca3af" stroke-width="0.5" />
            <line x1="4" y1="0" x2="8" y2="0" stroke="#9ca3af" stroke-width="0.5" />
            <line x1="4" :y1="s.travel.y" x2="8" :y2="s.travel.y" stroke="#9ca3af" stroke-width="0.5" />
            <text
              x="6" :y="s.travel.y / 2"
              font-size="4.5" fill="#9ca3af" text-anchor="middle"
              :transform="`rotate(-90, 6, ${s.travel.y / 2})`"
            >{{ s.travel.y }} mm</text>
          </svg>
        </div>
      </div>

      <!-- Z elevation view -->
      <div class="w-20 flex flex-col gap-1 shrink-0">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">
          Z · side
        </p>
        <div class="flex-1 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 overflow-hidden">
          <svg
            :viewBox="`-14 ${-PAD} 28 ${s.travel.z + PAD * 2}`"
            class="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <!-- Z travel bar -->
            <rect x="0" y="0" width="8" :height="s.travel.z"
              fill="#f3f4f6" stroke="#d1d5db" stroke-width="0.8" />

            <!-- Stock Z depth (oz is the signed machine-z top surface; SVG y = -machine z) -->
            <rect x="0" :y="-s.stock.oz" width="8" :height="s.stock.depth"
              fill="#bfdbfe" fill-opacity="0.7" stroke="#3b82f6" stroke-width="0.8" />

            <!-- Hole depth indicator (centered notch) -->
            <rect v-if="s.stock.hole.enabled"
              x="2" :y="-s.stock.oz" width="4"
              :height="Math.min(s.stock.depth, s.stock.hole.depth)"
              fill="#f9fafb" fill-opacity="0.95"
              stroke="#6b7280" stroke-width="0.5" stroke-dasharray="1 0.5" />

            <!-- Tool Z position -->
            <line x1="-5" :y1="zToolY" x2="13" :y2="zToolY" stroke="#ef4444" stroke-width="0.8" />
            <circle cx="4" :cy="zToolY" r="1.5" fill="#ef4444" />

            <!-- Z0 / -max labels -->
            <text x="-13" y="3.5" font-size="4" fill="#9ca3af">Z0</text>
            <text x="-13" :y="s.travel.z + 1" font-size="4" fill="#9ca3af">-{{ s.travel.z }}</text>

            <!-- Z dimension (right side of bar) -->
            <line x1="10" y1="0" x2="10" :y2="s.travel.z" stroke="#9ca3af" stroke-width="0.5" />
            <line x1="9" y1="0" x2="11" y2="0" stroke="#9ca3af" stroke-width="0.5" />
            <line x1="9" :y1="s.travel.z" x2="11" :y2="s.travel.z" stroke="#9ca3af" stroke-width="0.5" />
            <text
              x="13" :y="s.travel.z / 2"
              font-size="4" fill="#9ca3af" text-anchor="middle"
              :transform="`rotate(90, 13, ${s.travel.z / 2})`"
            >{{ s.travel.z }} mm</text>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
const PAD = 12

const gridX = computed(() => {
  const lines: number[] = []
  for (let x = -50; x > -s.travel.x; x -= 50) lines.push(x)
  return lines
})

// SVG Y grid lines (positive, representing CNC negative Y steps)
const gridY = computed(() => {
  const lines: number[] = []
  for (let sy = 50; sy < s.travel.y; sy += 50) lines.push(sy)
  return lines
})

const stockTransform = computed(() => {
  if (s.stock.rotation === 0) return ''
  // ox/oy is the stock centre — the sim rotates around it too.
  // Negate rotation because the Y axis is flipped in SVG vs CNC space.
  return `rotate(${-s.stock.rotation}, ${s.stock.ox}, ${-s.stock.oy})`
})

const zToolY = computed(() => Math.max(0, Math.min(s.travel.z, -s.pos.z)))
</script>
