import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const darkMode = ref(true)
  const navMode = ref<'buttons' | 'joystick'>('buttons')
  const authEnabled = ref(false)
  const username = ref('admin')

  function toggleDarkMode() {
    darkMode.value = !darkMode.value
    applyTheme()
  }

  function applyTheme() {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', darkMode.value)
    }
  }

  return { darkMode, navMode, authEnabled, username, toggleDarkMode, applyTheme }
})
