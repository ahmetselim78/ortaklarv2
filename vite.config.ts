import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { copyFileSync } from 'fs'

// pdf.js worker'ını .js uzantısıyla public/ klasörüne kopyalar.
// Böylece nginx'in .mjs MIME type eksikliğinden bağımsız olarak
// text/javascript ile servis edilir ve Web Worker olarak yüklenir.
const copyPdfWorkerPlugin = {
  name: 'copy-pdf-worker',
  buildStart() {
    copyFileSync(
      path.resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
      path.resolve(__dirname, 'public/pdf.worker.js'),
    )
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyPdfWorkerPlugin],
  //server: {
    //host: true,
  //},
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
})
