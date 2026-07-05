<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div class="flex items-center gap-1.5 px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Tool Management</h2>
      <div class="relative group/legend">
        <button type="button" class="w-4 h-4 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-300 text-[9px] font-bold flex items-center justify-center leading-none cursor-default">?</button>
        <div class="hidden group-hover/legend:block absolute left-0 top-5 z-30 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl p-2.5 space-y-1.5">
          <p class="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Color Legend</p>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-amber-500 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Next required for job start</span></div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-green-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Loaded & matches next required</span></div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-purple-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Currently loaded tool</span></div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-blue-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Other tools in this job</span></div>
        </div>
      </div>
    </div>

    <!-- Active tool -->
    <div class="px-3 py-2.5 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Loaded Tool</p>
        <button
          v-if="loadedTool && machine.connected"
          @click="handleUnload"
          class="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-red-600 hover:text-white text-gray-600 dark:text-slate-300 rounded transition-colors"
          title="Remove tool from spindle"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Unload
        </button>
      </div>

      <template v-if="!machine.connected">
        <p class="text-xs text-gray-400 dark:text-slate-500 italic">No machine connected — connect to load tools</p>
      </template>

      <template v-else-if="loadedTool">
        <div class="flex items-start gap-2.5">
          <div class="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {{ loadedTool.number }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-tight truncate">{{ loadedTool.name }}</p>
              <SourceBadge :source="loadedTool.source" />
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              <span class="text-xs text-gray-500 dark:text-slate-400">⌀ {{ loadedTool.diameter }} mm</span>
              <span v-if="loadedTool.material" class="text-xs text-gray-500 dark:text-slate-400 capitalize">{{ loadedTool.material }}</span>
              <span v-if="loadedTool.fluteCount" class="text-xs text-gray-500 dark:text-slate-400">{{ loadedTool.fluteCount }} fl.</span>
              <span v-if="loadedTool.fluteLength" class="text-xs text-gray-500 dark:text-slate-400">FL {{ loadedTool.fluteLength }} mm</span>
            </div>
            <div class="flex gap-5 mt-1.5">
              <div>
                <p class="text-xs text-gray-400 dark:text-slate-500">Use Time</p>
                <p class="text-sm font-mono font-semibold text-gray-800 dark:text-slate-200">{{ formatUsage(loadedTool.totalRuntimeMinutes) }}</p>
              </div>
              <div v-if="loadedTool.lastUsed">
                <p class="text-xs text-gray-400 dark:text-slate-500">Last Used</p>
                <p class="text-sm font-mono font-semibold text-gray-800 dark:text-slate-200">{{ formatRelativeDate(loadedTool.lastUsed) }}</p>
              </div>
              <div v-if="loadedTool.overallLength">
                <p class="text-xs text-gray-400 dark:text-slate-500">OAL</p>
                <p class="text-sm font-mono font-semibold text-gray-800 dark:text-slate-200">{{ loadedTool.overallLength }} mm</p>
              </div>
            </div>
          </div>
        </div>
        <!-- GCode vs library comparison (only when a job is loaded and values differ) -->
        <div
          v-if="gcodeLibraryDiffs.length"
          class="mt-2 rounded border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2"
        >
          <p class="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1.5">GCode / Library mismatch</p>
          <table class="w-full text-xs">
            <thead>
              <tr>
                <th class="text-left text-[10px] font-normal text-gray-400 dark:text-slate-500 pb-1 w-10"></th>
                <th class="text-left text-[10px] font-normal text-gray-400 dark:text-slate-500 pb-1">GCode</th>
                <th class="text-left text-[10px] font-normal text-gray-400 dark:text-slate-500 pb-1 pl-3">Library</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="diff in gcodeLibraryDiffs" :key="diff.field" class="align-top">
                <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2">{{ diff.field }}</td>
                <td class="text-amber-700 dark:text-amber-300 font-mono py-0.5 truncate max-w-0">{{ diff.gcode }}</td>
                <td class="text-gray-500 dark:text-slate-400 font-mono py-0.5 pl-3 truncate max-w-0">{{ diff.library }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else>
        <p class="text-xs text-gray-400 dark:text-slate-500 italic">No tool loaded — select a tool from the library below</p>
      </template>
    </div>

    <!-- Tool Magazine (shown when machine has magazine configured) -->
    <template v-if="isAtcStrategy && magazineConfig?.enabled && magazineConfig.size > 0">
      <div class="px-3 pt-2.5 pb-2.5 border-b border-gray-100 dark:border-slate-700 shrink-0">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          Tool Magazine <span class="normal-case font-normal text-gray-400 dark:text-slate-500">({{ magazineConfig!.size }} slots)</span>
          <span v-if="draggingToolId" class="ml-2 normal-case font-normal text-blue-500 dark:text-blue-400">Drop onto a slot to assign</span>
        </p>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="slot in magazineConfig!.size"
            :key="slot"
            :class="[
              dragOverSlot === slot
                ? 'border-blue-500 bg-blue-100 dark:bg-blue-800/40 scale-105'
                : slotTool(slot)?.number === machine.loadedToolNumber
                  ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                  : machine.magazineSlots[slot - 1] !== null && machine.magazineSlots[slot - 1] !== undefined
                    ? 'border-blue-300 dark:border-blue-700/60 bg-blue-50/60 dark:bg-blue-900/10'
                    : draggingToolId
                      ? 'border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10'
                      : 'border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900',
            ]"
            class="group/slot relative border rounded-md flex flex-col items-center py-1.5 px-1 transition-all duration-100"
            style="min-width: 3.5rem; max-width: 4.5rem; flex: 1"
            @dragover.prevent="dragOverSlot = slot"
            @dragleave="dragOverSlot = null"
            @drop.prevent="dropOnSlot(slot)"
          >
            <span class="text-[10px] text-gray-400 dark:text-slate-500 font-medium leading-tight">S{{ slot }}</span>
            <template v-if="slotTool(slot)">
              <div
                :class="slotTool(slot)!.number === machine.loadedToolNumber
                  ? 'bg-amber-500' : 'bg-blue-600'"
                class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
              >
                {{ slotTool(slot)!.number }}
              </div>
              <span class="text-[10px] text-gray-600 dark:text-slate-400 font-mono mt-0.5 leading-tight text-center truncate w-full px-0.5">
                ⌀{{ slotTool(slot)!.diameter }}
              </span>
              <!-- Clear slot button -->
              <button
                v-if="!draggingToolId"
                @click.stop="clearSlot(slot)"
                class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gray-400 dark:bg-slate-500 hover:bg-red-500 dark:hover:bg-red-500 text-white opacity-0 group-hover/slot:opacity-100 flex items-center justify-center transition-all"
                title="Remove from slot"
              >
                <svg class="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </template>
            <template v-else>
              <div
                :class="dragOverSlot === slot ? 'border-blue-400 dark:border-blue-500' : 'border-gray-300 dark:border-slate-600'"
                class="w-5 h-5 rounded-full border-2 border-dashed mt-0.5 flex items-center justify-center"
              >
                <svg v-if="dragOverSlot === slot" class="w-2.5 h-2.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span class="text-[10px] text-gray-300 dark:text-slate-700 mt-0.5">—</span>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- Library toolbar -->
    <div class="px-3 pt-2.5 pb-2 flex items-center justify-between gap-2 shrink-0">
      <div class="flex items-center gap-1.5">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Tool Library</p>
        <div class="relative group/legend">
          <button type="button" class="w-4 h-4 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-300 text-[9px] font-bold flex items-center justify-center leading-none cursor-default">?</button>
          <div class="hidden group-hover/legend:block absolute left-0 top-5 z-30 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl p-2.5 space-y-1.5">
            <p class="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Color Legend</p>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-amber-500 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Next required for job start</span></div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-green-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Loaded & matches next required</span></div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-purple-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Currently loaded tool</span></div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-blue-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Other tools in this job</span></div>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          @click="triggerImport"
          class="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors"
          title="Import Fusion 360 tool library (.json)"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import
        </button>
        <button
          @click="showExportModal = true"
          class="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors"
          title="Export Fusion 360 tool library (.json)"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>
        <button
          @click="openAddModal"
          class="flex items-center gap-1 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add
        </button>
        <select
          v-model="sortKey"
          class="text-xs bg-gray-100 dark:bg-slate-700 border-0 text-gray-600 dark:text-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="default">Job first</option>
          <option value="name">Name A–Z</option>
          <option value="diameter">Size ⌀</option>
          <option value="runtime">Runtime</option>
          <option value="jobs">Jobs</option>
          <option value="number">Tool #</option>
        </select>
        <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileChange" />
      </div>
    </div>

    <!-- Search -->
    <div class="px-3 pb-2 shrink-0">
      <div class="relative">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35" />
        </svg>
        <input
          v-model="filterText"
          type="text"
          placeholder="Filter tools…"
          class="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>

    <!-- Tool list -->
    <div class="flex-1 overflow-y-auto min-h-0 px-3 pb-3">
      <template v-if="sortedTools.length === 0">
        <div class="text-center py-8">
          <svg class="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l5.654-4.654m5.292-5.293.97-.97a3.75 3.75 0 115.304 5.304l-.97.97" />
          </svg>
          <p class="text-xs text-gray-400 dark:text-slate-500">
            {{ filterText ? 'No tools match filter' : 'Library is empty — import from Fusion 360 or add tools' }}
          </p>
          <button v-if="!filterText" @click="openAddModal" class="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Add first tool
          </button>
        </div>
      </template>
      <div class="space-y-1">
        <div
          v-for="entry in sortedTools"
          :key="entry.id"
          draggable="true"
          :class="[
            toolRowClassLib(entry),
            'cursor-grab active:cursor-grabbing',
            draggingToolId === entry.id ? 'opacity-50' : '',
          ]"
          class="group flex items-center gap-2 border rounded-lg px-2 py-2"
          @dragstart="onDragStart($event, entry)"
          @dragend="onDragEnd"
        >
          <!-- Drag handle -->
          <div class="w-3.5 shrink-0 flex items-center justify-center">
            <svg
              class="w-3 h-3 text-gray-300 dark:text-slate-600 group-hover:text-gray-400 dark:group-hover:text-slate-500 transition-colors"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
            </svg>
          </div>
          <!-- Tool number badge -->
          <div
            :class="toolBadgeClassLib(entry)"
            class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
          >
            {{ entry.number ?? '·' }}
          </div>
          <!-- Name + type + source -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <p class="text-xs font-medium text-gray-800 dark:text-slate-200 truncate leading-tight">{{ entry.name }}</p>
              <SourceBadge :source="entry.source" />
            </div>
            <p class="text-xs text-gray-400 dark:text-slate-500 leading-tight"><span class="capitalize">{{ entry.type }}</span> · ⌀{{ entry.diameter }} mm</p>
          </div>
          <!-- Runtime -->
          <div class="shrink-0 text-right">
            <p class="text-xs font-mono text-gray-500 dark:text-slate-400">{{ formatUsage(entry.totalRuntimeMinutes) }} · {{ entry.jobCount }}j</p>
          </div>
          <!-- Load/Unload text button + hover-only Edit -->
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              @click.stop="machine.loadedToolNumber === entry.number ? wsSend({ t: 'tool:unload', payload: {} }) : wsSend({ t: 'tool:load', payload: { toolNumber: entry.number } })"
              :disabled="!machine.connected"
              :class="machine.loadedToolNumber === entry.number
                ? 'hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400'
                : 'hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400'"
              class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              :title="machine.loadedToolNumber === entry.number ? 'Unload tool from spindle' : 'Load tool into spindle'"
            >
              {{ machine.loadedToolNumber === entry.number ? 'Unload' : 'Load' }}
            </button>
            <button
              @click.stop="openEditModal(entry)"
              class="p-1 rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
              title="Edit tool"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Add / Edit Tool modal ── -->
    <Teleport to="body">
      <div
        v-if="showToolModal"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="showToolModal = false"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-md">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">
              {{ editingTool ? 'Edit Tool' : 'Add Tool' }}
            </h3>
            <button @click="showToolModal = false" class="p-1 text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-md transition-colors">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-gray-200 dark:border-slate-700 px-5">
            <button
              v-for="tab in (['basic', 'geometry', 'presets', 'lifecycle'] as const)"
              :key="tab"
              @click="modalTab = tab"
              :class="modalTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'"
              class="px-3 py-2.5 text-xs font-medium capitalize transition-colors"
            >{{ tab }}</button>
          </div>

          <!-- Basic tab -->
          <div v-if="modalTab === 'basic'" class="p-5 space-y-3 overflow-y-auto max-h-[55vh]">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Name <span class="text-red-500">*</span></label>
              <input v-model="modalForm.name" type="text" placeholder="e.g. 6mm Flat End Mill"
                class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Type <span class="text-red-500">*</span></label>
                <input v-model="modalForm.type" list="tool-type-suggestions" placeholder="flat end mill"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <datalist id="tool-type-suggestions">
                  <option v-for="t in TOOL_TYPES" :key="t" :value="t" />
                </datalist>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Tool # <span class="text-red-500">*</span></label>
                <input v-model.number="modalForm.number" type="number" min="1" max="9999" placeholder="e.g. 4"
                  :class="numberConflict ? 'border-red-400 dark:border-red-600 focus:ring-red-500' : 'border-gray-300 dark:border-slate-600 focus:ring-blue-500'"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1" />
                <p v-if="numberConflict" class="text-[10px] text-red-500 mt-0.5">T{{ modalForm.number }} is already used</p>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Classification</label>
              <div class="flex gap-2">
                <button type="button" @click="modalForm.source = 'M'"
                  :class="modalForm.source === 'M' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-50 dark:bg-slate-900 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400'"
                  class="flex-1 py-2 border rounded-lg text-xs font-bold transition-colors" title="Machine-specific tool">Machine (M)</button>
                <button type="button" @click="modalForm.source = 'A'"
                  :class="modalForm.source === 'A' ? 'bg-slate-600 border-slate-600 text-white' : 'bg-gray-50 dark:bg-slate-900 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400'"
                  class="flex-1 py-2 border rounded-lg text-xs font-bold transition-colors" title="App-level shared tool">App (A)</button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Vendor</label>
              <input v-model="modalForm.vendor" type="text" placeholder="Sorotec, Datron…"
                class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Comment</label>
              <input v-model="modalForm.comment" type="text" placeholder="Optional notes…"
                class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Product Link</label>
              <input v-model="modalForm.productLink" type="url" placeholder="https://…"
                class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <!-- Probe config (shown only for type === 'probe') -->
            <template v-if="modalForm.type.trim() === 'probe'">
              <div class="border-t border-gray-200 dark:border-slate-700 pt-3 mt-1">
                <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">Probe Configuration</p>
                <label class="flex items-center gap-2 cursor-pointer mb-2">
                  <input v-model="modalForm.wiggleEnabled" type="checkbox" class="rounded accent-blue-600" />
                  <span class="text-xs text-gray-600 dark:text-slate-300">Wiggle probing (multi-speed cycles)</span>
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Fast Feed (mm/min)</label>
                    <input v-model.number="modalForm.fastFeedMmPerMin" type="number" min="1" step="10"
                      class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Slow Feed (mm/min)</label>
                    <input v-model.number="modalForm.slowFeedMmPerMin" type="number" min="1" step="1"
                      class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Cycles</label>
                    <input v-model.number="modalForm.probeCycles" type="number" min="1" max="10" step="1"
                      class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Average N</label>
                    <input v-model.number="modalForm.averageN" type="number" min="1" max="10" step="1"
                      class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
              <div class="border-t border-gray-200 dark:border-slate-700 pt-3 mt-1">
                <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">Probe Compensation</p>
                <div class="grid grid-cols-2 gap-2">
                  <div v-for="field in PROBE_COMP_FIELDS" :key="field.key">
                    <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{{ field.label }} (mm)</label>
                    <input v-model.number="modalForm.probeCompensation[field.key]" type="number" step="0.01"
                      class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
                <p class="text-xs text-gray-400 dark:text-slate-500 mt-2">
                  Per-direction trigger deviation: positive = probe triggers late (pre-travel), negative = triggers early.
                </p>
              </div>
            </template>
          </div>

          <!-- Geometry tab -->
          <div v-else-if="modalTab === 'geometry'" class="p-5 space-y-3 overflow-y-auto max-h-[55vh]">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Cutting ⌀ (mm) <span class="text-red-500">*</span></label>
                <input v-model.number="modalForm.diameter" type="number" min="0.1" step="0.5" placeholder="6"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Shank ⌀ (mm)</label>
                <input v-model.number="modalForm.shankDiameter" type="number" min="0" step="0.5" placeholder="6"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Corner Radius (mm)</label>
                <input v-model.number="modalForm.cornerRadius" type="number" min="0" step="0.1" placeholder="0"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Flutes</label>
                <input v-model.number="modalForm.fluteCount" type="number" min="1" max="16" placeholder="4"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Flute Length (mm)</label>
                <input v-model.number="modalForm.fluteLength" type="number" min="0" step="0.5" placeholder="19"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Shoulder Length (mm)</label>
                <input v-model.number="modalForm.shoulderLength" type="number" min="0" step="0.5" placeholder="25"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Overall Length (mm)</label>
                <input v-model.number="modalForm.overallLength" type="number" min="0" step="0.5" placeholder="63"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Body Material</label>
                <input v-model="modalForm.material" type="text" placeholder="carbide, hss…"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Length Offset</label>
                <input v-model.number="modalForm.lengthOffset" type="number" step="1" placeholder="1"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Diameter Offset</label>
                <input v-model.number="modalForm.diameterOffset" type="number" step="1" placeholder="1"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div class="flex gap-4 pt-1">
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="modalForm.coolantThrough" type="checkbox" class="rounded accent-blue-600" />
                <span class="text-xs text-gray-600 dark:text-slate-300">Coolant through</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="modalForm.rightHanded" type="checkbox" class="rounded accent-blue-600" />
                <span class="text-xs text-gray-600 dark:text-slate-300">Right-handed</span>
              </label>
            </div>
          </div>

          <!-- Presets tab (read-only) -->
          <div v-else-if="modalTab === 'presets'" class="p-5 overflow-y-auto max-h-[55vh]">
            <template v-if="editingTool?.cuttingPresets?.length">
              <div class="space-y-2">
                <div v-for="preset in editingTool.cuttingPresets" :key="preset.guid"
                  class="border border-gray-200 dark:border-slate-700 rounded-lg p-3 space-y-1.5">
                  <p class="text-xs font-semibold text-gray-800 dark:text-slate-200">{{ preset.name }}</p>
                  <p class="text-[10px] text-gray-400 dark:text-slate-500">{{ preset.material?.category }} — {{ preset.material?.query }}</p>
                  <div class="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-slate-300">
                    <div><span class="text-gray-400 dark:text-slate-500">RPM </span>{{ preset.spindleRpm }}</div>
                    <div><span class="text-gray-400 dark:text-slate-500">Feed </span>{{ preset.feedRate }} mm/min</div>
                    <div><span class="text-gray-400 dark:text-slate-500">Plunge </span>{{ preset.plungeFeed }} mm/min</div>
                    <div><span class="text-gray-400 dark:text-slate-500">Ramp </span>{{ preset.rampFeed }} mm/min</div>
                    <div><span class="text-gray-400 dark:text-slate-500">Coolant </span>{{ preset.coolant }}</div>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="text-center py-8">
                <p class="text-xs text-gray-400 dark:text-slate-500 italic">No cutting presets — presets are imported from Fusion 360 tool libraries.</p>
              </div>
            </template>
          </div>

          <!-- Lifecycle tab -->
          <div v-else-if="modalTab === 'lifecycle'" class="p-5 space-y-4 overflow-y-auto max-h-[55vh]">
            <template v-if="editingTool">
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-gray-50 dark:bg-slate-900 rounded-lg p-3">
                  <p class="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Total Runtime</p>
                  <p class="text-lg font-mono font-semibold text-gray-800 dark:text-slate-200">{{ formatUsage(editingTool.totalRuntimeMinutes) }}</p>
                </div>
                <div class="bg-gray-50 dark:bg-slate-900 rounded-lg p-3">
                  <p class="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Job Count</p>
                  <p class="text-lg font-mono font-semibold text-gray-800 dark:text-slate-200">{{ editingTool.jobCount }}</p>
                </div>
              </div>
              <div class="bg-gray-50 dark:bg-slate-900 rounded-lg p-3">
                <p class="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Last Used</p>
                <p class="text-sm font-mono text-gray-700 dark:text-slate-300">
                  {{ editingTool.lastUsed ? formatRelativeDate(editingTool.lastUsed) : '—' }}
                </p>
              </div>
              <button
                @click="clearRuntime"
                :disabled="editingTool.totalRuntimeMinutes === 0 && editingTool.jobCount === 0"
                class="w-full py-2.5 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Clear Runtime Data
              </button>
            </template>
            <template v-else>
              <p class="text-xs text-gray-400 dark:text-slate-500 italic text-center py-8">Lifecycle data is available after the tool is saved.</p>
            </template>
          </div>

          <div class="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center gap-2">
            <button
              v-if="editingTool"
              @click="deleteFromModal"
              class="p-2 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Delete tool from library"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <div class="flex-1" />
            <button
              @click="showToolModal = false"
              class="px-4 py-2 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              v-if="modalTab !== 'presets' && modalTab !== 'lifecycle'"
              @click="saveModal"
              :disabled="!modalForm.name.trim() || !modalForm.diameter || !modalForm.type.trim() || !modalForm.number || numberConflict"
              class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
            >
              {{ editingTool ? 'Save Changes' : 'Add Tool' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Export F360 modal ── -->
    <Teleport to="body">
      <div
        v-if="showExportModal"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="showExportModal = false"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-sm">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">Export Tool Library</h3>
            <button @click="showExportModal = false" class="p-1 text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-md transition-colors">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-5 space-y-4">
            <p class="text-xs text-gray-500 dark:text-slate-400">
              Select which tools to include in the exported Fusion 360 tool library (.json).
            </p>

            <!-- Source selection -->
            <div class="space-y-2">
              <label class="flex items-start gap-3 cursor-pointer group">
                <input v-model="exportForm.includeMachine" type="checkbox" class="mt-0.5 rounded accent-blue-600" />
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-800 dark:text-slate-200">Machine tools</span>
                    <SourceBadge source="M" />
                  </div>
                  <p class="text-xs text-gray-400 dark:text-slate-500">
                    {{ machineToolCount }} tool{{ machineToolCount !== 1 ? 's' : '' }} specific to "{{ machineName }}"
                  </p>
                </div>
              </label>

              <label class="flex items-start gap-3 cursor-pointer">
                <input v-model="exportForm.includeApp" type="checkbox" class="mt-0.5 rounded accent-blue-600" />
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-800 dark:text-slate-200">App tools</span>
                    <SourceBadge source="A" />
                  </div>
                  <p class="text-xs text-gray-400 dark:text-slate-500">
                    {{ appToolCount }} tool{{ appToolCount !== 1 ? 's' : '' }} from the shared app library
                  </p>
                </div>
              </label>
            </div>

            <!-- Summary -->
            <div class="bg-gray-50 dark:bg-slate-900 rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span class="text-xs text-gray-500 dark:text-slate-400">Tools selected</span>
              <span class="text-sm font-semibold font-mono text-gray-800 dark:text-slate-200">{{ exportToolCount }}</span>
            </div>

            <!-- Filename -->
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Filename</label>
              <input
                v-model="exportForm.filename"
                type="text"
                class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          <div class="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex gap-2.5">
            <button
              @click="showExportModal = false"
              class="flex-1 py-2.5 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="doExport"
              :disabled="exportToolCount === 0"
              class="flex-1 py-2.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export {{ exportToolCount }} Tool{{ exportToolCount !== 1 ? 's' : '' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Import scope selection modal ── -->
    <Teleport to="body">
      <div
        v-if="showImportModal"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="showImportModal = false"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-sm">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">Import Tool Library</h3>
            <button @click="showImportModal = false" class="p-1 text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-md transition-colors">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-5 space-y-4">
            <p class="text-sm text-gray-600 dark:text-slate-400">Select where to import tools:</p>
            <div class="space-y-2">
              <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors"
                :class="importScope === 'M' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50'"
              >
                <input type="radio" v-model="importScope" value="M" class="mt-0.5" />
                <div>
                  <p class="text-sm font-medium text-gray-800 dark:text-slate-200">Machine library</p>
                  <p class="text-xs text-gray-400 dark:text-slate-500">Specific to "{{ settings.activeMachine?.name ?? 'this machine' }}"</p>
                </div>
              </label>
              <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors"
                :class="importScope === 'A' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50'"
              >
                <input type="radio" v-model="importScope" value="A" class="mt-0.5" />
                <div>
                  <p class="text-sm font-medium text-gray-800 dark:text-slate-200">App library</p>
                  <p class="text-xs text-gray-400 dark:text-slate-500">Shared across all machines</p>
                </div>
              </label>
            </div>
          </div>
          <div class="flex gap-3 px-5 pb-5">
            <button @click="showImportModal = false" class="flex-1 py-2.5 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg transition-colors font-medium">
              Cancel
            </button>
            <button @click="confirmImport" class="flex-1 py-2.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium">
              Import
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<!-- Inline sub-component: M/A source badge -->
<script lang="ts">
const SourceBadge = defineComponent({
  props: { source: { type: String as () => 'M' | 'A', required: true } },
  setup(props) {
    return () =>
      h('span', {
        class: props.source === 'M'
          ? 'inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
          : 'inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
        title: props.source === 'M' ? 'Machine-specific tool' : 'App library tool',
      }, props.source)
  },
})
</script>

<script setup lang="ts">
import { defineComponent, h } from 'vue'
import { useMachineStore, type ToolLibraryEntry } from '~/stores/machine'
import { DEFAULT_PROBE_COMPENSATION, type ProbeCompensation } from '~~/server/utils/tool/types'
import { useJobControl } from '~/composables/useJobControl'
import { useSettingsStore } from '~/stores/settings'
import { useModals } from '~/composables/useModals'
import { wsSend } from '~/composables/useWsSend'

const machine = useMachineStore()
const { job } = useJobControl()
const settings = useSettingsStore()
const modals = useModals()

// Flat combined library for list display
const allTools = computed<ToolLibraryEntry[]>(() => [
  ...machine.toolLibrary.machine,
  ...machine.toolLibrary.app,
])

const filterText = ref('')
const sortKey = ref<'default' | 'name' | 'diameter' | 'runtime' | 'jobs' | 'number'>('default')
const fileInput = ref<HTMLInputElement | null>(null)

const loadedTool = computed(() =>
  machine.loadedToolNumber !== null
    ? (allTools.value.find(e => e.number === machine.loadedToolNumber) ?? null)
    : null,
)

const loadedGCodeSection = computed(() => {
  if (machine.loadedToolNumber === null) return null
  return job.value?.toolSections?.find(s => s.toolNumber === machine.loadedToolNumber) ?? null
})

type DiffRow = { field: string; gcode: string; library: string }

const gcodeLibraryDiffs = computed<DiffRow[]>(() => {
  const section = loadedGCodeSection.value
  const lib = loadedTool.value
  if (!section || !lib) return []
  const diffs: DiffRow[] = []
  if (section.commentedName && section.commentedName.toLowerCase() !== lib.type.toLowerCase()) {
    diffs.push({ field: 'Type', gcode: section.commentedName, library: lib.type })
  }
  if (section.commentedDiameter !== null && Math.abs(section.commentedDiameter - lib.diameter) > 0.05) {
    diffs.push({ field: '⌀', gcode: `${section.commentedDiameter} mm`, library: `${lib.diameter} mm` })
  }
  if (section.commentedCornerRadius !== null && lib.cornerRadius != null && Math.abs(section.commentedCornerRadius - lib.cornerRadius) > 0.01) {
    diffs.push({ field: 'R', gcode: `${section.commentedCornerRadius} mm`, library: `${lib.cornerRadius} mm` })
  }
  return diffs
})

// Modal open/close synced across browsers; the edit form contents stay local.
const toolModal = modals.active('tool')
const showToolModal = computed<boolean>({
  get: () => !!toolModal.value,
  set: (open) => {
    if (open) modals.open('tool')
    else if (toolModal.value) modals.resolve(toolModal.value.id)
  },
})
const editingTool = ref<ToolLibraryEntry | null>(null)

const exportModal = modals.active('toolExport')
const showExportModal = computed<boolean>({
  get: () => !!exportModal.value,
  set: (open) => {
    if (open) modals.open('toolExport')
    else if (exportModal.value) modals.resolve(exportModal.value.id)
  },
})

const draggingToolId = ref<string | null>(null)
const dragOverSlot = ref<number | null>(null)

function onDragStart(event: DragEvent, entry: ToolLibraryEntry) {
  draggingToolId.value = entry.id
  event.dataTransfer!.effectAllowed = 'copy'
  event.dataTransfer!.setData('text/plain', String(entry.number))
}

function onDragEnd() {
  draggingToolId.value = null
  dragOverSlot.value = null
}

function dropOnSlot(slot: number) {
  if (!draggingToolId.value) return
  const entry = allTools.value.find(e => e.id === draggingToolId.value)
  if (!entry) return
  machine.magazineSlots.splice(slot - 1, 1, entry.number!)
  wsSend({ t: 'tool:magazineSlots:set', payload: { slots: [...machine.magazineSlots] } })
  draggingToolId.value = null
  dragOverSlot.value = null
}

function clearSlot(slot: number) {
  machine.magazineSlots.splice(slot - 1, 1, null)
  wsSend({ t: 'tool:magazineSlots:set', payload: { slots: [...machine.magazineSlots] } })
}

const isAtcStrategy = computed(() => {
  const tc = settings.activeMachine?.toolchange
  return tc?.strategy === 'atc-passthrough' || tc?.strategy === 'atc-managed' || tc?.strategy === 'custom-macro'
})

const magazineConfig = computed(() => {
  const tc = settings.activeMachine?.toolchange
  if (!tc || !('magazine' in tc)) return null
  return (tc as { magazine: { enabled: boolean; size: number } }).magazine
})
const machineName = computed(() => settings.activeMachine?.name ?? 'Machine')

const TOOL_TYPES = [
  'flat end mill', 'ball end mill', 'v-cutter', 'chamfer mill',
  'drill', 'face mill', 'tap', 'probe', 'other',
]

const modalTab = ref<'basic' | 'geometry' | 'presets' | 'lifecycle'>('basic')

const modalForm = reactive({
  // Basic
  number: undefined as number | undefined,
  name: '',
  type: 'flat end mill',
  source: 'A' as 'M' | 'A',
  vendor: '',
  comment: '',
  productLink: '',
  // Geometry
  diameter: undefined as number | undefined,
  shankDiameter: undefined as number | undefined,
  cornerRadius: undefined as number | undefined,
  fluteCount: undefined as number | undefined,
  fluteLength: undefined as number | undefined,
  shoulderLength: undefined as number | undefined,
  overallLength: undefined as number | undefined,
  material: '',
  coolantThrough: false,
  rightHanded: true,
  lengthOffset: undefined as number | undefined,
  diameterOffset: undefined as number | undefined,
  // Probe config (only used when type === 'probe')
  wiggleEnabled: true,
  fastFeedMmPerMin: 500,
  slowFeedMmPerMin: 5,
  probeCycles: 3,
  averageN: 2,
  probeCompensation: { ...DEFAULT_PROBE_COMPENSATION } as ProbeCompensation,
})

const PROBE_COMP_FIELDS: Array<{ key: keyof ProbeCompensation; label: string }> = [
  { key: 'xPlus', label: '+X' },
  { key: 'xMinus', label: '−X' },
  { key: 'yPlus', label: '+Y' },
  { key: 'yMinus', label: '−Y' },
  { key: 'zMinus', label: '−Z' },
]

const exportForm = reactive({
  includeMachine: true,
  includeApp: true,
  filename: 'fluidsender-tools.json',
})

const numberConflict = computed(() => {
  const n = modalForm.number
  if (!n) return false
  return allTools.value.some(e => e.number === n && e.id !== editingTool.value?.id && e.source === modalForm.source)
})

const machineToolCount = computed(() => machine.toolLibrary.machine.length)
const appToolCount = computed(() => machine.toolLibrary.app.length)
const exportToolCount = computed(() =>
  (exportForm.includeMachine ? machineToolCount.value : 0) +
  (exportForm.includeApp ? appToolCount.value : 0),
)

function slotTool(slot: number) {
  const num = machine.magazineSlots[slot - 1]
  if (num == null) return null
  return allTools.value.find(e => e.number === num) ?? null
}

function resetModalForm() {
  modalForm.number = undefined
  modalForm.name = ''
  modalForm.type = 'flat end mill'
  modalForm.source = 'A'
  modalForm.vendor = ''
  modalForm.comment = ''
  modalForm.productLink = ''
  modalForm.diameter = undefined
  modalForm.shankDiameter = undefined
  modalForm.cornerRadius = undefined
  modalForm.fluteCount = undefined
  modalForm.fluteLength = undefined
  modalForm.shoulderLength = undefined
  modalForm.overallLength = undefined
  modalForm.material = ''
  modalForm.coolantThrough = false
  modalForm.rightHanded = true
  modalForm.lengthOffset = undefined
  modalForm.diameterOffset = undefined
  modalForm.wiggleEnabled = true
  modalForm.fastFeedMmPerMin = 500
  modalForm.slowFeedMmPerMin = 5
  modalForm.probeCycles = 3
  modalForm.averageN = 2
  modalForm.probeCompensation = { ...DEFAULT_PROBE_COMPENSATION }
}

function openAddModal() {
  editingTool.value = null
  resetModalForm()
  modalTab.value = 'basic'
  showToolModal.value = true
}

function openEditModal(entry: ToolLibraryEntry) {
  editingTool.value = entry
  modalForm.number = entry.number
  modalForm.name = entry.name
  modalForm.type = entry.type
  modalForm.source = entry.source
  modalForm.vendor = entry.vendor ?? ''
  modalForm.comment = entry.comment ?? ''
  modalForm.productLink = entry.productLink ?? ''
  modalForm.diameter = entry.diameter
  modalForm.shankDiameter = entry.shankDiameter
  modalForm.cornerRadius = entry.cornerRadius
  modalForm.fluteCount = entry.fluteCount
  modalForm.fluteLength = entry.fluteLength
  modalForm.shoulderLength = entry.shoulderLength
  modalForm.overallLength = entry.overallLength
  modalForm.material = entry.material ?? ''
  modalForm.coolantThrough = entry.coolantThrough ?? false
  modalForm.rightHanded = entry.rightHanded ?? true
  modalForm.lengthOffset = entry.lengthOffset
  modalForm.diameterOffset = entry.diameterOffset
  const pc = entry.probeConfig
  modalForm.wiggleEnabled = pc?.wiggleEnabled ?? true
  modalForm.fastFeedMmPerMin = pc?.fastFeedMmPerMin ?? 500
  modalForm.slowFeedMmPerMin = pc?.slowFeedMmPerMin ?? 5
  modalForm.probeCycles = pc?.cycles ?? 3
  modalForm.averageN = pc?.averageN ?? 2
  modalForm.probeCompensation = { ...DEFAULT_PROBE_COMPENSATION, ...entry.probeCompensation }
  modalTab.value = 'basic'
  showToolModal.value = true
}

function saveModal() {
  if (!modalForm.name.trim() || !modalForm.diameter || !modalForm.type.trim() || !modalForm.number || numberConflict.value) return
  const machineId = settings.activeMachineId
  const entry: ToolLibraryEntry = {
    id: editingTool.value?.id ?? `user-${Date.now()}`,
    number: Number(modalForm.number),
    name: modalForm.name.trim(),
    type: modalForm.type.trim(),
    source: modalForm.source,
    vendor: modalForm.vendor.trim() || undefined,
    comment: modalForm.comment.trim() || undefined,
    productLink: modalForm.productLink.trim() || undefined,
    diameter: Number(modalForm.diameter),
    shankDiameter: modalForm.shankDiameter ? Number(modalForm.shankDiameter) : undefined,
    cornerRadius: modalForm.cornerRadius !== undefined ? Number(modalForm.cornerRadius) : undefined,
    fluteCount: modalForm.fluteCount ? Number(modalForm.fluteCount) : undefined,
    fluteLength: modalForm.fluteLength ? Number(modalForm.fluteLength) : undefined,
    shoulderLength: modalForm.shoulderLength ? Number(modalForm.shoulderLength) : undefined,
    overallLength: modalForm.overallLength ? Number(modalForm.overallLength) : undefined,
    material: modalForm.material.trim() || undefined,
    coolantThrough: modalForm.coolantThrough || undefined,
    rightHanded: modalForm.rightHanded !== false ? undefined : false,
    lengthOffset: modalForm.lengthOffset !== undefined ? Number(modalForm.lengthOffset) : undefined,
    diameterOffset: modalForm.diameterOffset !== undefined ? Number(modalForm.diameterOffset) : undefined,
    probeConfig: modalForm.type.trim() === 'probe' ? {
      wiggleEnabled: modalForm.wiggleEnabled,
      fastFeedMmPerMin: Number(modalForm.fastFeedMmPerMin),
      slowFeedMmPerMin: Number(modalForm.slowFeedMmPerMin),
      cycles: Number(modalForm.probeCycles),
      averageN: Number(modalForm.averageN),
    } : undefined,
    probeCompensation: modalForm.type.trim() === 'probe' ? {
      xPlus: Number(modalForm.probeCompensation.xPlus) || 0,
      xMinus: Number(modalForm.probeCompensation.xMinus) || 0,
      yPlus: Number(modalForm.probeCompensation.yPlus) || 0,
      yMinus: Number(modalForm.probeCompensation.yMinus) || 0,
      zMinus: Number(modalForm.probeCompensation.zMinus) || 0,
    } : undefined,
    cuttingPresets: editingTool.value?.cuttingPresets,
    holder: editingTool.value?.holder,
    totalRuntimeMinutes: editingTool.value?.totalRuntimeMinutes ?? 0,
    jobCount: editingTool.value?.jobCount ?? 0,
    lastUsed: editingTool.value?.lastUsed,
  }
  wsSend({ t: 'tool:upsert', payload: { ...entry, machineId } })
  showToolModal.value = false
}

function deleteFromModal() {
  if (!editingTool.value) return
  const machineId = settings.activeMachineId
  wsSend({ t: 'tool:delete', payload: { id: editingTool.value.id, scope: editingTool.value.source, machineId } })
  showToolModal.value = false
}

function handleUnload() {
  wsSend({ t: 'tool:unload', payload: {} })
}

function clearRuntime() {
  if (!editingTool.value) return
  const machineId = settings.activeMachineId
  wsSend({ t: 'tool:clearRuntime', payload: { id: editingTool.value.id, scope: editingTool.value.source, machineId } })
}

async function doExport() {
  const scopes: string[] = []
  if (exportForm.includeMachine) scopes.push('M')
  if (exportForm.includeApp) scopes.push('A')
  const machineId = settings.activeMachineId
  const url = `/api/tools/export?scope=${scopes.join(',')}&machineId=${encodeURIComponent(machineId)}`
  const a = document.createElement('a')
  a.href = url
  a.download = exportForm.filename.endsWith('.json') ? exportForm.filename : `${exportForm.filename}.json`
  a.click()
  showExportModal.value = false
}

const jobToolNumbers = computed(() => {
  const sections = job.value?.toolSections ?? []
  return new Set(sections.map((s) => s.toolNumber).filter(Boolean))
})

function isInJob(entry: ToolLibraryEntry): boolean {
  return entry.number !== undefined && jobToolNumbers.value.has(entry.number)
}

const nextJobToolNumber = computed(() => {
  const sections = job.value?.toolSections ?? []
  if (!sections.length) return null
  const sendPtr = job.value?.sendPtr ?? 0
  const status = job.value?.status
  if (!status || status === 'idle' || status === 'analyzing') {
    return sections[0]?.toolNumber ?? null
  }
  return sections.find(s => sendPtr <= s.endLine)?.toolNumber ?? null
})

function toolBadgeClassLib(entry: ToolLibraryEntry): string {
  const isLoaded = entry.number === machine.loadedToolNumber
  const isNext = entry.number !== undefined && entry.number === nextJobToolNumber.value
  if (isLoaded && isNext) return 'bg-green-600'
  if (isNext) return 'bg-amber-500'
  if (isLoaded) return 'bg-purple-600'
  if (isInJob(entry)) return 'bg-blue-600'
  return 'bg-slate-400 dark:bg-slate-600'
}

function toolRowClassLib(entry: ToolLibraryEntry): string {
  const isLoaded = entry.number === machine.loadedToolNumber
  const isNext = entry.number !== undefined && entry.number === nextJobToolNumber.value
  if (isLoaded && isNext) return 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/60'
  if (isNext) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/60'
  if (isLoaded) return 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700/60'
  if (isInJob(entry)) return 'bg-blue-50/60 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
  return 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700'
}

const filteredTools = computed(() => {
  const q = filterText.value.toLowerCase()
  if (!q) return allTools.value
  return allTools.value.filter(
    e =>
      e.name.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      e.source.toLowerCase() === q ||
      String(e.diameter).includes(q) ||
      (e.number !== undefined && String(e.number).includes(q)),
  )
})

const sortedTools = computed(() => {
  const list = [...filteredTools.value]
  switch (sortKey.value) {
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name))
    case 'diameter':
      return list.sort((a, b) => a.diameter - b.diameter)
    case 'runtime':
      return list.sort((a, b) => b.totalRuntimeMinutes - a.totalRuntimeMinutes)
    case 'jobs':
      return list.sort((a, b) => b.jobCount - a.jobCount)
    case 'number':
      return list.sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999))
    default:
      return list.sort((a, b) => {
        const priority = (e: ToolLibraryEntry) => {
          if (isInJob(e)) return 0
          if (e.number === machine.loadedToolNumber) return 1
          return 2
        }
        const pa = priority(a)
        const pb = priority(b)
        if (pa !== pb) return pa - pb
        return (a.number ?? 9999) - (b.number ?? 9999)
      })
  }
})

function formatUsage(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatRelativeDate(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function triggerImport() {
  fileInput.value?.click()
}

const importScope = ref<'M' | 'A'>('M')
const pendingImportData = ref<unknown>(null)
const showImportModal = ref(false)

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      pendingImportData.value = JSON.parse(e.target?.result as string)
      importScope.value = 'M'
      showImportModal.value = true
    } catch {
      // silently ignore malformed JSON
    }
    input.value = ''
  }
  reader.readAsText(file)
}

async function confirmImport() {
  if (!pendingImportData.value) return
  const machineId = settings.activeMachineId
  wsSend({ t: 'tool:import', payload: { data: pendingImportData.value, scope: importScope.value, machineId } })
  pendingImportData.value = null
  showImportModal.value = false
}
</script>
