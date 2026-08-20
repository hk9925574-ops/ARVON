import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // important for electron
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@ricky0123/vad-web', 'onnxruntime-web', '@xenova/transformers']
  }
})
