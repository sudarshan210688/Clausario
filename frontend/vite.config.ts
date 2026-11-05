import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// /api is proxied to the backend so the session cookie stays same-origin (Architecture.md §8.1).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:5000';
  return {
    plugins: [react()],
    server: { proxy: { '/api': { target, changeOrigin: false } } },
    preview: { proxy: { '/api': { target, changeOrigin: false } } },
  };
});
