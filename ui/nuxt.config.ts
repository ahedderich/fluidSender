export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt', '@nuxt/eslint'],

  typescript: {
    strict: true,
  },

  runtimeConfig: {
    configPath: process.env.NUXT_CONFIG_PATH ?? '/app/config',
    dataPath: process.env.NUXT_DATA_PATH ?? '/app/data',
  },

  compatibilityDate: '2025-01-01',
})
