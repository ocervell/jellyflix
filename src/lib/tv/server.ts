// Server resolution. The web/Docker build proxies same-origin `/jf` → Jellyfin
// (nginx/Vite). The bundled TV app has no proxy, so the user enters their
// Jellyfin URL once and we talk to it directly.

const SERVER_KEY = 'jellyflix.server';
const FORCE_TV_KEY = 'jellyflix.forceTv';

type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };

// The native Capacitor runtime injects a `Capacitor` global; a plain browser
// has none. `jellyflix.forceTv=1` lets us exercise the TV flow in a browser
// (dev + E2E), since Playwright has no Capacitor.
export function isTvBuild(): boolean {
  if ((globalThis as CapacitorGlobal).Capacitor?.isNativePlatform?.()) return true;
  try { return localStorage.getItem(FORCE_TV_KEY) === '1'; } catch { return false; }
}

export function getSavedServer(): string | null {
  try { return localStorage.getItem(SERVER_KEY); } catch { return null; }
}

export function saveServer(url: string): void {
  localStorage.setItem(SERVER_KEY, url);
}

export function clearServer(): void {
  localStorage.removeItem(SERVER_KEY);
}

// Web → same-origin proxy. TV → the saved server (null until the user picks one).
export function getServerUrl(): string | null {
  if (!isTvBuild()) return '/jf';
  return getSavedServer();
}

// Trim, strip trailing slashes, require an http(s) scheme. Returns null if unusable.
export function normalizeServerUrl(input: string): string | null {
  const t = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/i.test(t)) return null;
  return t;
}

// Confirm the URL is actually a Jellyfin server (public endpoint, no auth needed).
export async function probeServer(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/System/Info/Public`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return false;
    const j = await r.json();
    return typeof j?.Version === 'string' || typeof j?.Id === 'string';
  } catch {
    return false;
  }
}
