import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3016,
      host: '0.0.0.0',
      proxy: {
        // Primary RDAP endpoints for scanning
        '/api/rdap/cz': {
          target: 'https://rdap.nic.cz',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/rdap\/cz/, '/domain'),
        },
        '/api/rdap/com': {
          target: 'https://rdap.verisign.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/rdap\/com/, '/com/v1/domain'),
        },
        '/api/rdap/app': {
          target: 'https://pubapi.registry.google',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/rdap\/app/, '/rdap/domain'),
        },
        // Secondary verification endpoints (TLD-specific)
        '/api/verify/app': {
          target: 'https://rdap.nic.google',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/verify\/app/, '/rdap/domain'),
        },
        '/api/verify/io': {
          target: 'https://rdap.identitydigital.services',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/verify\/io/, '/rdap/domain'),
        },
        '/api/verify/ai': {
          target: 'https://rdap.identitydigital.services',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/verify\/ai/, '/rdap/domain'),
        },
        '/api/verify/com': {
          target: 'https://rdap.verisign.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/verify\/com/, '/com/v1/domain'),
        },
        '/api/verify/cz': {
          target: 'https://rdap.nic.cz',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/verify\/cz/, '/domain'),
        },
        '/api/verify/rdap': {
          target: 'https://rdap.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/verify\/rdap/, '/domain'),
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});
