import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
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
