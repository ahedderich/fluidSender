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
          <span
            class="inline-block w-3 h-3 rounded-sm bg-blue-200 dark:bg-blue-900 border border-blue-400 dark:border-blue-600"
          />
          Stock
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-0.5 bg-red-500 rounded-full" />
          Tool
        </span>
        <span
          v-if="s.probe.triggered"
          class="text-amber-500 dark:text-amber-400 font-semibold animate-pulse"
        >
          PROBE
        </span>
      </div>
    </div>

    <div class="flex-1 flex gap-2 p-3 min-h-0">
      <!-- XY top-down view -->
      <div class="flex-1 flex flex-col gap-1 min-w-0 min-h-0">
        <p
          class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 shrink-0"
        >
          XY · top view
        </p>
        <div
          class="flex-1 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 overflow-hidden min-h-0"
        >
          <svg
            :viewBox="`${-PAD} ${-PAD} ${s.travel.x + PAD * 2} ${s.travel.y + PAD * 2}`"
            class="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <!-- Machine travel envelope -->
            <rect
              x="0"
              y="0"
              :width="s.travel.x"
              :height="s.travel.y"
              fill="#f3f4f6"
              stroke="#d1d5db"
              stroke-width="0.8"
              class="dark:fill-slate-800"
            />

            <!-- 50 mm grid -->
            <g opacity="0.6">
              <line
                v-for="x in gridX"
                :key="`gx${x}`"
                :x1="x"
                y1="0"
                :x2="x"
                :y2="s.travel.y"
                stroke="#e5e7eb"
                stroke-width="0.3"
              />
              <line
                v-for="y in gridY"
                :key="`gy${y}`"
                x1="0"
                :y1="y"
                :x2="s.travel.x"
                :y2="y"
                stroke="#e5e7eb"
                stroke-width="0.3"
              />
            </g>

            <!-- Stock -->
            <rect
              v-if="s.stock.shape === 'rect'"
              :x="s.stock.ox"
              :y="s.stock.oy"
              :width="s.stock.width"
              :height="s.stock.height"
              fill="#bfdbfe"
              fill-opacity="0.7"
              stroke="#3b82f6"
              stroke-width="0.8"
              :transform="stockTransform"
            />
            <circle
              v-else
              :cx="s.stock.ox + s.stock.diameter / 2"
              :cy="s.stock.oy + s.stock.diameter / 2"
              :r="s.stock.diameter / 2"
              fill="#bfdbfe"
              fill-opacity="0.7"
              stroke="#3b82f6"
              stroke-width="0.8"
            />

            <!-- Machine origin dot -->
            <circle cx="0" cy="0" r="2" fill="#9ca3af" />

            <!-- Probe triggered ring -->
            <circle
              v-if="s.probe.triggered"
              :cx="s.pos.x"
              :cy="s.pos.y"
              :r="s.probe.tipDiameter / 2 + 4"
              fill="none"
              stroke="#f59e0b"
              stroke-width="1.2"
            />

            <!-- Tool crosshair -->
            <line
              :x1="s.pos.x - 7"
              :y1="s.pos.y"
              :x2="s.pos.x + 7"
              :y2="s.pos.y"
              stroke="#ef4444"
              stroke-width="0.8"
            />
            <line
              :x1="s.pos.x"
              :y1="s.pos.y - 7"
              :x2="s.pos.x"
              :y2="s.pos.y + 7"
              stroke="#ef4444"
              stroke-width="0.8"
            />
            <circle
              :cx="s.pos.x"
              :cy="s.pos.y"
              :r="Math.max(1, s.probe.tipDiameter / 2)"
              fill="#ef4444"
              fill-opacity="0.45"
              stroke="#ef4444"
              stroke-width="0.5"
            />

            <!-- Axis labels -->
            <text :x="s.travel.x + 2" y="4" font-size="5" fill="#9ca3af">X+</text>
            <text x="2" :y="s.travel.y + 7" font-size="5" fill="#9ca3af">Y+</text>
          </svg>
        </div>
      </div>

      <!-- Z elevation view (side strip) -->
      <div class="w-20 flex flex-col gap-1 shrink-0">
        <p
          class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500"
        >
          Z · side
        </p>
        <div
          class="flex-1 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 overflow-hidden"
        >
          <svg
            :viewBox="`-14 ${-PAD} 28 ${s.travel.z + PAD * 2}`"
            class="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <!-- Z travel bar -->
            <rect
              x="0"
              y="0"
              width="8"
              :height="s.travel.z"
              fill="#f3f4f6"
              stroke="#d1d5db"
              stroke-width="0.8"
              class="dark:fill-slate-800"
            />

            <!-- Stock Z depth (from Z=0 surface downward) -->
            <rect
              x="0"
              y="0"
              width="8"
              :height="s.stock.depth"
              fill="#bfdbfe"
              fill-opacity="0.7"
              stroke="#3b82f6"
              stroke-width="0.8"
            />

            <!-- Tool Z position: Z=0 → SVG y=0 (top), Z negative → SVG y increases -->
            <line
              x1="-5"
              :y1="zToolY"
              x2="13"
              :y2="zToolY"
              stroke="#ef4444"
              stroke-width="0.8"
            />
            <circle :cx="4" :cy="zToolY" r="1.5" fill="#ef4444" />

            <!-- Labels -->
            <text x="-13" y="3.5" font-size="4" fill="#9ca3af">Z0</text>
            <text x="-13" :y="s.travel.z + 1" font-size="4" fill="#9ca3af">
              -{{ s.travel.z }}
            </text>
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
  for (let x = 50; x < s.travel.x; x += 50) lines.push(x)
  return lines
})

const gridY = computed(() => {
  const lines: number[] = []
  for (let y = 50; y < s.travel.y; y += 50) lines.push(y)
  return lines
})

const stockTransform = computed(() => {
  if (s.stock.rotation === 0) return ''
  const cx = s.stock.ox + s.stock.width / 2
  const cy = s.stock.oy + s.stock.height / 2
  return `rotate(${s.stock.rotation}, ${cx}, ${cy})`
})

// Z=0 is fully retracted (top of travel). pos.z is negative when cutting.
// Map to SVG: y=0 at top (Z=0), y=travel.z at bottom (Z=-travel.z)
const zToolY = computed(() => Math.max(0, Math.min(s.travel.z, -s.pos.z)))
</script>
