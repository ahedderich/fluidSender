<template>
  <SettingsCard title="Interface">
    <SettingsRow label="Theme">
      <button
        type="button"
        @click="ui.toggleDarkMode()"
        class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-md text-sm font-medium transition-colors"
      >
        <svg v-if="ui.darkMode" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
        {{ ui.darkMode ? 'Switch to Light' : 'Switch to Dark' }}
      </button>
    </SettingsRow>
    <SettingsRow label="Units">
      <div class="flex rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-medium">
        <button type="button" @click="s.app.units = 'mm'"
          :class="s.app.units === 'mm' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
          class="px-3 py-1.5 transition-colors">mm</button>
        <button type="button" @click="s.app.units = 'inch'"
          :class="s.app.units === 'inch' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
          class="px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-slate-600">inch</button>
      </div>
    </SettingsRow>
  </SettingsCard>

  <SettingsCard v-if="s.isElectron && currentUser.isAdmin" title="Network">
    <SettingsRow label="Expose on Network">
      <UiToggleSwitch v-model="s.app.network.exposeOnLan" />
    </SettingsRow>
    <SettingsRow label="Port">
      <input
        v-model.number="s.app.network.port"
        type="number"
        min="1024"
        max="65535"
        class="settings-input w-28"
      >
    </SettingsRow>
    <div class="px-3 pb-3 text-xs text-gray-500 dark:text-slate-400 space-y-1">
      <p>Makes FluidSender reachable from other devices on your network, not just this computer — anyone with access can control this machine.</p>
      <p>Takes effect after restarting FluidSender.</p>
    </div>
    <div class="px-3 pb-3">
      <template v-if="networkInfo?.exposed && networkInfo.addresses.length">
        <p class="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Currently reachable at:</p>
        <div v-for="addr in networkInfo.addresses" :key="addr" class="flex items-center gap-2 mb-1">
          <a
            :href="`http://${addr}:${networkInfo.port}/`"
            target="_blank"
            class="flex-1 min-w-0 text-xs px-2 py-1.5 rounded bg-gray-100 dark:bg-slate-900 text-blue-600 dark:text-blue-400 break-all hover:underline"
          >http://{{ addr }}:{{ networkInfo.port }}/</a>
          <button
            type="button"
            @click="copyAddress(`http://${addr}:${networkInfo.port}/`)"
            class="shrink-0 px-2 py-1.5 text-xs rounded bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
          >{{ copyLabel }}</button>
        </div>
      </template>
      <p v-else class="text-xs text-gray-500 dark:text-slate-400">
        Not currently reachable from your network{{ s.app.network.exposeOnLan ? ' — restart FluidSender to apply the setting above.' : '.' }}
      </p>
    </div>
  </SettingsCard>

  <SettingsCard title="Viewport Defaults">
    <SettingsRow label="Default View">
      <select v-model="s.app.viewport.defaultView" class="settings-input w-36">
        <option value="iso">Isometric</option>
        <option value="top">Top</option>
        <option value="front">Front</option>
        <option value="right">Right</option>
      </select>
    </SettingsRow>
    <SettingsRow label="Show Grid">
      <UiToggleSwitch v-model="s.app.viewport.showGrid" />
    </SettingsRow>
    <SettingsRow label="Show Axes">
      <UiToggleSwitch v-model="s.app.viewport.showAxes" />
    </SettingsRow>
  </SettingsCard>

  <SettingsCard title="About">
    <SettingsRow label="FluidSender">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600 dark:text-slate-400 font-mono">v{{ appVersion }}</span>
        <span
          v-if="updateAvailable"
          class="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
        >Update available</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Latest Release">
      <span class="text-sm text-gray-600 dark:text-slate-400 font-mono">
        {{ sync.appUpdateCheck.latestVersion ? `v${sync.appUpdateCheck.latestVersion}` : '—' }}
      </span>
    </SettingsRow>
    <SettingsRow label="Last Checked">
      <span class="text-xs text-gray-500 dark:text-slate-400">{{ lastCheckedLabel }}</span>
    </SettingsRow>
    <div class="px-3 pb-3">
      <button
        type="button"
        @click="s.checkAppVersion(true)"
        class="px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 transition-colors"
      >
        Check Now
      </button>
    </div>
  </SettingsCard>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'
import { useUiStore } from '~/stores/ui'
import { useSyncStore } from '~/stores/sync'
import { useCurrentUser } from '~/composables/useCurrentUser'
import { isNewerVersion } from '~~/shared/version'

const s = useSettingsStore()
const ui = useUiStore()
const sync = useSyncStore()
const currentUser = useCurrentUser()
const { public: { appVersion } } = useRuntimeConfig()

const updateAvailable = computed(() => {
  const latest = sync.appUpdateCheck.latestVersion
  return !!latest && isNewerVersion(latest, appVersion as string)
})

const lastCheckedLabel = computed(() => {
  const checkedAt = sync.appUpdateCheck.checkedAt
  return checkedAt ? new Date(checkedAt).toLocaleString() : 'Never checked'
})

const networkInfo = ref<{ exposed: boolean; port: string; addresses: string[] } | null>(null)
const copyLabel = ref('Copy')

async function copyAddress(address: string) {
  await navigator.clipboard?.writeText(address)
  copyLabel.value = 'Copied!'
  setTimeout(() => { copyLabel.value = 'Copy' }, 1500)
}

onMounted(() => {
  s.checkAppVersion()
  if (s.isElectron) {
    $fetch('/api/network-info').then((data) => { networkInfo.value = data as typeof networkInfo.value })
  }
})
</script>
