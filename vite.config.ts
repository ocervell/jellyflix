import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const SERVER = process.env.VITE_JELLYFIN_SERVER || 'https://jellyfin.example.com';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/jf': {
        target: SERVER,
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/jf/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['jellyfin-web/**', 'node_modules/**'],
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
