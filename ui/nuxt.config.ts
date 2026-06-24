import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  typescript: {
    strict: true,
  },

  runtimeConfig: {
    configPath: process.env.NUXT_CONFIG_PATH ?? '/app/config',
    dataPath: process.env.NUXT_DATA_PATH ?? '/app/data',
  },

  compatibilityDate: '2026-06-23',
})
