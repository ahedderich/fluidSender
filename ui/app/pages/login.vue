<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-slate-100">FluidSender</h1>
        <p class="text-sm text-gray-500 dark:text-slate-400 mt-1">Sign in to continue</p>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Username</label>
          <input v-model="username" type="text" class="settings-input w-full" autocomplete="username" @keydown.enter="submit" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
          <input v-model="password" type="password" class="settings-input w-full" autocomplete="current-password" @keydown.enter="submit" />
        </div>
        <p v-if="error" class="text-sm text-red-500 dark:text-red-400">{{ error }}</p>
        <button
          type="button"
          @click="submit"
          :disabled="loading"
          class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {{ loading ? 'Signing in…' : 'Sign In' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const { $reconnectWs } = useNuxtApp()

async function submit() {
  if (!username.value || !password.value) { error.value = 'Enter username and password'; return }
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { username: username.value, password: password.value } })
    $reconnectWs()
    await navigateTo('/')
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>
