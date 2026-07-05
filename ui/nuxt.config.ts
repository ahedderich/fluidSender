import tailwindcss from '@tailwindcss/vite'

const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.184.0'

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

  // Inject an importmap so the browser can resolve 'three' from CDN
  // without requiring it in the container's node_modules.
  app: {
    head: {
      script: [
        {
          type: 'importmap',
          innerHTML: JSON.stringify({
            imports: {
              three: `${THREE_CDN}/build/three.module.js`,
              'three/examples/jsm/controls/OrbitControls.js': `${THREE_CDN}/examples/jsm/controls/OrbitControls.js`,
              'three/examples/jsm/lines/LineSegments2.js': `${THREE_CDN}/examples/jsm/lines/LineSegments2.js`,
              'three/examples/jsm/lines/LineSegmentsGeometry.js': `${THREE_CDN}/examples/jsm/lines/LineSegmentsGeometry.js`,
              'three/examples/jsm/lines/LineMaterial.js': `${THREE_CDN}/examples/jsm/lines/LineMaterial.js`,
            },
          }),
        },
      ],
    },
  },

  nitro: {
    experimental: {
      websocket: true,
    },
  },

  runtimeConfig: {
    configPath: process.env.NUXT_CONFIG_PATH ?? '/app/config',
    dataPath: process.env.NUXT_DATA_PATH ?? '/app/data',
    jwtSecret: process.env.NUXT_JWT_SECRET ?? 'dev-secret-change-in-production',
  },

  compatibilityDate: '2026-06-23',
})
