import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  devServer: {
    host: '0.0.0.0',
  },

  typescript: {
    strict: true,
  },

  runtimeConfig: {
    // Server-side only
    simControlUrl: process.env.SIM_CONTROL_URL ?? 'http://localhost:8766',
    public: {
      // Exposed to the browser
      simControlWsUrl: process.env.SIM_CONTROL_WS_URL ?? 'ws://localhost:8766',
    },
  },

  compatibilityDate: '2026-06-23',
})
