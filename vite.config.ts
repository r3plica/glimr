import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
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
