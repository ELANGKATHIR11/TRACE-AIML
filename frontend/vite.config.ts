import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // Standard HMR configuration
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/fastapi-proxy': {
          target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/fastapi-proxy/, ''),
        },
      },
    },
  };
});
