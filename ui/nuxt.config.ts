import tailwindcss from '@tailwindcss/vite'
import { version } from './package.json'

export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'three',
        'three/examples/jsm/controls/OrbitControls.js',
        'three/examples/jsm/lines/LineMaterial.js',
        'three/examples/jsm/lines/LineSegments2.js',
        'three/examples/jsm/lines/LineSegmentsGeometry.js',
      ],
    },
  },

  typescript: {
    strict: true,
  },

  nitro: {
    experimental: {
      websocket: true,
    },
    // serialport has a native .node binary — Nitro cannot bundle it, must treat as external
    externals: {
      external: ['serialport', '@serialport/bindings-cpp', '@serialport/parser-readline', '@serialport/stream'],
    },
  },

  runtimeConfig: {
    configPath: process.env.NUXT_CONFIG_PATH ?? '/app/config',
    dataPath: process.env.NUXT_DATA_PATH ?? '/app/data',
    jwtSecret: process.env.NUXT_JWT_SECRET ?? 'dev-secret-change-in-production',
    public: {
      appVersion: version,
    },
  },

  compatibilityDate: '2026-06-23',
})
