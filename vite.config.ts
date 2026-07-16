import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Never descend into build outputs. iso-build/chroot is a Debian
      // rootfs full of circular symlinks (e.g. /bin/X11 -> .) that make the
      // file watcher throw ELOOP and crash the dev server.
      ignored: ['**/iso-build/**', '**/src-tauri/target/**', '**/dist/**'],
    },
  },
  clearScreen: false,
})
