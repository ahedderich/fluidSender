<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div class="flex items-center px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Tool Management</h2>
    </div>

    <!-- Active tool -->
    <div class="px-3 py-2.5 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Active Tool</p>
        <button
          v-if="activeTool && !toolIsUnloaded"
          @click="handleUnload"
          class="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-red-600 hover:text-white text-gray-600 dark:text-slate-300 rounded transition-colors"
          title="Remove tool from spindle without loading a replacement"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Unload
        </button>
      </div>

      <template v-if="toolIsUnloaded">
        <div class="flex items-center gap-2.5 py-0.5">
          <div class="w-8 h-8 rounded-full bg-slate-400 dark:bg-slate-600 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-gray-700 dark:text-slate-300">Spindle empty</p>
            <p class="text-xs text-gray-400 dark:text-slate-500">Tool removed — ready for inspection or manual change</p>
          </div>
          <button
            @click="toolIsUnloaded = false"
            class="shrink-0 text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-400 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </template>

      <template v-else-if="activeTool">
        <div class="flex items-start gap-2.5">
          <div class="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {{ activeJobTool?.number }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-tight truncate">{{ activeTool.name }}</p>
              <SourceBadge :source="activeTool.source" />
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              <span class="text-xs text-gray-500 dark:text-slate-400">⌀ {{ activeTool.diameter }} mm</span>
              <span v-if="activeTool.material" class="text-xs text-gray-500 dark:text-slate-400 capitalize">{{ activeTool.material }}</span>
              <span v-if="activeTool.fluteCount" class="text-xs text-gray-500 dark:text-slate-400">{{ activeTool.fluteCount }} fl.</span>
              <span v-if="activeTool.fluteLength" class="text-xs text-gray-500 dark:text-slate-400">FL {{ activeTool.fluteLength }} mm</span>
            </div>
            <div class="flex gap-5 mt-1.5">
              <div>
                <p class="text-xs text-gray-400 dark:text-slate-500">Use Time</p>
                <p class="text-sm font-mono font-semibold text-gray-800 dark:text-slate-200">{{ formatUsage(activeTool.usageMinutes) }}</p>
              </div>
              <div v-if="activeTool.lastUsed">
                <p class="text-xs text-gray-400 dark:text-slate-500">Last Used</p>
                <p class="text-sm font-mono font-semibold text-gray-800 dark:text-slate-200">{{ formatRelativeDate(activeTool.lastUsed) }}</p>
              </div>
              <div v-if="activeTool.overallLength">
                <p class="text-xs text-gray-400 dark:text-slate-500">OAL</p>
                <p class="text-sm font-mono font-semibold text-gray-800 dark:text-slate-200">{{ activeTool.overallLength }} mm</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <p class="text-xs text-gray-400 dark:text-slate-500 italic">No tool active — load a job to see active tool info</p>
      </template>
    </div>

    <!-- Tool Magazine (shown when machine has magazine configured) -->
    <template v-if="magazine?.enabled && magazine.size > 0">
      <div class="px-3 pt-2.5 pb-2.5 border-b border-gray-100 dark:border-slate-700 shrink-0">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          Tool Magazine <span class="normal-case font-normal text-gray-400 dark:text-slate-500">({{ magazine.size }} slots)</span>
          <span v-if="draggingToolId" class="ml-2 normal-case font-normal text-blue-500 dark:text-blue-400">Drop onto a slot to assign</span>
        </p>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="slot in magazine.size"
            :key="slot"
            :class="[
              dragOverSlot === slot
                ? 'border-blue-500 bg-blue-100 dark:bg-blue-800/40 scale-105'
                : slotTool(slot)?.number === activeJobTool?.number && !toolIsUnloaded
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
                :class="slotTool(slot)!.number === activeJobTool?.number && !toolIsUnloaded
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
      <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Tool Library</p>
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
          <option value="usetime">Use time</option>
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
            entry.id === activeTool?.id
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/60'
              : isInJob(entry)
                ? 'bg-blue-50/60 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
                : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700',
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
            :class="entry.id === activeTool?.id
              ? 'bg-amber-500'
              : isInJob(entry) ? 'bg-blue-600' : 'bg-slate-400 dark:bg-slate-600'"
            class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
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
          <!-- Use time -->
          <div class="shrink-0 text-right">
            <p class="text-xs font-mono text-gray-500 dark:text-slate-400">{{ formatUsage(entry.usageMinutes) }}</p>
          </div>
          <!-- Edit button (on hover) -->
          <button
            @click.stop="openEditModal(entry)"
            class="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 transition-all"
            title="Edit tool"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Add / Edit Tool modal ── -->
    <Teleport to="body">
      <div
        v-if="showToolModal"
        class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        @click.self="showToolModal = false"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-sm">
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

          <div class="p-5 space-y-3 overflow-y-auto max-h-[65vh]">
            <!-- Name -->
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Name <span class="text-red-500">*</span></label>
              <input
                v-model="modalForm.name"
                type="text"
                placeholder="e.g. 6mm Flat End Mill"
                class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <!-- Type + T# -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Type <span class="text-red-500">*</span></label>
                <input
                  v-model="modalForm.type"
                  list="tool-type-suggestions"
                  placeholder="flat end mill"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <datalist id="tool-type-suggestions">
                  <option v-for="t in TOOL_TYPES" :key="t" :value="t" />
                </datalist>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Tool # <span class="text-red-500">*</span></label>
                <input
                  v-model.number="modalForm.number"
                  type="number"
                  min="1"
                  max="9999"
                  placeholder="e.g. 4"
                  :class="numberConflict ? 'border-red-400 dark:border-red-600 focus:ring-red-500' : 'border-gray-300 dark:border-slate-600 focus:ring-blue-500'"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1"
                />
                <p v-if="numberConflict" class="text-[10px] text-red-500 mt-0.5">T{{ modalForm.number }} is already used</p>
              </div>
            </div>

            <!-- Diameter + Flutes -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Diameter (mm) <span class="text-red-500">*</span></label>
                <input
                  v-model.number="modalForm.diameter"
                  type="number"
                  min="0.1"
                  step="0.5"
                  placeholder="6"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Flutes</label>
                <input
                  v-model.number="modalForm.fluteCount"
                  type="number"
                  min="1"
                  max="16"
                  placeholder="4"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <!-- Flute length + OAL -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Flute Length (mm)</label>
                <input
                  v-model.number="modalForm.fluteLength"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="19"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Overall Length (mm)</label>
                <input
                  v-model.number="modalForm.overallLength"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="63"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <!-- Material + Source -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Material</label>
                <input
                  v-model="modalForm.material"
                  type="text"
                  placeholder="carbide, hss…"
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Classification</label>
                <div class="flex gap-2 mt-1">
                  <button
                    type="button"
                    @click="modalForm.source = 'M'"
                    :class="modalForm.source === 'M'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-50 dark:bg-slate-900 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400'"
                    class="flex-1 py-2 border rounded-lg text-xs font-bold transition-colors"
                    title="Machine-specific tool"
                  >M</button>
                  <button
                    type="button"
                    @click="modalForm.source = 'A'"
                    :class="modalForm.source === 'A'
                      ? 'bg-slate-600 border-slate-600 text-white'
                      : 'bg-gray-50 dark:bg-slate-900 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400'"
                    class="flex-1 py-2 border rounded-lg text-xs font-bold transition-colors"
                    title="App-level shared tool"
                  >A</button>
                </div>
                <p class="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                  {{ modalForm.source === 'M' ? 'Machine-specific' : 'App library (shared)' }}
                </p>
              </div>
            </div>
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
        class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
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
import { useSettingsStore } from '~/stores/settings'

const machine = useMachineStore()
const settings = useSettingsStore()

const filterText = ref('')
const sortKey = ref<'default' | 'name' | 'diameter' | 'usetime' | 'number'>('default')
const fileInput = ref<HTMLInputElement | null>(null)
const toolIsUnloaded = ref(false)

const showToolModal = ref(false)
const editingTool = ref<ToolLibraryEntry | null>(null)
const showExportModal = ref(false)

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
  const entry = machine.toolLibrary.find(e => e.id === draggingToolId.value)
  if (!entry) return
  machine.magazineSlots.splice(slot - 1, 1, entry.number!)
  draggingToolId.value = null
  dragOverSlot.value = null
}

function clearSlot(slot: number) {
  machine.magazineSlots.splice(slot - 1, 1, null)
}

const magazine = computed(() => settings.activeMachine?.magazine ?? null)
const machineName = computed(() => settings.activeMachine?.name ?? 'Machine')

const TOOL_TYPES = [
  'flat end mill', 'ball end mill', 'v-cutter', 'chamfer mill',
  'drill', 'face mill', 'tap', 'other',
]

const modalForm = reactive({
  number: undefined as number | undefined,
  name: '',
  type: 'flat end mill',
  diameter: undefined as number | undefined,
  fluteCount: undefined as number | undefined,
  fluteLength: undefined as number | undefined,
  overallLength: undefined as number | undefined,
  material: '',
  source: 'A' as 'M' | 'A',
})

const exportForm = reactive({
  includeMachine: true,
  includeApp: true,
  filename: 'fluidsender-tools.json',
})

const numberConflict = computed(() => {
  const n = modalForm.number
  if (!n) return false
  return machine.toolLibrary.some(e => e.number === n && e.id !== editingTool.value?.id)
})

const machineToolCount = computed(() => machine.toolLibrary.filter(e => e.source === 'M').length)
const appToolCount = computed(() => machine.toolLibrary.filter(e => e.source === 'A').length)
const exportToolCount = computed(() =>
  machine.toolLibrary.filter(e =>
    (exportForm.includeMachine && e.source === 'M') ||
    (exportForm.includeApp && e.source === 'A'),
  ).length,
)

function slotTool(slot: number) {
  const num = machine.magazineSlots[slot - 1]
  if (num == null) return null
  return machine.toolLibrary.find(e => e.number === num) ?? null
}

function openAddModal() {
  editingTool.value = null
  modalForm.number = undefined
  modalForm.name = ''
  modalForm.type = 'flat end mill'
  modalForm.diameter = undefined
  modalForm.fluteCount = undefined
  modalForm.fluteLength = undefined
  modalForm.overallLength = undefined
  modalForm.material = ''
  modalForm.source = 'A'
  showToolModal.value = true
}

function openEditModal(entry: ToolLibraryEntry) {
  editingTool.value = entry
  modalForm.number = entry.number
  modalForm.name = entry.name
  modalForm.type = entry.type
  modalForm.diameter = entry.diameter
  modalForm.fluteCount = entry.fluteCount
  modalForm.fluteLength = entry.fluteLength
  modalForm.overallLength = entry.overallLength
  modalForm.material = entry.material ?? ''
  modalForm.source = entry.source
  showToolModal.value = true
}

function saveModal() {
  if (!modalForm.name.trim() || !modalForm.diameter || !modalForm.type.trim() || !modalForm.number || numberConflict.value) return
  const payload: Partial<ToolLibraryEntry> = {
    number: Number(modalForm.number),
    name: modalForm.name.trim(),
    type: modalForm.type.trim(),
    diameter: Number(modalForm.diameter),
    fluteCount: modalForm.fluteCount ? Number(modalForm.fluteCount) : undefined,
    fluteLength: modalForm.fluteLength ? Number(modalForm.fluteLength) : undefined,
    overallLength: modalForm.overallLength ? Number(modalForm.overallLength) : undefined,
    material: modalForm.material.trim() || undefined,
    source: modalForm.source,
  }
  if (editingTool.value) {
    const idx = machine.toolLibrary.findIndex(e => e.id === editingTool.value!.id)
    if (idx !== -1) machine.toolLibrary.splice(idx, 1, { ...machine.toolLibrary[idx], ...payload })
  } else {
    machine.toolLibrary.push({ id: `user-${Date.now()}`, usageMinutes: 0, ...payload } as ToolLibraryEntry)
  }
  showToolModal.value = false
}

function deleteFromModal() {
  if (!editingTool.value) return
  const idx = machine.toolLibrary.findIndex(e => e.id === editingTool.value!.id)
  if (idx !== -1) machine.toolLibrary.splice(idx, 1)
  showToolModal.value = false
}

function handleUnload() {
  machine.sendCommand('T0')
  machine.sendCommand('M6')
  toolIsUnloaded.value = true
}

function doExport() {
  const tools = machine.toolLibrary.filter(e =>
    (exportForm.includeMachine && e.source === 'M') ||
    (exportForm.includeApp && e.source === 'A'),
  )
  const payload = {
    version: 1,
    manufacturer: 'FluidSender',
    data: tools.map((t, i) => ({
      BMC: t.material ?? '',
      description: t.name,
      geometry: {
        CSP: false,
        DC: t.diameter,
        FUSP: 0,
        LB: 0,
        LCF: t.fluteLength ?? 0,
        LF: t.fluteLength ?? 0,
        LCAH: 0,
        OH: t.overallLength ?? 0,
        SFDM: t.diameter,
        TP: 0,
        NFP: t.fluteCount ?? 0,
      },
      guid: t.id,
      number: t.number ?? (i + 1),
      'post-process': {
        'break-control': false,
        comment: '',
        'diameter-offset': t.number ?? (i + 1),
        'length-offset': t.number ?? (i + 1),
        live: false,
        'manual-tool-change': true,
        number: t.number ?? (i + 1),
        spindle: 'tool_spindle',
        'tool-coolant': 'disabled',
      },
      'product-id': t.id,
      'product-link': '',
      'start-values': { presets: [] },
      type: t.type,
      unit: 'millimeters',
      vendor: 'FluidSender',
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportForm.filename.endsWith('.json') ? exportForm.filename : `${exportForm.filename}.json`
  a.click()
  URL.revokeObjectURL(url)
  showExportModal.value = false
}

const jobToolNumbers = computed(() => new Set(machine.tools.map(t => t.number)))

const activeJobTool = computed(() => {
  if (!machine.job || !machine.tools.length) return null
  const line = machine.job.currentLine
  return machine.tools.find(t => line >= t.lineStart && line <= t.lineEnd) ?? machine.tools[0]
})

const activeTool = computed(() =>
  activeJobTool.value
    ? (machine.toolLibrary.find(e => e.number === activeJobTool.value!.number) ?? null)
    : null,
)

function isInJob(entry: ToolLibraryEntry): boolean {
  return entry.number !== undefined && jobToolNumbers.value.has(entry.number)
}

const filteredTools = computed(() => {
  const q = filterText.value.toLowerCase()
  if (!q) return machine.toolLibrary
  return machine.toolLibrary.filter(
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
    case 'usetime':
      return list.sort((a, b) => b.usageMinutes - a.usageMinutes)
    case 'number':
      return list.sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999))
    default:
      return list.sort((a, b) => {
        const aj = isInJob(a) ? 0 : 1
        const bj = isInJob(b) ? 0 : 1
        if (aj !== bj) return aj - bj
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

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target?.result as string)
      const data: any[] = Array.isArray(json) ? json : (json.data ?? [])
      const imported: ToolLibraryEntry[] = data.map((item: any, i: number) => ({
        id: item.guid ?? `imported-${i}`,
        number: item.number,
        name: item.description || `${item.type ?? 'tool'} ⌀${item.geometry?.DC ?? '?'} mm`,
        type: item.type ?? 'unknown',
        diameter: item.geometry?.DC ?? 0,
        fluteCount: item.geometry?.NFP,
        fluteLength: item.geometry?.LCF ? Math.round(item.geometry.LCF) : undefined,
        overallLength: item.geometry?.OH ? Math.round(item.geometry.OH) : undefined,
        material: item.BMC,
        usageMinutes: 0,
        lastUsed: undefined,
        source: 'A' as const,
      }))
      machine.setToolLibrary(imported)
    } catch {
      // silently ignore malformed JSON
    }
    input.value = ''
  }
  reader.readAsText(file)
}
</script>
