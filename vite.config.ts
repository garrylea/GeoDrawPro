
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // essential for electron to load assets from file:// protocol
  base: './', 
  define: {
    'process.env': {}
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
