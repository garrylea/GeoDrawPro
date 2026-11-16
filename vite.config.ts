
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
    rollupOptions: {
      output: {
        // Keep rarely-changing vendor code in its own chunks so app edits don't
        // invalidate the whole bundle. KaTeX is dynamic-only, so this chunk is
        // still requested on demand; pdfjs already splits itself.
        manualChunks(id) {
          const p = id.replace(/\\/g, '/');
          if (!p.includes('/node_modules/')) return;
          if (p.includes('/node_modules/katex/')) return 'vendor-katex';
          if (p.includes('/node_modules/lucide-react/')) return 'vendor-icons';
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(p)) return 'vendor-react';
        },
      },
    },
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
