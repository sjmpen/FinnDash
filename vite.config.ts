import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built site works both on GitHub Pages (/FinnDash/) and locally.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
