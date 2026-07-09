<template>
  <SettingsCard title="Webcam">
    <SettingsRow label="Enabled">
      <UiToggleSwitch v-model="cam.enabled" />
    </SettingsRow>

    <div class="mx-3 mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-md">
      <p class="text-xs text-amber-700 dark:text-amber-400 font-medium">
        FluidSender does not transcode video. Point this at a stream that's already browser-playable —
        e.g. an HLS/WebRTC relay such as MediaMTX or go2rtc — not a raw RTSP URL.
      </p>
    </div>

    <template v-if="cam.enabled">
      <SettingsRow label="Stream URL">
        <input
          v-model="cam.streamUrl"
          type="text"
          class="settings-input w-80 font-mono"
          placeholder="http://192.168.1.50:1984/api/stream.m3u8?src=cnc-cam"
        />
      </SettingsRow>
      <SettingsRow label="Stream Type">
        <div class="flex rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-medium">
          <button
            type="button"
            @click="cam.streamType = 'hls'"
            :class="cam.streamType === 'hls' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
            class="px-3 py-1.5 transition-colors"
          >HLS (.m3u8)</button>
          <button
            type="button"
            @click="cam.streamType = 'native'"
            :class="cam.streamType === 'native' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
            class="px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-slate-600"
          >Direct Video</button>
        </div>
      </SettingsRow>
      <SettingsRow label="Default View Mode">
        <div class="flex rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-medium">
          <button
            v-for="m in defaultModes"
            :key="m.key"
            type="button"
            @click="cam.defaultMode = m.key"
            :class="cam.defaultMode === m.key ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
            class="px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-slate-600 first:border-l-0"
          >{{ m.label }}</button>
        </div>
      </SettingsRow>
      <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
        Each browser tab starts on this mode when the machine is selected, but can switch modes locally from the viewport — the stream only connects while a cam-showing mode is active.
      </p>
    </template>
  </SettingsCard>
</template>

<script setup lang="ts">
import type { MachineProfile } from '~/stores/settings'
import type { CamMode } from '~/types/webcam'

const machine = defineModel<MachineProfile>('machine', { required: true })

if (!machine.value.webcam) {
  machine.value.webcam = {
    enabled: false,
    streamUrl: '',
    streamType: 'hls',
    defaultMode: 'pip',
  }
}

const cam = computed(() => machine.value.webcam!)

const defaultModes: Array<{ key: CamMode; label: string }> = [
  { key: '3d', label: '3D' },
  { key: 'split', label: 'Half/Half' },
  { key: 'cam', label: 'Full Cam' },
  { key: 'pip', label: 'PiP' },
]
</script>
