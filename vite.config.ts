import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the same build run on GitHub Pages (/VuloChat/),
// inside Electron (file://) and inside the Capacitor Android WebView.
// Two pages are built: the app (index.html) and the email confirmation page (confirm.html).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        confirm: resolve(__dirname, 'confirm.html'),
      },
    },
  },
});
