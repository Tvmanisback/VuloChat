import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the same build run on GitHub Pages (/VuloChat/),
// inside Electron (file://) and inside the Capacitor Android WebView.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
