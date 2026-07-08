<template>
  <SettingsCard title="Authentication">
    <SettingsRow label="Require Login">
      <UiToggleSwitch v-model="s.app.auth.enabled" />
    </SettingsRow>
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

onMounted(() => loadUsers())
</script>
