import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const SERVER = process.env.VITE_JELLYFIN_SERVER || 'https://jellyfin.example.com';
// Opt-in host allowlist for reverse proxies / tunnels (Tailscale, Cloudflare, etc.).
// VITE_ALLOWED_HOSTS="all" (or "true") accepts any Host header — use for a tunnel with
// random hostnames. Otherwise pass a comma-separated list, e.g. ".ts.net,.trycloudflare.com".
const rawAllowed = process.env.VITE_ALLOWED_HOSTS?.trim();
const ALLOWED_HOSTS: true | string[] | undefined =
  rawAllowed === 'all' || rawAllowed === 'true'
    ? true
    : rawAllowed
      ? rawAllowed.split(',').map((h) => h.trim()).filter(Boolean)
      : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    ...(ALLOWED_HOSTS ? { allowedHosts: ALLOWED_HOSTS } : {}),
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
