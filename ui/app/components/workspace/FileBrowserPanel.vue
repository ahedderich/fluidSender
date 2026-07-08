<template>
  <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">File Browser</h2>
      <div class="flex items-center gap-1">
        <button
          :disabled="isViewer"
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="New folder"
          @click="toggleFolderForm"
        >
          + Folder
        </button>
        <label
          :class="isViewer ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer'"
          class="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
          title="Upload files"
        >
          Upload
          <input
            ref="uploadInput"
            type="file"
            multiple
            class="hidden"
            :disabled="isViewer"
            @change="onFilesSelected"
          />
        </label>
        <button
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors"
          title="Refresh"
          @click="() => refresh()"
        >
          ↺
        </button>
      </div>
    </div>

    <!-- Breadcrumbs -->
    <div class="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 dark:border-slate-700 shrink-0 min-w-0">
      <button
        class="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        @click="navigateTo('')"
      >
        root
      </button>
      <template v-for="(seg, i) in breadcrumbs" :key="i">
        <span class="text-xs text-gray-400 dark:text-slate-500 shrink-0">/</span>
        <button
          class="text-xs truncate max-w-[120px]"
          :class="i === breadcrumbs.length - 1
            ? 'text-gray-700 dark:text-slate-300 cursor-default'
            : 'text-blue-600 dark:text-blue-400 hover:underline'"
          :title="seg"
          @click="i < breadcrumbs.length - 1 && navigateTo(breadcrumbs.slice(0, i + 1).join('/'))"
        >
          {{ seg }}
        </button>
      </template>
    </div>

    <!-- New-folder form -->
    <div v-if="showFolderForm" class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <input
        ref="folderInput"
        v-model="newFolderName"
        type="text"
        placeholder="Folder name…"
        maxlength="128"
        class="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        @keydown.enter="createFolder"
        @keydown.esc="showFolderForm = false"
      />
      <button class="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors" @click="createFolder">Create</button>
      <button class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded transition-colors" @click="showFolderForm = false">✕</button>
    </div>

    <!-- Filter -->
    <div class="px-3 py-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <input
        v-model="filter"
        type="text"
        placeholder="Filter…"
        class="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-300 dark:placeholder-slate-600"
      />
    </div>

    <!-- Upload progress -->
    <div v-if="uploading" class="px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 border-b border-gray-100 dark:border-slate-700 shrink-0">
      Uploading…
    </div>

    <!-- Analysis loading overlay -->
    <Teleport to="body">
      <div
        v-if="isAnalyzing"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      >
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6 w-80">
          <h3 class="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-1">Analysing GCode</h3>
          <p class="text-xs text-gray-500 dark:text-slate-400 mb-4">
            {{ analyzingFilename }} — calculating time estimate, tool sections and 3D path…
          </p>
          <div class="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
            <div class="h-full bg-blue-500 rounded-full transition-all duration-300" :style="{ width: analyzeProgress + '%' }" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-400 dark:text-slate-500">{{ analyzeProgress }}%</span>
            <button class="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors font-medium" @click="abortAnalysis()">Abort</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Table -->
    <div class="flex-1 overflow-auto min-h-0">
      <table v-if="!pending && (visibleFolders.length || visibleFiles.length)" class="w-full text-xs min-w-[520px]">
        <thead class="sticky top-0 z-10">
          <tr class="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <th class="text-left px-3 py-2 font-medium text-gray-500 dark:text-slate-400 cursor-pointer select-none" @click="setSort('name')">
              Name <span v-if="sortCol === 'name'" class="ml-0.5 opacity-60">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="text-right px-2 py-2 font-medium text-gray-500 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap" @click="setSort('size')">
              Size <span v-if="sortCol === 'size'" class="ml-0.5 opacity-60">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="text-right px-2 py-2 font-medium text-gray-500 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap" @click="setSort('uploadedAt')">
              Uploaded <span v-if="sortCol === 'uploadedAt'" class="ml-0.5 opacity-60">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="text-right px-2 py-2 font-medium text-gray-500 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap" @click="setSort('lastRun')">
              Last Run <span v-if="sortCol === 'lastRun'" class="ml-0.5 opacity-60">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="text-right px-2 py-2 font-medium text-gray-500 dark:text-slate-400 cursor-pointer select-none" title="Successful runs" @click="setSort('success')">
              ✓ <span v-if="sortCol === 'success'" class="ml-0.5 opacity-60">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="text-right px-2 py-2 font-medium text-gray-500 dark:text-slate-400 cursor-pointer select-none" title="Failed / aborted runs" @click="setSort('failed')">
              ✗ <span v-if="sortCol === 'failed'" class="ml-0.5 opacity-60">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          <!-- Folders -->
          <tr
            v-for="folder in visibleFolders"
            :key="folder.path"
            class="border-b border-gray-100 dark:border-slate-800/60 hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer group"
            @click="navigateTo(folder.path)"
          >
            <td class="px-3 py-2 font-medium text-gray-800 dark:text-slate-200 max-w-[180px]">
              <div class="flex items-center gap-1.5 min-w-0">
                <svg class="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span class="truncate">{{ folder.name }}</span>
                <span class="text-gray-400 dark:text-slate-500 text-[10px] shrink-0">({{ folder.childCount }})</span>
              </div>
            </td>
            <td class="px-2 py-2 text-right text-gray-400 dark:text-slate-500">—</td>
            <td class="px-2 py-2 text-right text-gray-400 dark:text-slate-500">—</td>
            <td class="px-2 py-2 text-right text-gray-400 dark:text-slate-500">—</td>
            <td class="px-2 py-2 text-right text-gray-400 dark:text-slate-500">—</td>
            <td class="px-2 py-2 text-right text-gray-400 dark:text-slate-500">—</td>
            <td class="px-3 py-2 text-right">
              <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
                <button
                  :disabled="isViewer"
                  class="p-1 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Delete folder"
                  @click="confirmDelete(folder.path, 'folder', folder.name)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>

          <!-- Files -->
          <tr
            v-for="file in sortedFiles"
            :key="file.path"
            class="border-b border-gray-100 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-700/40 group"
            :class="{ 'bg-blue-50/50 dark:bg-blue-900/10': isLoaded(file.path) }"
          >
            <td class="px-3 py-2 max-w-[180px]">
              <div class="flex items-center gap-1.5 min-w-0">
                <span
                  v-if="isLoaded(file.path)"
                  class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                  title="Currently loaded"
                />
                <svg v-else class="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span class="truncate font-medium text-gray-800 dark:text-slate-200" :title="file.name">{{ file.name }}</span>
              </div>
            </td>
            <td class="px-2 py-2 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{{ formatSize(file.size) }}</td>
            <td class="px-2 py-2 text-right text-gray-500 dark:text-slate-400 whitespace-nowrap">{{ relDate(file.uploadedAt) }}</td>
            <td class="px-2 py-2 text-right whitespace-nowrap">
              <template v-if="file.isNc && file.lastExecution">
                <span
                  class="inline-flex items-center gap-1"
                  :class="file.lastExecution.status === 'success'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-500 dark:text-red-400'"
                  :title="lastRunTitle(file.lastExecution)"
                >
                  {{ relDate(file.lastExecution.completedAt) }}
                  <span>{{ file.lastExecution.status === 'success' ? '✓' : '✗' }}</span>
                </span>
              </template>
              <span v-else-if="file.isNc" class="text-gray-400 dark:text-slate-500">—</span>
              <span v-else class="text-gray-300 dark:text-slate-600">—</span>
            </td>
            <td class="px-2 py-2 text-right">
              <span v-if="file.isNc" class="text-green-600 dark:text-green-400 font-medium">{{ file.totalSuccessful || '—' }}</span>
              <span v-else class="text-gray-300 dark:text-slate-600">—</span>
            </td>
            <td class="px-2 py-2 text-right">
              <span v-if="file.isNc" :class="file.totalFailed > 0 ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-slate-500'">{{ file.totalFailed || '—' }}</span>
              <span v-else class="text-gray-300 dark:text-slate-600">—</span>
            </td>
            <td class="px-3 py-2 text-right">
              <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  v-if="file.isNc"
                  :disabled="isViewer"
                  class="p-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Load job"
                  @click="loadFile(file.path)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 3l14 9-14 9V3z" />
                  </svg>
                </button>
                <a
                  class="p-1 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors rounded cursor-pointer"
                  title="Download"
                  @click.prevent="downloadFile(file.path, file.name)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
                <button
                  :disabled="isViewer"
                  class="p-1 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Delete file"
                  @click="confirmDelete(file.path, 'file', file.name)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="pending" class="flex items-center justify-center py-12">
        <p class="text-gray-400 dark:text-slate-500 text-sm">Loading…</p>
      </div>
      <div v-else-if="!visibleFolders.length && !visibleFiles.length" class="flex items-center justify-center py-12">
        <p class="text-gray-400 dark:text-slate-500 text-sm">
          {{ filter ? 'No matches' : 'Empty folder' }}
        </p>
      </div>
    </div>

    <!-- Local confirm dialog (not synced to other browsers) -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-100" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-75" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="confirmState.open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/20" @click="confirmState.open = false" />
          <Transition enter-active-class="transition duration-100" enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100" leave-active-class="transition duration-75" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
            <div v-if="confirmState.open" class="relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-2xl p-5 w-80 max-w-full" @click.stop>
              <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">{{ confirmState.title }}</h3>
              <p v-if="confirmState.message" class="mt-1.5 text-sm text-gray-500 dark:text-slate-400 leading-relaxed">{{ confirmState.message }}</p>
              <div class="flex gap-2 mt-4">
                <button class="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors" @click="runConfirmed">Delete</button>
                <button class="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors" @click="confirmState.open = false">Cancel</button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useJobControl } from '~/composables/useJobControl'
import { useCurrentUser } from '~/composables/useCurrentUser'

// ----- types -----

interface ExecutionRecord {
  startedAt: number
  completedAt: number
  status: 'success' | 'error' | 'aborted'
  machineId: string
  machineName?: string
  errorMessage?: string
}

interface FolderEntry {
  type: 'folder'
  name: string
  path: string
  childCount: number
}

interface FileEntry {
  type: 'file'
  name: string
  path: string
  size: number
  uploadedAt: number
  isNc: boolean
  lastExecution: ExecutionRecord | null
  totalSuccessful: number
  totalFailed: number
}

type SortCol = 'name' | 'size' | 'uploadedAt' | 'lastRun' | 'success' | 'failed'

// ----- state -----

const { loadJob, abortAnalysis, job } = useJobControl()
const currentUser = useCurrentUser()
const isViewer = computed(() => currentUser.value.isViewer)

const currentDir = ref('')
const filter = ref('')
const sortCol = ref<SortCol>('name')
const sortDir = ref<'asc' | 'desc'>('asc')
const uploading = ref(false)
const showFolderForm = ref(false)
const newFolderName = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

const isAnalyzing = computed(() => job.value?.status === 'analyzing')
const analyzeProgress = computed(() => job.value?.analyzeProgress ?? 0)
const analyzingFilename = computed(() => job.value?.filename ?? '')

const confirmState = reactive({
  open: false,
  title: '',
  message: '',
  pendingPath: '',
  pendingType: 'file' as 'file' | 'folder',
})

// ----- data fetching -----

const fetchUrl = computed(() => `/api/files${currentDir.value ? `?dir=${encodeURIComponent(currentDir.value)}` : ''}`)
const { data, pending, refresh } = await useFetch<{ folders: FolderEntry[]; files: FileEntry[] }>(
  fetchUrl,
  { default: () => ({ folders: [], files: [] }), watch: [currentDir] },
)

const breadcrumbs = computed(() => currentDir.value ? currentDir.value.split('/').filter(Boolean) : [])

// ----- filtering -----

const visibleFolders = computed(() =>
  (data.value?.folders ?? []).filter((f) => f.name.toLowerCase().includes(filter.value.toLowerCase())),
)

const visibleFiles = computed(() =>
  (data.value?.files ?? []).filter((f) => f.name.toLowerCase().includes(filter.value.toLowerCase())),
)

// ----- sorting -----

function sortValue(f: FileEntry): string | number {
  switch (sortCol.value) {
    case 'name': return f.name.toLowerCase()
    case 'size': return f.size
    case 'uploadedAt': return f.uploadedAt
    case 'lastRun': return f.lastExecution?.completedAt ?? 0
    case 'success': return f.totalSuccessful
    case 'failed': return f.totalFailed
  }
}

const sortedFiles = computed(() => {
  const files = [...visibleFiles.value]
  files.sort((a, b) => {
    const av = sortValue(a)
    const bv = sortValue(b)
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir.value === 'asc' ? cmp : -cmp
  })
  return files
})

function setSort(col: SortCol) {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortCol.value = col
    sortDir.value = 'asc'
  }
}

// ----- navigation -----

function navigateTo(path: string) {
  currentDir.value = path
  filter.value = ''
}

// ----- job state -----

function isLoaded(filePath: string): boolean {
  return job.value?.fileId === filePath
}

// ----- actions -----

function loadFile(filePath: string) {
  loadJob(filePath)
}

function downloadFile(filePath: string, name: string) {
  const a = document.createElement('a')
  a.href = `/api/files/download?path=${encodeURIComponent(filePath)}`
  a.download = name
  a.click()
}

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  uploading.value = true
  try {
    const form = new FormData()
    if (currentDir.value) form.append('dir', currentDir.value)
    for (const f of files) form.append('file', f)
    await $fetch('/api/files', { method: 'POST', body: form })
    await refresh()
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function toggleFolderForm() {
  showFolderForm.value = !showFolderForm.value
  newFolderName.value = ''
  if (showFolderForm.value) {
    await nextTick()
    folderInput.value?.focus()
  }
}

async function createFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  const path = currentDir.value ? `${currentDir.value}/${name}` : name
  await $fetch('/api/files/mkdir', { method: 'POST', body: { path } })
  showFolderForm.value = false
  newFolderName.value = ''
  await refresh()
}

function confirmDelete(path: string, type: 'file' | 'folder', name: string) {
  confirmState.title = type === 'folder' ? `Delete folder "${name}"?` : `Delete "${name}"?`
  confirmState.message = type === 'folder'
    ? 'This will permanently delete the folder and all files inside it.'
    : 'This file will be permanently deleted.'
  confirmState.pendingPath = path
  confirmState.pendingType = type
  confirmState.open = true
}

async function runConfirmed() {
  confirmState.open = false
  const { pendingPath, pendingType } = confirmState
  await $fetch(`/api/files?path=${encodeURIComponent(pendingPath)}&type=${pendingType}`, { method: 'DELETE' })
  await refresh()
}

// ----- formatting -----

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function relDate(epochMs: number): string {
  const diff = Date.now() - epochMs
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(epochMs).toLocaleDateString()
}

function lastRunTitle(exec: ExecutionRecord): string {
  const when = new Date(exec.completedAt).toLocaleString()
  const parts = [`${exec.status.toUpperCase()} on ${when}`]
  if (exec.machineId && exec.machineId !== 'unknown') parts.push(`Machine: ${exec.machineName ?? exec.machineId}`)
  if (exec.errorMessage) parts.push(`Error: ${exec.errorMessage}`)
  return parts.join('\n')
}
</script>
