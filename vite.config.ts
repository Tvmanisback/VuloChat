import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the same build run on GitHub Pages (/VuloChat/),
// inside Electron (file://) and inside the Capacitor Android WebView.
// Three pages are built: the app (index.html), the email confirmation page (confirm.html),
// and the Terms, Privacy, Facts and FAQ page (info.html).
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
        info: resolve(__dirname, 'info.html'),
        developers: resolve(__dirname, 'developers.html'),
      },
    },
  },
});
