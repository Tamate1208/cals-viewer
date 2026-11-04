import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vite'

const isSingleFile = process.env.BUILD_MODE === 'single'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isSingleFile ? [viteSingleFile()] : []),
  ],
  build: {
    target: 'esnext',
    assetsInlineLimit: isSingleFile ? 100000000 : 4096,
    chunkSizeWarningLimit: 5000,
    rollupOptions: isSingleFile
      ? {}
      : {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/jszip')) return 'jszip'
              if (id.includes('node_modules/lucide-react')) return 'icons'
              if (id.includes('node_modules/react')) return 'vendor'
              if (id.includes('src/utils/sxfParser')) return 'cad-parser'
              if (id.includes('src/utils/xmlParser')) return 'xml-parser'
            },
          },
        },
  },
})

