import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Provider traffic goes through the local gateway (npm run gateway); keys never reach the browser.
  server: { proxy: { '/api': { target: 'http://127.0.0.1:5241', changeOrigin: false } } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as never);
