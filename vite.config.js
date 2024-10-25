// vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/rad-analyse/',
  plugins: [react()],
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
  server: {
    host: 'localhost',
    port: 3002,
  },
});
