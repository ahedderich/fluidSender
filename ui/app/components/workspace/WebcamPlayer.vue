<template>
  <div class="relative w-full h-full flex items-center justify-center bg-slate-900">
    <video
      ref="videoRef"
      class="w-full h-full object-contain"
      :class="{ invisible: status !== 'playing' }"
      autoplay
      muted
      playsinline
    />
    <div v-if="status !== 'playing'" class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div class="text-center px-4">
        <svg v-if="status === 'loading'" class="w-6 h-6 text-slate-500 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <svg v-else class="w-8 h-8 text-amber-500/80 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-8.99 3.75h.008v.008h-.008v-.008z" />
        </svg>
        <p class="text-slate-500 text-xs">{{ status === 'loading' ? 'Connecting to webcam…' : errorMessage }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type Hls from 'hls.js'
import type { WebcamStreamType } from '~/types/webcam'

// Remount this component (via a :key on streamUrl) rather than reacting to prop
// changes — keeps setup/teardown to a single, easy-to-reason-about lifecycle pair.
const props = defineProps<{
  streamUrl: string
  streamType: WebcamStreamType
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const status = ref<'loading' | 'playing' | 'error'>('loading')
const errorMessage = ref('')

let hls: Hls | null = null

async function start() {
  const video = videoRef.value
  if (!video) return

  // Safari plays HLS natively — only pull in hls.js (and its decode/buffer overhead)
  // when the browser actually needs it, and only while this element is mounted.
  if (props.streamType === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
    const { default: HlsCtor } = await import('hls.js')
    if (!videoRef.value) return // unmounted while the chunk was loading
    if (!HlsCtor.isSupported()) {
      status.value = 'error'
      errorMessage.value = 'HLS playback is not supported in this browser'
      return
    }
    const instance = new HlsCtor()
    hls = instance
    instance.on(HlsCtor.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        status.value = 'error'
        errorMessage.value = 'Webcam stream error — check the stream URL in machine settings'
      }
    })
    instance.loadSource(props.streamUrl)
    instance.attachMedia(video)
  } else {
    video.src = props.streamUrl
  }

  video.addEventListener('playing', () => { status.value = 'playing' })
  video.addEventListener('error', () => {
    status.value = 'error'
    errorMessage.value = 'Webcam stream error — check the stream URL in machine settings'
  })
}

function stop() {
  hls?.destroy()
  hls = null
  const video = videoRef.value
  if (video) {
    video.removeAttribute('src')
    video.load()
  }
}

onMounted(start)
onUnmounted(stop)
</script>
