import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory'))
            return 'vendor-recharts';
          if (id.includes('lucide-react'))
            return 'vendor-lucide';
          if (id.includes('@tanstack'))
            return 'vendor-query';
          if (id.includes('zustand'))
            return 'vendor-zustand';
          if (id.includes('node_modules'))
            return 'vendor-react';
        },
      },
    },
  },
})
