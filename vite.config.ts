
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // app uses vite 5 while vitest 4 nests vite 7; plugin types clash but are runtime-compatible
  plugins: [react() as any],
  // essential for electron to load assets from file:// protocol
  base: './',
  server: {
    // Distinctive default so we don't clash with other apps on Vite's 5173.
    port: 5273,
    // If 5273 is busy, auto-try the next free port (browser dev).
    strictPort: false,
  },
  define: {
    'process.env': {}
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['utils/**', 'hooks/**', 'components/**', 'electron/**', 'server/**', 'App.tsx', 'index.tsx', 'constants.ts'],
      reporter: ['text', 'html'],
    }
  }
})
