import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { duplicateMarksPlugin } from './scripts/duplicate-marks-plugin.ts'

export default defineConfig({
  plugins: [react(), duplicateMarksPlugin(fileURLToPath(new URL('.', import.meta.url)))],
  server: {
    port: 5174,
    // Gallery images and prepared data are regenerated offline. Watching
    // ~140k files makes chokidar block the event loop for over a minute.
    watch: {
      ignored: ['**/public/galleries/**', '**/public/data/**'],
    },
  },
  preview: {
    port: 5174,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        'process.env.NODE_ENV': '"development"',
      },
    },
  },
})
