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

  compatibilityDate: '2026-06-23',
})
