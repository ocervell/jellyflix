import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.jahmyst.jellyflix',
  appName: 'Jellyflix',
  // Bundle the web assets; the user enters their Jellyfin server in-app on first run.
  webDir: 'dist',
  // http origin so LAN Jellyfin over plain http isn't blocked as mixed content.
  server: { androidScheme: 'http' },
  // Route the app's fetch/XHR through native HTTP so direct calls to the user's
  // Jellyfin server aren't blocked by browser CORS.
  plugins: { CapacitorHttp: { enabled: true } },
};

export default config;
