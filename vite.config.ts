import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/calls-api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/calls-api/, ''),
      },
      '/calls-ws': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/calls-ws/, ''),
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});
