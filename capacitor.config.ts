import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.jahmyst.jellyflix',
  appName: 'Jellyflix',
  webDir: 'dist',
  // Thin wrapper: load the deployed web app so the /jf reverse proxy works and
  // updates ship with every redeploy. Replace with your reachable Jellyflix URL.
  server: { url: 'https://your-jellyfin-server.example', cleartext: false },
};

export default config;
