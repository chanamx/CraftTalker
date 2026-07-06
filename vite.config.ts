import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const apiTarget = env.CRAFTTALKER_API_TARGET || 'http://localhost:3000'

  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/scripts/extensions/': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/version': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/user/files': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/User Avatars': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/characters': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/thumbnail': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/cors': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/server/**'],
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: 'lightningcss',
    rolldownOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
            },
            {
              name: 'vendor-router',
              test: /node_modules[\\/]react-router[\\/]/,
            },
            {
              name: 'vendor-query',
              test: /node_modules[\\/]@tanstack[\\/]/,
            },
            {
              name: 'vendor-motion',
              test: /node_modules[\\/]framer-motion[\\/]/,
            },
            {
              name: 'vendor-icons',
              test: /node_modules[\\/]lucide-react[\\/]/,
            },
            {
              name: 'vendor-markdown',
              test: /node_modules[\\/](marked|dompurify|katex)[\\/]/,
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/server/**',
    ],
    css: false,
  },
  }
})
