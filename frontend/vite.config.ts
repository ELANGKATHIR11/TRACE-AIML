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
          target: process.env.TRACE_API_ORIGIN || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/fastapi-proxy/, ''),
          // The backend scopes trace_refresh to Path=/api/auth; through the proxy the browser
          // sees /fastapi-proxy/api/auth/*, so rewrite the cookie path to match.
          cookiePathRewrite: { '/api/auth': '/fastapi-proxy/api/auth' },
        },
      },
    },
  };
});
