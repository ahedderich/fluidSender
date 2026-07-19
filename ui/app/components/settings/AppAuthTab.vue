<template>
  <SettingsCard title="Authentication">
    <SettingsRow label="Require Login">
      <UiToggleSwitch v-model="s.app.auth.enabled" />
    </SettingsRow>
  </SettingsCard>

  <!-- API tokens are independent of session login above — they gate a separate,
       narrowly-scoped surface (/api/external/*) for third-party integrations,
       and stay available even when "Require Login" is off. -->
  <SettingsCard title="API Tokens">
    <p class="px-3 pt-2 pb-2 text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
      Tokens grant third-party tools (e.g. a CAM post-processor) access to the file-upload API only —
      never to this UI. See <code class="text-[11px]">docs/external-api.md</code> for integration details.
    </p>
    <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
      <div
        v-for="tok in apiTokens"
        :key="tok.id"
        class="flex items-center gap-3 px-3 py-2.5"
      >
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium text-gray-900 dark:text-slate-100">{{ tok.label }}</span>
          <p class="text-[11px] text-gray-400 dark:text-slate-500">
            {{ tok.lastUsedAt ? `Last used ${formatDate(tok.lastUsedAt)}` : 'Never used' }}
          </p>
        </div>
        <span
          v-if="tok.allowLoad"
          class="text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
        >can load</span>
        <button
          type="button"
          @click="removeToken(tok)"
          class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
          title="Revoke token"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div v-if="apiTokens.length === 0" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500">
        No API tokens configured
      </div>
    </div>
  </SettingsCard>

  <SettingsCard title="Generate API Token">
    <div v-if="revealedToken" class="px-3 pt-3 pb-2">
      <p class="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">
        Copy this token now — it will not be shown again.
      </p>
      <div class="flex items-center gap-2">
        <code class="flex-1 min-w-0 text-xs px-2 py-1.5 rounded bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-slate-200 break-all">{{ revealedToken.token }}</code>
        <button
          type="button"
          @click="copyRevealedToken"
          class="shrink-0 px-2 py-1.5 text-xs rounded bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
        >{{ copyLabel }}</button>
      </div>
      <button
        type="button"
        @click="revealedToken = null"
        class="mt-2 w-full py-1.5 text-xs rounded-md bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
      >Done</button>
    </div>
    <template v-else>
      <SettingsRow label="Label">
        <input v-model="newToken.label" type="text" class="settings-input w-48" placeholder="e.g. FreeCAD" autocomplete="off" />
      </SettingsRow>
      <SettingsRow label="Allow Load">
        <UiToggleSwitch v-model="newToken.allowLoad" />
      </SettingsRow>
      <div class="px-3 pb-3 pt-1">
        <p class="text-[11px] text-gray-400 dark:text-slate-500 mb-2">
          "Allow Load" lets this token start a job directly after uploading, not just store files.
        </p>
        <p v-if="newTokenError" class="text-xs text-red-500 dark:text-red-400 mb-2">{{ newTokenError }}</p>
        <button
          type="button"
          @click="submitNewToken"
          class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          Generate Token
        </button>
      </div>
    </template>
  </SettingsCard>

  <template v-if="s.app.auth.enabled">
    <SettingsCard title="Users">
      <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
        <div
          v-for="user in users"
          :key="user.id"
          class="flex items-center gap-3 px-3 py-2.5"
        >
          <div class="flex-1 min-w-0">
            <span class="text-sm font-medium text-gray-900 dark:text-slate-100">{{ user.username }}</span>
          </div>
          <span
            class="text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize shrink-0"
            :class="{
              'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400': user.role === 'viewer',
              'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300': user.role === 'operator',
              'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400': user.role === 'admin',
            }"
          >{{ user.role }}</span>
          <button
            type="button"
            @click="removeUser(user)"
            :disabled="user.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1"
            class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Remove user"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="users.length === 0" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500">
          No users configured
        </div>
      </div>
    </SettingsCard>

    <!-- Add new user -->
    <SettingsCard title="Add User">
      <SettingsRow label="Username">
        <input v-model="newUser.username" type="text" class="settings-input w-48" placeholder="username" autocomplete="off" />
      </SettingsRow>
      <SettingsRow label="Role">
        <select v-model="newUser.role" class="settings-input w-36">
          <option value="viewer">Viewer</option>
          <option value="operator">Operator</option>
          <option value="admin">Admin</option>
        </select>
      </SettingsRow>
      <SettingsRow label="Password">
        <input v-model="newUser.password" type="password" class="settings-input w-48" placeholder="Password" autocomplete="new-password" />
      </SettingsRow>
      <SettingsRow label="Confirm">
        <input v-model="newUser.confirm" type="password" class="settings-input w-48" placeholder="Confirm password" autocomplete="new-password" />
      </SettingsRow>
      <div class="px-3 pb-3 pt-1">
        <p v-if="newUserError" class="text-xs text-red-500 dark:text-red-400 mb-2">{{ newUserError }}</p>
        <button
          type="button"
          @click="submitNewUser"
          class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          Add User
        </button>
      </div>
    </SettingsCard>

    <!-- Role descriptions -->
    <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div class="px-3 py-2 border-b border-gray-100 dark:border-slate-700/60">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Role Permissions</h3>
      </div>
      <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
        <div v-for="role in roleDescriptions" :key="role.name" class="flex items-start gap-3 px-3 py-2.5">
          <span
            class="text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize mt-0.5 shrink-0"
            :class="{
              'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400': role.name === 'viewer',
              'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300': role.name === 'operator',
              'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400': role.name === 'admin',
            }"
          >{{ role.name }}</span>
          <p class="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">{{ role.description }}</p>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'
import { useConfirm } from '~/composables/useConfirm'
import { useCurrentUser } from '~/composables/useCurrentUser'
import type { UserRole } from '~/stores/settings'

const s = useSettingsStore()
const { confirm } = useConfirm()
const currentUser = useCurrentUser()

const users = ref<{ id: string; username: string; role: 'viewer' | 'operator' | 'admin' }[]>([])

async function loadUsers() {
  if (!currentUser.value.isAdmin) return
  users.value = await $fetch<typeof users.value>('/api/auth/users')
}

const newUser = reactive({ username: '', role: 'operator' as UserRole, password: '', confirm: '' })
const newUserError = ref('')

async function submitNewUser() {
  newUserError.value = ''
  if (!newUser.username.trim()) { newUserError.value = 'Username is required.'; return }
  if (!newUser.password) { newUserError.value = 'Password is required.'; return }
  if (newUser.password.length < 8) { newUserError.value = 'Password must be at least 8 characters.'; return }
  if (newUser.password !== newUser.confirm) { newUserError.value = 'Passwords do not match.'; return }
  try {
    await $fetch('/api/auth/users', {
      method: 'POST',
      body: { username: newUser.username.trim(), role: newUser.role, password: newUser.password },
    })
    await loadUsers()
    newUser.username = ''; newUser.password = ''; newUser.confirm = ''; newUser.role = 'operator'
  } catch (e: unknown) {
    newUserError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to add user.'
  }
}

const roleDescriptions = [
  { name: 'viewer', description: 'Can view machine state, position, and job progress. Cannot send commands or navigate.' },
  { name: 'operator', description: 'Can jog, run jobs, use probing, and adjust overrides. Cannot manage users or authentication settings.' },
  { name: 'admin', description: 'Full access including user management, authentication settings, and firmware configuration.' },
]

async function removeUser(user: { id: string; username: string }) {
  const ok = await confirm({
    title: `Remove "${user.username}"?`,
    message: 'The user will immediately lose access.',
    confirmLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  await $fetch(`/api/auth/users/${user.id}`, { method: 'DELETE' })
  await loadUsers()
}

interface ApiTokenSummary {
  id: string
  label: string
  allowLoad: boolean
  createdAt: number
  lastUsedAt: number | null
}

const apiTokens = ref<ApiTokenSummary[]>([])

async function loadApiTokens() {
  if (!currentUser.value.isAdmin) return
  apiTokens.value = await $fetch<ApiTokenSummary[]>('/api/auth/tokens')
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

const newToken = reactive({ label: '', allowLoad: false })
const newTokenError = ref('')
const revealedToken = ref<{ label: string; token: string } | null>(null)
const copyLabel = ref('Copy')

async function submitNewToken() {
  newTokenError.value = ''
  if (!newToken.label.trim()) { newTokenError.value = 'Label is required.'; return }
  try {
    const result = await $fetch<ApiTokenSummary & { token: string }>('/api/auth/tokens', {
      method: 'POST',
      body: { label: newToken.label.trim(), allowLoad: newToken.allowLoad },
    })
    // The raw token only ever exists in this one response — never persisted or refetchable.
    revealedToken.value = { label: result.label, token: result.token }
    await loadApiTokens()
    newToken.label = ''
    newToken.allowLoad = false
  } catch (e: unknown) {
    newTokenError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to create token.'
  }
}

async function copyRevealedToken() {
  if (!revealedToken.value) return
  await navigator.clipboard?.writeText(revealedToken.value.token)
  copyLabel.value = 'Copied!'
  setTimeout(() => { copyLabel.value = 'Copy' }, 1500)
}

async function removeToken(tok: { id: string; label: string }) {
  const ok = await confirm({
    title: `Revoke "${tok.label}"?`,
    message: 'Any integration using this token will immediately lose access.',
    confirmLabel: 'Revoke',
    danger: true,
  })
  if (!ok) return
  await $fetch(`/api/auth/tokens/${tok.id}`, { method: 'DELETE' })
  await loadApiTokens()
}

onMounted(() => {
  loadUsers()
  loadApiTokens()
})
</script>
