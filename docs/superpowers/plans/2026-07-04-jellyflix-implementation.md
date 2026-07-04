# Jellyflix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Netflix-style web frontend for Jellyfin (login → home rows → detail → real video playback) against a live Jellyfin server.

**Architecture:** Vite + React 18 + TypeScript SPA. All server access goes through `@jellyfin/sdk` wrapped in `@tanstack/react-query` hooks. A thin, React-free `lib/jellyfin/` layer owns auth, image-URL construction, and playback-URL resolution (fully unit-tested). Presentational components implement the Netflix visual system from CSS tokens. Playback uses HTML5 `<video>` + hls.js with server-side progress reporting.

**Tech Stack:** Vite, React 18, TypeScript (strict), @jellyfin/sdk, @tanstack/react-query, hls.js, CSS Modules + CSS custom properties, Vitest + React Testing Library.

## Global Constraints

- Node ≥ 20. Package manager: npm.
- TypeScript `strict: true`. No `any` in `lib/` or `hooks/` (SDK provides types).
- Target server (dev): `https://jellyfin.example.com`, reached via Vite proxy at path prefix `/jf` (so the browser calls same-origin `/jf/...` and Vite forwards to the server). Server base URL passed to the SDK is `/jf`.
- Client identity sent on every request: `Client="Jellyflix"`, `Version="0.1.0"`, `Device=<navigator-derived>`, `DeviceId=<persisted uuid>`.
- Dark theme only. All motion gated behind `prefers-reduced-motion`.
- Image cards target 16:9. Card image type priority: `Thumb` → `Primary` → parent/series fallback. Backdrops for billboard: `Backdrop` type.
- Ticks: Jellyfin uses 100-ns ticks. `seconds = ticks / 10_000_000`.
- Commit after every task with the shown message.
- Dev credentials live in git-ignored `.env.local` (`VITE_JELLYFIN_SERVER`, `JELLYFIN_TEST_USER`, `JELLYFIN_TEST_PASS`). Never commit them.
- Known server facts (probed): user views = Movies/TV Shows/Documentaries/Music/Playlists. Episodes carry only a `Primary` image (no Thumb/Backdrop) → card builder MUST fall back. Movies carry `Backdrop`, `Logo`, `Primary`. PlaybackInfo returns `SupportsDirectPlay/DirectStream` sources.

---

## Phase 1 — Scaffold, tokens, SDK bootstrap

### Task 1: Project scaffold + Vite proxy + test harness

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `vitest.setup.ts`
- Create: `src/styles/reset.css`, `src/styles/tokens.css`

**Interfaces:**
- Produces: a running dev server (`npm run dev`) and a passing test runner (`npm test`). CSS tokens available globally.

- [ ] **Step 1: Initialize package and install deps**

Run:
```bash
cd /home/jahmyst/Workspace/jellyfin-next-ui
npm init -y
npm i react react-dom @jellyfin/sdk @tanstack/react-query hls.js react-router-dom uuid
npm i -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom @types/uuid
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": "src",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vitest.setup.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

And `tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts`** (proxy + vitest config)

```ts
import { defineConfig } from 'vite';
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
  },
});
```

- [ ] **Step 4: Write `vitest.setup.ts`, `index.html`, `src/vite-env.d.ts`**

`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Jellyflix</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_JELLYFIN_SERVER: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
declare module '*.module.css';
```

- [ ] **Step 5: Write `src/styles/tokens.css` and `reset.css`**

`tokens.css`:
```css
:root {
  --nf-red: #E50914; --nf-red-hover: #F40612; --nf-red-active: #B20710;
  --nf-bg: #141414; --nf-black: #000; --nf-elevated: #2F2F2F; --nf-elevated-2: #181818;
  --nf-white: #FFF; --nf-grey: #B3B3B3; --nf-muted: #808080; --nf-match: #46D369;
  --nf-scrim: rgba(0,0,0,.7); --nf-outline: rgba(255,255,255,.5);
  --nf-inset: 4vw; --nf-card-gap: 4px; --nf-radius: 4px;
  --nf-nav-h: 68px;
  --nf-font: "Helvetica Neue", Helvetica, Arial, sans-serif;
  --nf-ease: cubic-bezier(.4,0,.2,1);
}
html { color-scheme: dark; }
```

`reset.css`:
```css
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
body { background: var(--nf-bg); color: var(--nf-white); font-family: var(--nf-font); }
img { display: block; max-width: 100%; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
a { color: inherit; text-decoration: none; }
ul { list-style: none; }
```

- [ ] **Step 6: Write `src/App.tsx` and `src/main.tsx`**

`src/App.tsx`:
```tsx
export default function App() {
  return <div data-testid="app-root">Jellyflix</div>;
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/reset.css';
import './styles/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

- [ ] **Step 7: Add scripts to `package.json`**

Set `"scripts"` to:
```json
{ "dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview", "test": "vitest run", "test:watch": "vitest" }
```

- [ ] **Step 8: Write a smoke test**

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app root', () => {
  render(<App />);
  expect(screen.getByTestId('app-root')).toBeInTheDocument();
});
```

- [ ] **Step 9: Run tests, verify pass**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite+React+TS app with tokens and Vite proxy"
```

---

## Phase 2 — SDK bootstrap, auth, session

### Task 2: SDK client bootstrap + device identity

**Files:**
- Create: `src/lib/jellyfin/device.ts`, `src/lib/jellyfin/device.test.ts`
- Create: `src/lib/jellyfin/api.ts`

**Interfaces:**
- Produces:
  - `getDeviceId(): string` — returns a persisted uuid (localStorage key `jellyflix.deviceId`), generating one on first call.
  - `getClientInfo(): { name: string; version: string }` → `{ name: 'Jellyflix', version: '0.1.0' }`.
  - `getDeviceInfo(): { name: string; id: string }`.
  - `createJellyfinApi(serverUrl: string, accessToken?: string): Api` — builds a configured `@jellyfin/sdk` `Api`.

- [ ] **Step 1: Write failing test for device id persistence**

`src/lib/jellyfin/device.test.ts`:
```ts
import { beforeEach, expect, test } from 'vitest';
import { getDeviceId, getClientInfo } from './device';

beforeEach(() => localStorage.clear());

test('getDeviceId persists a stable id', () => {
  const a = getDeviceId();
  expect(a).toMatch(/[0-9a-f-]{36}/);
  expect(getDeviceId()).toBe(a);
});

test('getClientInfo is Jellyflix', () => {
  expect(getClientInfo()).toEqual({ name: 'Jellyflix', version: '0.1.0' });
});
```

- [ ] **Step 2: Run, verify fail** — `npm test src/lib/jellyfin/device.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `device.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'jellyflix.deviceId';

export function getClientInfo() {
  return { name: 'Jellyflix', version: '0.1.0' };
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceInfo() {
  return { name: 'Jellyflix Web', id: getDeviceId() };
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Implement `api.ts`** (no dedicated test; exercised via hooks/integration)

```ts
import { Jellyfin } from '@jellyfin/sdk';
import type { Api } from '@jellyfin/sdk';
import { getClientInfo, getDeviceInfo } from './device';

export function createJellyfinApi(serverUrl: string, accessToken?: string): Api {
  const jellyfin = new Jellyfin({
    clientInfo: getClientInfo(),
    deviceInfo: getDeviceInfo(),
  });
  return jellyfin.createApi(serverUrl, accessToken);
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: SDK bootstrap and persisted device identity"
```

### Task 3: Auth + session persistence

**Files:**
- Create: `src/lib/jellyfin/session.ts`, `src/lib/jellyfin/session.test.ts`
- Create: `src/lib/jellyfin/auth.ts`

**Interfaces:**
- Consumes: `createJellyfinApi` (Task 2).
- Produces:
  - `type Session = { serverUrl: string; accessToken: string; userId: string; userName: string }`.
  - `saveSession(s: Session): void`, `loadSession(): Session | null`, `clearSession(): void` (localStorage key `jellyflix.session`).
  - `async authenticate(serverUrl: string, username: string, password: string): Promise<Session>` — calls `AuthenticateByName`, returns a Session.

- [ ] **Step 1: Write failing test for session storage**

`src/lib/jellyfin/session.test.ts`:
```ts
import { beforeEach, expect, test } from 'vitest';
import { saveSession, loadSession, clearSession, type Session } from './session';

const s: Session = { serverUrl: '/jf', accessToken: 't', userId: 'u', userName: 'jellyfin' };
beforeEach(() => localStorage.clear());

test('round-trips a session', () => {
  expect(loadSession()).toBeNull();
  saveSession(s);
  expect(loadSession()).toEqual(s);
  clearSession();
  expect(loadSession()).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `session.ts`**

```ts
export type Session = {
  serverUrl: string;
  accessToken: string;
  userId: string;
  userName: string;
};

const SESSION_KEY = 'jellyflix.session';

export function saveSession(s: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Implement `auth.ts`**

```ts
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { createJellyfinApi } from './api';
import type { Session } from './session';

export async function authenticate(
  serverUrl: string,
  username: string,
  password: string,
): Promise<Session> {
  const api = createJellyfinApi(serverUrl);
  const { data } = await getUserApi(api).authenticateUserByName({
    authenticateUserByName: { Username: username, Pw: password },
  });
  if (!data.AccessToken || !data.User?.Id) {
    throw new Error('Authentication failed');
  }
  return {
    serverUrl,
    accessToken: data.AccessToken,
    userId: data.User.Id,
    userName: data.User.Name ?? username,
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: authenticate and persist session"
```

### Task 4: API context provider + auth guard

**Files:**
- Create: `src/hooks/useApi.tsx`, `src/hooks/useApi.test.tsx`

**Interfaces:**
- Consumes: `createJellyfinApi`, `Session`, `loadSession/saveSession/clearSession`, `authenticate`.
- Produces:
  - `ApiProvider` (React context provider).
  - `useApi(): { api: Api; session: Session }` — throws if used unauthenticated (only rendered inside authenticated tree).
  - `useAuth(): { session: Session | null; login(u: string, p: string): Promise<void>; logout(): void }`.
  - Server URL comes from `import.meta.env.VITE_JELLYFIN_SERVER` in prod, but dev/browser always uses `/jf`. Store `'/jf'` as `serverUrl`.

- [ ] **Step 1: Write failing test** (context throws outside provider; provides session inside)

`src/hooks/useApi.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { expect, test, beforeEach } from 'vitest';
import { ApiProvider, useAuth } from './useApi';

beforeEach(() => localStorage.clear());

function AuthProbe() {
  const { session } = useAuth();
  return <div>session:{session ? session.userName : 'none'}</div>;
}

test('starts with no session', () => {
  render(<ApiProvider><AuthProbe /></ApiProvider>);
  expect(screen.getByText('session:none')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `useApi.tsx`**

```tsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Api } from '@jellyfin/sdk';
import { createJellyfinApi } from '../lib/jellyfin/api';
import { authenticate } from '../lib/jellyfin/auth';
import { clearSession, loadSession, saveSession, type Session } from '../lib/jellyfin/session';

const SERVER_URL = '/jf';

type AuthCtx = {
  session: Session | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
};
const AuthContext = createContext<AuthCtx | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const login = useCallback(async (u: string, p: string) => {
    const s = await authenticate(SERVER_URL, u, p);
    saveSession(s);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within ApiProvider');
  return ctx;
}

export function useApi(): { api: Api; session: Session } {
  const { session } = useAuth();
  if (!session) throw new Error('useApi requires an authenticated session');
  const api = useMemo(
    () => createJellyfinApi(session.serverUrl, session.accessToken),
    [session.serverUrl, session.accessToken],
  );
  return { api, session };
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ApiProvider with auth context and useApi guard"
```

### Task 5: React Query provider + router shell + Login route

**Files:**
- Create: `src/router.tsx`, `src/routes/Login.tsx`, `src/routes/Login.module.css`, `src/routes/Home.tsx` (placeholder), `src/components/common/RequireAuth.tsx`
- Modify: `src/main.tsx` (wrap in providers), `src/App.tsx` (render router)
- Create: `src/routes/Login.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `ApiProvider`.
- Produces: hash router with routes `/login`, `/` (Home, guarded), `/watch/:itemId` (later). `RequireAuth` redirects to `/login` when `session` is null.

- [ ] **Step 1: Write failing test — Login form submits credentials**

`src/routes/Login.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import * as useApiModule from '../hooks/useApi';

test('submits typed credentials to login()', async () => {
  const login = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(useApiModule, 'useAuth').mockReturnValue({ session: null, login, logout: vi.fn() });
  render(<MemoryRouter><Login /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText(/username/i), 'jellyfin');
  await userEvent.type(screen.getByLabelText(/password/i), 'pw');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(login).toHaveBeenCalledWith('jellyfin', 'pw');
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `Login.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useApi';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Incorrect username or password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={onSubmit}>
        <h1 className={styles.brand}>JELLYFLIX</h1>
        {error && <p className={styles.error}>{error}</p>}
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  );
}
```

`Login.module.css`:
```css
.wrap { min-height: 100%; display: grid; place-items: center; background: #000; }
.card { display: flex; flex-direction: column; gap: 16px; width: 320px; padding: 40px; background: rgba(0,0,0,.75); border-radius: 8px; }
.brand { color: var(--nf-red); font-weight: 800; letter-spacing: 1px; margin-bottom: 8px; }
.card label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: var(--nf-grey); }
.card input { padding: 12px; background: var(--nf-elevated); border-radius: var(--nf-radius); color: var(--nf-white); }
.card button { padding: 12px; background: var(--nf-red); color: #fff; font-weight: 700; border-radius: var(--nf-radius); }
.card button:hover { background: var(--nf-red-hover); }
.error { color: #f6c343; font-size: 14px; }
```

- [ ] **Step 4: Implement `RequireAuth.tsx`, `router.tsx`, wire `main.tsx`/`App.tsx`, Home placeholder**

`src/components/common/RequireAuth.tsx`:
```tsx
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useApi';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

`src/router.tsx`:
```tsx
import { createHashRouter } from 'react-router-dom';
import Login from './routes/Login';
import Home from './routes/Home';
import RequireAuth from './components/common/RequireAuth';

export const router = createHashRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <RequireAuth><Home /></RequireAuth> },
]);
```

`src/routes/Home.tsx` (placeholder):
```tsx
export default function Home() {
  return <div data-testid="home">Home</div>;
}
```

`src/App.tsx`:
```tsx
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

export default function App() {
  return <RouterProvider router={router} />;
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ApiProvider } from './hooks/useApi';
import './styles/reset.css';
import './styles/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ApiProvider>
  </StrictMode>,
);
```

Remove the old `src/App.test.tsx` (it renders `App` which now needs a router). Replace with a routing smoke test:

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from './components/common/RequireAuth';
import { ApiProvider } from './hooks/useApi';

test('unauthenticated user is redirected from guarded route', () => {
  localStorage.clear();
  render(
    <ApiProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/" element={<RequireAuth><div>secret</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
  expect(screen.getByText('login-page')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run all tests, verify pass.** `npm test`

- [ ] **Step 6: Manual check** — `npm run dev`, open app, confirm redirect to `/login`, sign in with `jellyfin` / (from `.env.local`), land on Home placeholder. If login network call fails, confirm the Vite proxy `/jf` is used by the SDK (serverUrl = `/jf`).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: router shell, auth guard, and Login route"
```

---

## Phase 3 — Image URLs + data hooks

### Task 6: Image URL builder with fallbacks

**Files:**
- Create: `src/lib/jellyfin/images.ts`, `src/lib/jellyfin/images.test.ts`

**Interfaces:**
- Consumes: `Api` (SDK), `BaseItemDto`.
- Produces:
  - `getCardImageUrl(api: Api, item: BaseItemDto, opts?: { width?: number }): string | null` — 16:9 card image. Priority: item `Thumb` → item `Primary` → `ParentThumb` → `SeriesThumb`/`SeriesPrimary` → null.
  - `getBackdropUrl(api: Api, item: BaseItemDto, opts?: { width?: number }): string | null` — `Backdrop` (item then parent) → null.
  - `getLogoUrl(api: Api, item: BaseItemDto): string | null` — `Logo` (item then parent).
  - `getPosterUrl(api: Api, item: BaseItemDto, opts?: { width?: number }): string | null` — `Primary`.
  - Internal `imageUrl(api, itemId, type, tag, fill)` uses `getImageApi(api).getItemImageUrlById`.

- [ ] **Step 1: Write failing tests** (use a fake api whose `getImageApi` path we stub by injecting a builder). Simplest: make the builder accept a low-level `buildUrl` we can assert on. Design the module so `getImageApi` is called; test via a mock of the SDK module.

`src/lib/jellyfin/images.test.ts`:
```ts
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('@jellyfin/sdk/lib/utils/api/image-api', () => ({
  getImageApi: () => ({
    getItemImageUrlById: (id: string, type: string, opts: { tag?: string; fillWidth?: number }) =>
      `/jf/Items/${id}/Images/${type}?tag=${opts.tag}&fillWidth=${opts.fillWidth}`,
  }),
}));

import { getCardImageUrl, getBackdropUrl } from './images';

const api = {} as never;

test('card prefers Thumb, falls back to Primary', () => {
  const withThumb = { Id: '1', ImageTags: { Thumb: 'tt', Primary: 'pp' } } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, withThumb, { width: 320 }))
    .toBe('/jf/Items/1/Images/Thumb?tag=tt&fillWidth=320');

  const primaryOnly = { Id: '2', ImageTags: { Primary: 'pp' } } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, primaryOnly, { width: 320 }))
    .toBe('/jf/Items/2/Images/Primary?tag=pp&fillWidth=320');
});

test('episode with only Primary and a series thumb falls back to Primary first', () => {
  const ep = { Id: '3', ImageTags: { Primary: 'ep' }, SeriesThumbImageTag: 'st', SeriesId: '9' } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, ep, { width: 320 })).toBe('/jf/Items/3/Images/Primary?tag=ep&fillWidth=320');
});

test('backdrop uses BackdropImageTags[0]', () => {
  const m = { Id: '4', BackdropImageTags: ['bd'] } as unknown as BaseItemDto;
  expect(getBackdropUrl(api, m, { width: 1280 })).toBe('/jf/Items/4/Images/Backdrop?tag=bd&fillWidth=1280');
});

test('returns null when no usable image', () => {
  const empty = { Id: '5', ImageTags: {} } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, empty)).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `images.ts`**

```ts
import type { Api } from '@jellyfin/sdk';
import { getImageApi } from '@jellyfin/sdk/lib/utils/api/image-api';
import { ImageType } from '@jellyfin/sdk/lib/generated-client';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

function build(api: Api, itemId: string, type: ImageType, tag: string, width: number): string {
  return getImageApi(api).getItemImageUrlById(itemId, type, {
    tag,
    fillWidth: Math.round(width * DPR),
    quality: 90,
  });
}

export function getCardImageUrl(api: Api, item: BaseItemDto, opts: { width?: number } = {}): string | null {
  const w = opts.width ?? 320;
  if (item.Id && item.ImageTags?.Thumb) return build(api, item.Id, ImageType.Thumb, item.ImageTags.Thumb, w);
  if (item.Id && item.ImageTags?.Primary) return build(api, item.Id, ImageType.Primary, item.ImageTags.Primary, w);
  if (item.ParentThumbItemId && item.ParentThumbImageTag) return build(api, item.ParentThumbItemId, ImageType.Thumb, item.ParentThumbImageTag, w);
  if (item.SeriesId && item.SeriesThumbImageTag) return build(api, item.SeriesId, ImageType.Thumb, item.SeriesThumbImageTag, w);
  if (item.SeriesId && item.SeriesPrimaryImageTag) return build(api, item.SeriesId, ImageType.Primary, item.SeriesPrimaryImageTag, w);
  return null;
}

export function getBackdropUrl(api: Api, item: BaseItemDto, opts: { width?: number } = {}): string | null {
  const w = opts.width ?? 1280;
  if (item.Id && item.BackdropImageTags?.length) return build(api, item.Id, ImageType.Backdrop, item.BackdropImageTags[0], w);
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) return build(api, item.ParentBackdropItemId, ImageType.Backdrop, item.ParentBackdropImageTags[0], w);
  return null;
}

export function getLogoUrl(api: Api, item: BaseItemDto): string | null {
  if (item.Id && item.ImageTags?.Logo) return build(api, item.Id, ImageType.Logo, item.ImageTags.Logo, 400);
  if (item.ParentLogoItemId && item.ParentLogoImageTag) return build(api, item.ParentLogoItemId, ImageType.Logo, item.ParentLogoImageTag, 400);
  return null;
}

export function getPosterUrl(api: Api, item: BaseItemDto, opts: { width?: number } = {}): string | null {
  const w = opts.width ?? 240;
  if (item.Id && item.ImageTags?.Primary) return build(api, item.Id, ImageType.Primary, item.ImageTags.Primary, w);
  return null;
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: image URL builder with card/backdrop/logo fallbacks"
```

### Task 7: React Query data hooks

**Files:**
- Create: `src/hooks/api/queryKeys.ts`
- Create: `src/hooks/api/useUserViews.ts`, `useResumeItems.ts`, `useNextUp.ts`, `useLatestMedia.ts`, `useItem.ts`, `useSeasons.ts`, `useEpisodes.ts`
- Create: `src/hooks/api/useResumeItems.test.tsx` (representative hook test)

**Interfaces:**
- Consumes: `useApi()` → `{ api, session }`.
- Produces (each returns `UseQueryResult<BaseItemDto[]>` unless noted):
  - `useUserViews()` → views (Movies/TV Shows/…).
  - `useResumeItems()` → Continue Watching.
  - `useNextUp()` → Next Up episodes.
  - `useLatestMedia(parentId: string)` → latest items in a library.
  - `useItem(itemId: string | undefined)` → `UseQueryResult<BaseItemDto>`.
  - `useSeasons(seriesId: string | undefined)` → seasons.
  - `useEpisodes(seriesId?: string, seasonId?: string)` → episodes.
- Shared `ITEM_FIELDS = [ItemFields.Overview, ItemFields.Genres, ItemFields.MediaSources, ItemFields.PrimaryImageAspectRatio]` where relevant.

- [ ] **Step 1: Write failing test for `useResumeItems`** (mock the SDK items-api + useApi)

`src/hooks/api/useResumeItems.test.tsx`:
```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';

vi.mock('../useApi', () => ({
  useApi: () => ({ api: {}, session: { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' } }),
}));
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({
  getItemsApi: () => ({
    getResumeItems: vi.fn().mockResolvedValue({ data: { Items: [{ Id: 'a', Name: 'Resume Me' }] } }),
  }),
}));

import { useResumeItems } from './useResumeItems';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('returns resume items', async () => {
  const { result } = renderHook(() => useResumeItems(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.[0].Name).toBe('Resume Me');
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement hooks.**

`src/hooks/api/queryKeys.ts`:
```ts
export const qk = {
  userViews: (userId: string) => ['userViews', userId] as const,
  resume: (userId: string) => ['resume', userId] as const,
  nextUp: (userId: string) => ['nextUp', userId] as const,
  latest: (userId: string, parentId: string) => ['latest', userId, parentId] as const,
  item: (userId: string, itemId: string) => ['item', userId, itemId] as const,
  seasons: (seriesId: string) => ['seasons', seriesId] as const,
  episodes: (seriesId: string, seasonId: string) => ['episodes', seriesId, seasonId] as const,
};
```

`src/hooks/api/useResumeItems.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { ItemFields, MediaType, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useResumeItems() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.resume(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getItemsApi(api).getResumeItems(
        {
          userId: session.userId,
          limit: 20,
          mediaTypes: [MediaType.Video],
          fields: [ItemFields.PrimaryImageAspectRatio],
          enableImageTypes: [ImageType.Primary, ImageType.Thumb, ImageType.Backdrop],
        },
        { signal },
      );
      return data.Items ?? [];
    },
  });
}
```

`src/hooks/api/useUserViews.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { getUserViewsApi } from '@jellyfin/sdk/lib/utils/api/user-views-api';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useUserViews() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.userViews(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getUserViewsApi(api).getUserViews({ userId: session.userId }, { signal });
      return data.Items ?? [];
    },
  });
}
```

`src/hooks/api/useNextUp.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { getTvShowsApi } from '@jellyfin/sdk/lib/utils/api/tv-shows-api';
import { ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useNextUp() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.nextUp(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getTvShowsApi(api).getNextUp(
        { userId: session.userId, limit: 20, fields: [ItemFields.PrimaryImageAspectRatio], enableImageTypes: [ImageType.Primary, ImageType.Thumb, ImageType.Backdrop] },
        { signal },
      );
      return data.Items ?? [];
    },
  });
}
```

`src/hooks/api/useLatestMedia.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import { ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useLatestMedia(parentId: string) {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.latest(session.userId, parentId),
    enabled: !!parentId,
    queryFn: async ({ signal }) => {
      const { data } = await getUserLibraryApi(api).getLatestMedia(
        { userId: session.userId, parentId, limit: 20, fields: [ItemFields.PrimaryImageAspectRatio, ItemFields.Overview], enableImageTypes: [ImageType.Primary, ImageType.Thumb, ImageType.Backdrop, ImageType.Logo] },
        { signal },
      );
      return data ?? [];
    },
  });
}
```

`src/hooks/api/useItem.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useItem(itemId: string | undefined) {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.item(session.userId, itemId ?? ''),
    enabled: !!itemId,
    queryFn: async ({ signal }) => {
      const { data } = await getUserLibraryApi(api).getItem({ userId: session.userId, itemId: itemId! }, { signal });
      return data;
    },
  });
}
```

`src/hooks/api/useSeasons.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { getTvShowsApi } from '@jellyfin/sdk/lib/utils/api/tv-shows-api';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useSeasons(seriesId: string | undefined) {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.seasons(seriesId ?? ''),
    enabled: !!seriesId,
    queryFn: async ({ signal }) => {
      const { data } = await getTvShowsApi(api).getSeasons({ seriesId: seriesId!, userId: session.userId }, { signal });
      return data.Items ?? [];
    },
  });
}
```

`src/hooks/api/useEpisodes.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { getTvShowsApi } from '@jellyfin/sdk/lib/utils/api/tv-shows-api';
import { ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useEpisodes(seriesId?: string, seasonId?: string) {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.episodes(seriesId ?? '', seasonId ?? ''),
    enabled: !!seriesId && !!seasonId,
    queryFn: async ({ signal }) => {
      const { data } = await getTvShowsApi(api).getEpisodes(
        { seriesId: seriesId!, userId: session.userId, seasonId, fields: [ItemFields.Overview], enableImageTypes: [ImageType.Primary] },
        { signal },
      );
      return data.Items ?? [];
    },
  });
}
```

- [ ] **Step 4: Run, verify pass.** `npm test src/hooks/api/useResumeItems.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: react-query data hooks for views/resume/nextup/latest/item/seasons/episodes"
```

---

## Phase 4 — Home layout (static cards first)

### Task 8: Ticks/format helpers + progress math

**Files:**
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `ticksToSeconds(ticks?: number | null): number`
  - `formatRuntime(ticks?: number | null): string` → e.g. `"1h 58m"` / `"47m"`.
  - `playedPercent(item: BaseItemDto): number` → 0–100 from `UserData.PlayedPercentage` (or 0).

- [ ] **Step 1: Write failing test**

`src/lib/format.test.ts`:
```ts
import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { ticksToSeconds, formatRuntime, playedPercent } from './format';

test('ticksToSeconds', () => {
  expect(ticksToSeconds(10_000_000)).toBe(1);
  expect(ticksToSeconds(null)).toBe(0);
});
test('formatRuntime', () => {
  expect(formatRuntime(70 * 60 * 10_000_000)).toBe('1h 10m');
  expect(formatRuntime(47 * 60 * 10_000_000)).toBe('47m');
  expect(formatRuntime(0)).toBe('');
});
test('playedPercent', () => {
  expect(playedPercent({ UserData: { PlayedPercentage: 52.7 } } as BaseItemDto)).toBe(52.7);
  expect(playedPercent({} as BaseItemDto)).toBe(0);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `format.ts`**

```ts
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export function ticksToSeconds(ticks?: number | null): number {
  return ticks ? ticks / 10_000_000 : 0;
}

export function formatRuntime(ticks?: number | null): string {
  const total = Math.round(ticksToSeconds(ticks) / 60);
  if (!total) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function playedPercent(item: BaseItemDto): number {
  return item.UserData?.PlayedPercentage ?? 0;
}
```

- [ ] **Step 4: Run, verify pass. Commit.**

```bash
git add -A && git commit -m "feat: ticks/runtime/progress format helpers"
```

### Task 9: Image component (blurhash-free fade) + ProgressBar + Card

**Files:**
- Create: `src/components/common/Img.tsx`, `src/components/common/Img.module.css`
- Create: `src/components/common/ProgressBar.tsx`, `src/components/common/ProgressBar.module.css`
- Create: `src/components/row/Card.tsx`, `src/components/row/Card.module.css`
- Create: `src/components/row/Card.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `getCardImageUrl`, `playedPercent`, `formatRuntime`.
- Produces:
  - `Img({ src, alt })` — fades in on load; neutral tile while loading / on error.
  - `ProgressBar({ percent })` — 4px red-on-grey bar; renders nothing if percent ≤ 0.
  - `Card({ item, onOpen })` — 16:9 boxart, title fallback text, progress bar. `onOpen(item)` fired on click.

- [ ] **Step 1: Write failing test for Card**

`src/components/row/Card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getCardImageUrl: () => 'http://img/x.jpg' }));

import Card from './Card';

const item = { Id: 'x', Name: 'Fanboys', UserData: { PlayedPercentage: 40 } } as BaseItemDto;

test('renders card image and fires onOpen', async () => {
  const onOpen = vi.fn();
  render(<Card item={item} onOpen={onOpen} />);
  expect(screen.getByRole('img', { name: /fanboys/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /fanboys/i }));
  expect(onOpen).toHaveBeenCalledWith(item);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `Img.tsx`**

```tsx
import { useState } from 'react';
import styles from './Img.module.css';

export function Img({ src, alt }: { src: string | null; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  if (!src) return <div className={styles.placeholder} aria-label={alt} role="img" />;
  return (
    <img
      className={loaded ? `${styles.img} ${styles.loaded}` : styles.img}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
    />
  );
}
```

`Img.module.css`:
```css
.img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .3s ease; background: var(--nf-elevated-2); }
.loaded { opacity: 1; }
.placeholder { width: 100%; height: 100%; background: var(--nf-elevated-2); }
```

- [ ] **Step 4: Implement `ProgressBar.tsx`**

```tsx
import styles from './ProgressBar.module.css';

export function ProgressBar({ percent }: { percent: number }) {
  if (percent <= 0) return null;
  return (
    <div className={styles.track} role="progressbar" aria-valuenow={Math.round(percent)}>
      <div className={styles.fill} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}
```

`ProgressBar.module.css`:
```css
.track { position: absolute; left: 6%; right: 6%; bottom: 6px; height: 4px; background: rgba(255,255,255,.3); border-radius: 2px; }
.fill { height: 100%; background: var(--nf-red); border-radius: 2px; }
```

- [ ] **Step 5: Implement `Card.tsx`**

```tsx
import { useApi } from '../../hooks/useApi';
import { getCardImageUrl } from '../../lib/jellyfin/images';
import { playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Card.module.css';

export default function Card({ item, onOpen }: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const src = getCardImageUrl(api, item, { width: 340 });
  const label = item.Name ?? 'Untitled';
  return (
    <button className={styles.card} onClick={() => onOpen(item)} aria-label={label}>
      <div className={styles.frame}>
        <Img src={src} alt={label} />
        {!src && <span className={styles.fallbackTitle}>{label}</span>}
        <ProgressBar percent={playedPercent(item)} />
      </div>
    </button>
  );
}
```

`Card.module.css`:
```css
.card { display: block; width: 100%; text-align: left; }
.frame { position: relative; aspect-ratio: 16 / 9; border-radius: var(--nf-radius); overflow: hidden; background: var(--nf-elevated-2); }
.fallbackTitle { position: absolute; inset: 0; display: grid; place-items: center; padding: 8px; text-align: center; font-weight: 700; color: var(--nf-white); }
```

- [ ] **Step 6: Run, verify pass.** Commit.

```bash
git add -A && git commit -m "feat: Img, ProgressBar, and 16:9 Card components"
```

### Task 10: Row (static, horizontal scroll)

**Files:**
- Create: `src/components/row/Row.tsx`, `src/components/row/Row.module.css`
- Create: `src/components/row/Row.test.tsx`

**Interfaces:**
- Consumes: `Card`.
- Produces: `Row({ title, items, onOpen })` — a titled horizontal strip of `Card`s. Renders nothing if `items` is empty. Each card sized so ~6 fit at wide viewport via CSS (`--cards: 6`).

- [ ] **Step 1: Write failing test**

`src/components/row/Row.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('./Card', () => ({ default: ({ item }: { item: BaseItemDto }) => <div>{item.Name}</div> }));
import Row from './Row';

test('renders title and items', () => {
  const items = [{ Id: '1', Name: 'A' }, { Id: '2', Name: 'B' }] as BaseItemDto[];
  render(<Row title="Latest" items={items} onOpen={() => {}} />);
  expect(screen.getByRole('heading', { name: 'Latest' })).toBeInTheDocument();
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();
});

test('renders nothing when empty', () => {
  const { container } = render(<Row title="Empty" items={[]} onOpen={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `Row.tsx`**

```tsx
import Card from './Card';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Row.module.css';

export default function Row({
  title, items, onOpen,
}: { title: string; items: BaseItemDto[]; onOpen: (i: BaseItemDto) => void }) {
  if (!items.length) return null;
  return (
    <section className={styles.row}>
      <h2 className={styles.title}>{title}</h2>
      <ul className={styles.strip}>
        {items.map((item) => (
          <li className={styles.cell} key={item.Id}>
            <Card item={item} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`Row.module.css`:
```css
.row { margin: 0 0 3vw; }
.title { font-size: clamp(14px, 1.4vw, 24px); font-weight: 700; color: #e5e5e5; padding: 0 var(--nf-inset); margin-bottom: 8px; }
.strip {
  --cards: 6;
  display: grid; grid-auto-flow: column;
  grid-auto-columns: calc((100% - 2 * var(--nf-inset) - 5 * var(--nf-card-gap)) / var(--cards));
  gap: var(--nf-card-gap);
  padding: 0 var(--nf-inset);
  overflow-x: auto; scroll-behavior: smooth;
  scrollbar-width: none;
}
.strip::-webkit-scrollbar { display: none; }
@media (max-width: 1400px) { .strip { --cards: 5; } }
@media (max-width: 1100px) { .strip { --cards: 4; } }
@media (max-width: 800px)  { .strip { --cards: 3; } }
@media (max-width: 500px)  { .strip { --cards: 2; } }
```

- [ ] **Step 4: Run, verify pass. Commit.**

```bash
git add -A && git commit -m "feat: horizontal Row of cards with responsive cards-per-row"
```

### Task 11: TopNav + Billboard + Home assembly

**Files:**
- Create: `src/components/nav/TopNav.tsx`, `src/components/nav/TopNav.module.css`
- Create: `src/components/home/Billboard.tsx`, `src/components/home/Billboard.module.css`
- Create: `src/components/common/useScrolled.ts`
- Modify: `src/routes/Home.tsx`, create `src/routes/Home.module.css`
- Create: `src/components/home/Billboard.test.tsx`

**Interfaces:**
- Consumes: `useUserViews`, `useResumeItems`, `useNextUp`, `useLatestMedia`, `useApi`, `getBackdropUrl`, `getLogoUrl`, `useAuth`.
- Produces:
  - `useScrolled(threshold=80): boolean`.
  - `TopNav()` — fixed bar; transparent → solid when scrolled; logo + nav links + logout.
  - `Billboard({ item, onPlay, onMoreInfo })` — backdrop, logo/title, synopsis, Play + More Info.
  - `Home` composes billboard + all rows, wires `onOpen` to open DetailModal (Task 13) and `onPlay` to navigate `/watch/:id`.

- [ ] **Step 1: Write failing test for Billboard**

`src/components/home/Billboard.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getBackdropUrl: () => 'http://bd', getLogoUrl: () => null }));

import Billboard from './Billboard';

const item = { Id: 'm1', Name: 'November', Overview: 'A film.' } as BaseItemDto;

test('shows title, synopsis, and fires Play', async () => {
  const onPlay = vi.fn();
  render(<Billboard item={item} onPlay={onPlay} onMoreInfo={() => {}} />);
  expect(screen.getByRole('heading', { name: 'November' })).toBeInTheDocument();
  expect(screen.getByText('A film.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /play/i }));
  expect(onPlay).toHaveBeenCalledWith(item);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `useScrolled.ts`**

```ts
import { useEffect, useState } from 'react';

export function useScrolled(threshold = 80): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}
```

- [ ] **Step 4: Implement `TopNav.tsx`**

```tsx
import { useAuth } from '../../hooks/useApi';
import { useScrolled } from '../common/useScrolled';
import styles from './TopNav.module.css';

export default function TopNav() {
  const scrolled = useScrolled(80);
  const { logout } = useAuth();
  return (
    <header className={scrolled ? `${styles.nav} ${styles.solid}` : styles.nav}>
      <div className={styles.left}>
        <span className={styles.logo}>JELLYFLIX</span>
        <nav className={styles.links}>
          <a href="#/">Home</a>
          <a href="#/">TV Shows</a>
          <a href="#/">Movies</a>
        </nav>
      </div>
      <button className={styles.logout} onClick={logout}>Sign out</button>
    </header>
  );
}
```

`TopNav.module.css`:
```css
.nav { position: fixed; top: 0; left: 0; right: 0; height: var(--nf-nav-h); z-index: 100;
  display: flex; align-items: center; justify-content: space-between; padding: 0 var(--nf-inset);
  background: linear-gradient(180deg, rgba(0,0,0,.7), transparent); transition: background-color .4s ease; }
.solid { background: var(--nf-bg); }
.left { display: flex; align-items: center; gap: 32px; }
.logo { color: var(--nf-red); font-weight: 800; letter-spacing: 1px; font-size: 22px; }
.links { display: flex; gap: 20px; }
.links a { color: var(--nf-grey); font-size: 14px; }
.links a:hover { color: var(--nf-white); }
.logout { color: var(--nf-grey); font-size: 14px; }
.logout:hover { color: var(--nf-white); }
@media (max-width: 800px) { .links { display: none; } }
```

- [ ] **Step 5: Implement `Billboard.tsx`**

```tsx
import { useApi } from '../../hooks/useApi';
import { getBackdropUrl, getLogoUrl } from '../../lib/jellyfin/images';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Billboard.module.css';

export default function Billboard({
  item, onPlay, onMoreInfo,
}: { item: BaseItemDto; onPlay: (i: BaseItemDto) => void; onMoreInfo: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const backdrop = getBackdropUrl(api, item, { width: 1920 });
  const logo = getLogoUrl(api, item);
  return (
    <div className={styles.billboard}>
      {backdrop && <img className={styles.bg} src={backdrop} alt="" />}
      <div className={styles.scrim} />
      <div className={styles.content}>
        {logo
          ? <img className={styles.logo} src={logo} alt={item.Name ?? ''} />
          : <h1 className={styles.title}>{item.Name}</h1>}
        {item.Overview && <p className={styles.synopsis}>{item.Overview}</p>}
        <div className={styles.buttons}>
          <button className={styles.play} onClick={() => onPlay(item)}>▶ Play</button>
          <button className={styles.info} onClick={() => onMoreInfo(item)}>ⓘ More Info</button>
        </div>
      </div>
    </div>
  );
}
```

`Billboard.module.css`:
```css
.billboard { position: relative; height: 80vh; min-height: 480px; margin-bottom: -6vw; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.scrim { position: absolute; inset: 0;
  background:
    linear-gradient(90deg, rgba(20,20,20,.9) 0%, rgba(20,20,20,.4) 40%, transparent 60%),
    linear-gradient(0deg, var(--nf-bg) 0%, transparent 35%); }
.content { position: absolute; left: var(--nf-inset); bottom: 12vw; max-width: 40%; }
.logo { max-width: 100%; max-height: 180px; margin-bottom: 16px; }
.title { font-size: clamp(28px, 4vw, 64px); font-weight: 800; margin-bottom: 16px; }
.synopsis { font-size: 18px; line-height: 1.4; text-shadow: 0 2px 4px rgba(0,0,0,.6); margin-bottom: 20px; }
.buttons { display: flex; gap: 12px; }
.play, .info { display: inline-flex; align-items: center; gap: 8px; padding: 8px 24px; border-radius: var(--nf-radius); font-weight: 700; }
.play { background: #fff; color: #000; }
.play:hover { background: rgba(255,255,255,.75); }
.info { background: rgba(109,109,110,.7); color: #fff; }
.info:hover { background: rgba(109,109,110,.4); }
@media (max-width: 800px) { .content { max-width: 70%; bottom: 20vw; } }
```

- [ ] **Step 6: Implement `Home.tsx`** (rows + billboard; DetailModal wired in Task 13, for now `onOpen` navigates nowhere — use a local state stub that Task 13 replaces)

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import TopNav from '../components/nav/TopNav';
import Billboard from '../components/home/Billboard';
import Row from '../components/row/Row';
import { useUserViews } from '../hooks/api/useUserViews';
import { useResumeItems } from '../hooks/api/useResumeItems';
import { useNextUp } from '../hooks/api/useNextUp';
import { useLatestMedia } from '../hooks/api/useLatestMedia';
import styles from './Home.module.css';

function LatestRow({ view, onOpen }: { view: BaseItemDto; onOpen: (i: BaseItemDto) => void }) {
  const { data = [] } = useLatestMedia(view.Id ?? '');
  return <Row title={`Latest ${view.Name}`} items={data} onOpen={onOpen} />;
}

export default function Home() {
  const navigate = useNavigate();
  const { data: views = [] } = useUserViews();
  const { data: resume = [] } = useResumeItems();
  const { data: nextUp = [] } = useNextUp();
  const [detail, setDetail] = useState<BaseItemDto | null>(null); // Task 13 renders DetailModal from this

  const mediaViews = useMemo(
    () => views.filter((v) => v.CollectionType === 'movies' || v.CollectionType === 'tvshows'),
    [views],
  );
  const hero = resume[0] ?? nextUp[0] ?? undefined;

  const onOpen = (i: BaseItemDto) => setDetail(i);
  const onPlay = (i: BaseItemDto) => navigate(`/watch/${i.Id}`);

  return (
    <div className={styles.page}>
      <TopNav />
      {hero && <Billboard item={hero} onPlay={onPlay} onMoreInfo={onOpen} />}
      <div className={styles.rows}>
        <Row title="Continue Watching" items={resume} onOpen={onOpen} />
        <Row title="Next Up" items={nextUp} onOpen={onOpen} />
        {mediaViews.map((v) => <LatestRow key={v.Id} view={v} onOpen={onOpen} />)}
      </div>
      {/* Task 13: {detail && <DetailModal itemId={detail.Id} onClose={() => setDetail(null)} onPlay={onPlay} />} */}
    </div>
  );
}
```

`Home.module.css`:
```css
.page { min-height: 100%; padding-bottom: 40px; }
.rows { position: relative; z-index: 1; }
```

- [ ] **Step 7: Run tests, verify pass.** `npm test`

- [ ] **Step 8: Manual check** — `npm run dev`, log in, confirm billboard + Continue Watching + Next Up + Latest rows render real artwork from the server. Fix image fallbacks if any row shows blank tiles (episodes → Primary).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: TopNav, Billboard, and Home assembly with live rows"
```

---

## Phase 5 — High-fidelity interactions (hover preview + arrow paging)

### Task 12: PreviewCard hover-expand + Row arrow paging

**Files:**
- Create: `src/components/row/PreviewCard.tsx`, `src/components/row/PreviewCard.module.css`
- Create: `src/lib/paging.ts`, `src/lib/paging.test.ts`
- Modify: `src/components/row/Row.tsx` (+ `Row.module.css`) to add arrow buttons and use `PreviewCard`
- Create: `src/components/row/PreviewCard.test.tsx`

**Interfaces:**
- Produces:
  - `nextScrollLeft(el: { scrollLeft: number; clientWidth: number; scrollWidth: number }, dir: 1 | -1): number` — pure paging math (one visible page per click, clamped).
  - `PreviewCard({ item, onOpen, onPlay })` — resting 16:9 card that on hover (dwell) shows an info panel with Play / More Info and metadata. Gated behind `prefers-reduced-motion` and pointer:fine.

- [ ] **Step 1: Write failing test for paging math**

`src/lib/paging.test.ts`:
```ts
import { expect, test } from 'vitest';
import { nextScrollLeft } from './paging';

test('pages right by one viewport, clamped to end', () => {
  expect(nextScrollLeft({ scrollLeft: 0, clientWidth: 1000, scrollWidth: 3000 }, 1)).toBe(1000);
  expect(nextScrollLeft({ scrollLeft: 2500, clientWidth: 1000, scrollWidth: 3000 }, 1)).toBe(2000);
});
test('pages left, clamped to 0', () => {
  expect(nextScrollLeft({ scrollLeft: 1500, clientWidth: 1000, scrollWidth: 3000 }, -1)).toBe(500);
  expect(nextScrollLeft({ scrollLeft: 200, clientWidth: 1000, scrollWidth: 3000 }, -1)).toBe(0);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `paging.ts`**

```ts
export function nextScrollLeft(
  el: { scrollLeft: number; clientWidth: number; scrollWidth: number },
  dir: 1 | -1,
): number {
  const max = el.scrollWidth - el.clientWidth;
  const target = el.scrollLeft + dir * el.clientWidth;
  return Math.max(0, Math.min(max, target));
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Write failing test for PreviewCard** (buttons present, onPlay fires)

`src/components/row/PreviewCard.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getCardImageUrl: () => 'http://img' }));

import PreviewCard from './PreviewCard';

const item = { Id: 'x', Name: 'Fanboys', ProductionYear: 2009, RunTimeTicks: 5880 * 10_000_000 } as BaseItemDto;

test('play button fires onPlay', async () => {
  const onPlay = vi.fn();
  render(<PreviewCard item={item} onOpen={() => {}} onPlay={onPlay} />);
  await userEvent.click(screen.getByRole('button', { name: /^play/i }));
  expect(onPlay).toHaveBeenCalledWith(item);
});
```

- [ ] **Step 6: Run, verify fail.**

- [ ] **Step 7: Implement `PreviewCard.tsx`**

```tsx
import { useApi } from '../../hooks/useApi';
import { getCardImageUrl } from '../../lib/jellyfin/images';
import { formatRuntime, playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './PreviewCard.module.css';

export default function PreviewCard({
  item, onOpen, onPlay,
}: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void; onPlay: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const src = getCardImageUrl(api, item, { width: 400 });
  const label = item.Name ?? 'Untitled';
  return (
    <div className={styles.card}>
      <button className={styles.art} onClick={() => onOpen(item)} aria-label={label}>
        <Img src={src} alt={label} />
        {!src && <span className={styles.fallbackTitle}>{label}</span>}
        <ProgressBar percent={playedPercent(item)} />
      </button>
      <div className={styles.panel}>
        <div className={styles.actions}>
          <button className={styles.play} onClick={() => onPlay(item)} aria-label={`Play ${label}`}>▶</button>
          <button className={styles.more} onClick={() => onOpen(item)} aria-label={`More info ${label}`}>⌄</button>
        </div>
        <div className={styles.meta}>
          {item.ProductionYear && <span>{item.ProductionYear}</span>}
          {item.RunTimeTicks ? <span>{formatRuntime(item.RunTimeTicks)}</span> : null}
        </div>
        <div className={styles.name}>{label}</div>
      </div>
    </div>
  );
}
```

`PreviewCard.module.css`:
```css
.card { position: relative; }
.art { display: block; width: 100%; position: relative; aspect-ratio: 16/9; border-radius: var(--nf-radius); overflow: hidden; background: var(--nf-elevated-2); }
.fallbackTitle { position: absolute; inset: 0; display: grid; place-items: center; padding: 8px; text-align: center; font-weight: 700; }
.panel { position: absolute; left: 0; right: 0; top: 100%; background: var(--nf-elevated-2); border-radius: 0 0 var(--nf-radius) var(--nf-radius);
  padding: 12px; opacity: 0; pointer-events: none; transform: translateY(-6px); transition: opacity .2s ease; box-shadow: 0 12px 24px rgba(0,0,0,.6); }
.actions { display: flex; gap: 8px; margin-bottom: 8px; }
.play, .more { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--nf-outline); display: grid; place-items: center; }
.play { background: #fff; color: #000; border-color: #fff; }
.meta { display: flex; gap: 8px; font-size: 13px; color: var(--nf-grey); }
.name { margin-top: 4px; font-weight: 700; font-size: 14px; }

@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .card { transition: transform .3s var(--nf-ease); transition-delay: .4s; }
  .card:hover { transform: scale(1.4); z-index: 20; transition-delay: 0s; }
  .card:hover .panel { opacity: 1; pointer-events: auto; transform: translateY(0); }
}
```

- [ ] **Step 8: Update `Row.tsx` to use PreviewCard + arrow buttons**

Replace `Row.tsx` body with:
```tsx
import { useRef } from 'react';
import PreviewCard from './PreviewCard';
import { nextScrollLeft } from '../../lib/paging';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Row.module.css';

export default function Row({
  title, items, onOpen, onPlay,
}: { title: string; items: BaseItemDto[]; onOpen: (i: BaseItemDto) => void; onPlay: (i: BaseItemDto) => void }) {
  const stripRef = useRef<HTMLUListElement>(null);
  if (!items.length) return null;
  const page = (dir: 1 | -1) => {
    const el = stripRef.current;
    if (el) el.scrollTo({ left: nextScrollLeft(el, dir), behavior: 'smooth' });
  };
  return (
    <section className={styles.row}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.viewport}>
        <button className={`${styles.arrow} ${styles.left}`} aria-label="Scroll left" onClick={() => page(-1)}>‹</button>
        <ul className={styles.strip} ref={stripRef}>
          {items.map((item) => (
            <li className={styles.cell} key={item.Id}>
              <PreviewCard item={item} onOpen={onOpen} onPlay={onPlay} />
            </li>
          ))}
        </ul>
        <button className={`${styles.arrow} ${styles.right}`} aria-label="Scroll right" onClick={() => page(1)}>›</button>
      </div>
    </section>
  );
}
```

Append to `Row.module.css`:
```css
.viewport { position: relative; }
.arrow { position: absolute; top: 0; bottom: 0; width: var(--nf-inset); z-index: 30; font-size: 2rem; color: #fff;
  opacity: 0; transition: opacity .2s ease; }
.viewport:hover .arrow { opacity: 1; }
.left { left: 0; background: linear-gradient(90deg, rgba(0,0,0,.7), transparent); }
.right { right: 0; background: linear-gradient(270deg, rgba(0,0,0,.7), transparent); }
.cell { overflow: visible; }
@media (max-width: 800px) { .arrow { display: none; } }
```

Also update `Home.tsx` `Row`/`LatestRow` usages to pass `onPlay` (already have `onPlay` in Home): add `onPlay={onPlay}` to every `<Row .../>` and to `LatestRow` (thread the prop through).

- [ ] **Step 9: Update `Row.test.tsx`** to pass `onPlay={() => {}}` and mock `./PreviewCard` instead of `./Card`. Update the mock line to:
```tsx
vi.mock('./PreviewCard', () => ({ default: ({ item }: { item: BaseItemDto }) => <div>{item.Name}</div> }));
```
and add `onPlay={() => {}}` to both `render(<Row ... />)` calls.

- [ ] **Step 10: Run all tests, verify pass. Manual check hover-expand + arrows in dev.**

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: hover-expand PreviewCard and arrow paging with clamped page math"
```

---

## Phase 6 — Detail modal

### Task 13: DetailModal + EpisodeList

**Files:**
- Create: `src/components/detail/DetailModal.tsx`, `src/components/detail/DetailModal.module.css`
- Create: `src/components/detail/EpisodeList.tsx`, `src/components/detail/EpisodeList.module.css`
- Modify: `src/routes/Home.tsx` (render the modal from `detail` state)
- Create: `src/components/detail/DetailModal.test.tsx`

**Interfaces:**
- Consumes: `useItem`, `useSeasons`, `useEpisodes`, `useApi`, `getBackdropUrl`, `getLogoUrl`, `formatRuntime`.
- Produces:
  - `DetailModal({ itemId, onClose, onPlay })` — modal with hero, metadata, and for series an `EpisodeList`. Close on backdrop click / X / Escape.
  - `EpisodeList({ seriesId, onPlay })` — season dropdown + episode rows (thumb, index, title, runtime, progress).

- [ ] **Step 1: Write failing test** (movie: shows title + Play; calls onPlay)

`src/components/detail/DetailModal.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getBackdropUrl: () => 'http://bd', getLogoUrl: () => null }));
vi.mock('../../hooks/api/useItem', () => ({
  useItem: () => ({ data: { Id: 'm1', Name: 'November', Type: 'Movie', Overview: 'x', ProductionYear: 2017 } as BaseItemDto, isLoading: false }),
}));
vi.mock('./EpisodeList', () => ({ default: () => <div>episodes</div> }));

import DetailModal from './DetailModal';

test('renders movie detail and plays', async () => {
  const onPlay = vi.fn();
  render(<DetailModal itemId="m1" onClose={() => {}} onPlay={onPlay} />);
  expect(screen.getByRole('heading', { name: 'November' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /play/i }));
  expect(onPlay).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `EpisodeList.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useSeasons } from '../../hooks/api/useSeasons';
import { useEpisodes } from '../../hooks/api/useEpisodes';
import { getCardImageUrl } from '../../lib/jellyfin/images';
import { formatRuntime, playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './EpisodeList.module.css';

export default function EpisodeList({ seriesId, onPlay }: { seriesId: string; onPlay: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const { data: seasons = [] } = useSeasons(seriesId);
  const [seasonId, setSeasonId] = useState<string | undefined>();
  useEffect(() => { if (!seasonId && seasons[0]?.Id) setSeasonId(seasons[0].Id); }, [seasons, seasonId]);
  const { data: episodes = [] } = useEpisodes(seriesId, seasonId);

  return (
    <div className={styles.wrap}>
      {seasons.length > 1 && (
        <select className={styles.season} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {seasons.map((s) => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
        </select>
      )}
      <ul className={styles.list}>
        {episodes.map((ep) => (
          <li key={ep.Id}>
            <button className={styles.ep} onClick={() => onPlay(ep)}>
              <span className={styles.idx}>{ep.IndexNumber}</span>
              <span className={styles.thumb}>
                <Img src={getCardImageUrl(api, ep, { width: 200 })} alt={ep.Name ?? ''} />
                <ProgressBar percent={playedPercent(ep)} />
              </span>
              <span className={styles.info}>
                <span className={styles.epTitle}>{ep.Name} <span className={styles.rt}>{formatRuntime(ep.RunTimeTicks)}</span></span>
                <span className={styles.overview}>{ep.Overview}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`EpisodeList.module.css`:
```css
.wrap { margin-top: 24px; }
.season { background: var(--nf-elevated); color: #fff; padding: 8px 12px; border-radius: var(--nf-radius); margin-bottom: 16px; }
.list { display: flex; flex-direction: column; }
.ep { display: grid; grid-template-columns: 32px 160px 1fr; gap: 16px; align-items: center; width: 100%; text-align: left;
  padding: 16px 0; border-top: 1px solid #333; }
.ep:hover { background: rgba(255,255,255,.03); }
.idx { color: var(--nf-grey); font-size: 20px; text-align: center; }
.thumb { position: relative; aspect-ratio: 16/9; border-radius: var(--nf-radius); overflow: hidden; background: var(--nf-elevated-2); }
.info { display: flex; flex-direction: column; gap: 6px; }
.epTitle { font-weight: 700; }
.rt { color: var(--nf-grey); font-weight: 400; font-size: 13px; margin-left: 8px; }
.overview { color: var(--nf-grey); font-size: 14px; line-height: 1.4; }
```

- [ ] **Step 4: Implement `DetailModal.tsx`**

```tsx
import { useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useItem } from '../../hooks/api/useItem';
import { getBackdropUrl, getLogoUrl } from '../../lib/jellyfin/images';
import { formatRuntime } from '../../lib/format';
import EpisodeList from './EpisodeList';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './DetailModal.module.css';

export default function DetailModal({
  itemId, onClose, onPlay,
}: { itemId: string; onClose: () => void; onPlay: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const { data: item, isLoading } = useItem(itemId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        {isLoading || !item ? (
          <div className={styles.loading}>Loading…</div>
        ) : (
          <>
            <div className={styles.hero}>
              {getBackdropUrl(api, item, { width: 1280 }) && (
                <img className={styles.heroBg} src={getBackdropUrl(api, item, { width: 1280 })!} alt="" />
              )}
              <div className={styles.heroScrim} />
              <div className={styles.heroContent}>
                {getLogoUrl(api, item)
                  ? <img className={styles.logo} src={getLogoUrl(api, item)!} alt={item.Name ?? ''} />
                  : <h1 className={styles.title}>{item.Name}</h1>}
                <button className={styles.play} onClick={() => onPlay(item)}>▶ Play</button>
              </div>
            </div>
            <div className={styles.body}>
              <div className={styles.metaRow}>
                {item.ProductionYear && <span>{item.ProductionYear}</span>}
                {item.RunTimeTicks ? <span>{formatRuntime(item.RunTimeTicks)}</span> : null}
                {item.OfficialRating && <span className={styles.badge}>{item.OfficialRating}</span>}
              </div>
              {item.Overview && <p className={styles.overview}>{item.Overview}</p>}
              {item.Genres?.length ? <p className={styles.genres}>Genres: {item.Genres.join(', ')}</p> : null}
              {item.Type === 'Series' && item.Id && <EpisodeList seriesId={item.Id} onPlay={onPlay} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

`DetailModal.module.css`:
```css
.backdrop { position: fixed; inset: 0; z-index: 200; background: var(--nf-scrim); display: grid; place-items: start center; overflow-y: auto; padding: 40px 0; }
.modal { position: relative; width: min(900px, 92vw); background: var(--nf-elevated-2); border-radius: 8px; overflow: hidden; }
.close { position: absolute; top: 16px; right: 16px; z-index: 5; width: 36px; height: 36px; border-radius: 50%; background: #181818; color: #fff; }
.hero { position: relative; aspect-ratio: 16/9; }
.heroBg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.heroScrim { position: absolute; inset: 0; background: linear-gradient(0deg, var(--nf-elevated-2), transparent 50%); }
.heroContent { position: absolute; left: 40px; bottom: 32px; }
.logo { max-width: 320px; max-height: 140px; margin-bottom: 16px; }
.title { font-size: 40px; font-weight: 800; margin-bottom: 16px; }
.play { display: inline-flex; align-items: center; gap: 8px; background: #fff; color: #000; font-weight: 700; padding: 8px 24px; border-radius: var(--nf-radius); }
.body { padding: 24px 40px 40px; }
.metaRow { display: flex; gap: 12px; align-items: center; color: var(--nf-grey); margin-bottom: 16px; }
.badge { border: 1px solid var(--nf-outline); padding: 0 6px; font-size: 12px; }
.overview { line-height: 1.5; margin-bottom: 12px; }
.genres { color: var(--nf-grey); font-size: 14px; }
.loading { padding: 80px; text-align: center; color: var(--nf-grey); }
```

- [ ] **Step 5: Wire modal into `Home.tsx`** — replace the Task 12 comment with:
```tsx
{detail?.Id && (
  <DetailModal itemId={detail.Id} onClose={() => setDetail(null)} onPlay={onPlay} />
)}
```
and add `import DetailModal from '../components/detail/DetailModal';`.

- [ ] **Step 6: Run tests, verify pass. Manual: open a movie and a series, confirm episode list loads and season switch works.**

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: DetailModal with metadata and series EpisodeList"
```

---

## Phase 7 — Playback

### Task 14: Device profile + stream URL resolver

**Files:**
- Create: `src/lib/jellyfin/deviceProfile.ts`
- Create: `src/lib/jellyfin/playback.ts`, `src/lib/jellyfin/playback.test.ts`

**Interfaces:**
- Consumes: `Api`, `Session`, SDK `media-info-api`, `MediaSourceInfo`, `PlaybackInfoResponse`.
- Produces:
  - `buildDeviceProfile(): DeviceProfile` — minimal browser profile (h264/hevc/aac/mkv/mp4 direct; HLS/ts transcode).
  - `async fetchPlaybackInfo(api, userId, itemId, startTicks?): Promise<{ mediaSource: MediaSourceInfo; playSessionId: string }>`.
  - `resolveStreamUrl(serverUrl: string, token: string, itemId: string, mediaSource: MediaSourceInfo, deviceId: string): { url: string; isHls: boolean }` — direct-play/stream vs transcoding URL.

- [ ] **Step 1: Write failing test for `resolveStreamUrl`**

`src/lib/jellyfin/playback.test.ts`:
```ts
import { expect, test } from 'vitest';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { resolveStreamUrl } from './playback';

const base = { url: '/jf', token: 'tok', deviceId: 'dev', itemId: 'itm' };

test('direct stream when SupportsDirectStream', () => {
  const ms = { Id: 'ms1', Container: 'mkv', SupportsDirectStream: true, SupportsDirectPlay: true } as MediaSourceInfo;
  const r = resolveStreamUrl(base.url, base.token, base.itemId, ms, base.deviceId);
  expect(r.isHls).toBe(false);
  expect(r.url).toBe('/jf/Videos/itm/stream.mkv?Static=true&mediaSourceId=ms1&deviceId=dev&api_key=tok');
});

test('hls transcode when TranscodingUrl present and hls subprotocol', () => {
  const ms = { Id: 'ms2', SupportsDirectStream: false, SupportsTranscoding: true, TranscodingUrl: '/videos/itm/master.m3u8?x=1', TranscodingSubProtocol: 'hls' } as MediaSourceInfo;
  const r = resolveStreamUrl(base.url, base.token, base.itemId, ms, base.deviceId);
  expect(r.isHls).toBe(true);
  expect(r.url).toBe('/jf/videos/itm/master.m3u8?x=1');
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `deviceProfile.ts`**

```ts
import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client';

export function buildDeviceProfile(): DeviceProfile {
  return {
    MaxStreamingBitrate: 120_000_000,
    MaxStaticBitrate: 100_000_000,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v,mkv,webm', Type: 'Video', VideoCodec: 'h264,hevc,vp8,vp9,av1', AudioCodec: 'aac,mp3,ac3,eac3,opus,flac,vorbis' },
    ],
    TranscodingProfiles: [
      { Container: 'ts', Type: 'Video', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac,mp3', Context: 'Streaming' },
    ],
    CodecProfiles: [],
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
    ],
  } as DeviceProfile;
}
```

- [ ] **Step 4: Implement `playback.ts`**

```ts
import type { Api } from '@jellyfin/sdk';
import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { buildDeviceProfile } from './deviceProfile';

export async function fetchPlaybackInfo(
  api: Api, userId: string, itemId: string, startTicks = 0,
): Promise<{ mediaSource: MediaSourceInfo; playSessionId: string }> {
  const { data } = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId,
    playbackInfoDto: {
      UserId: userId,
      DeviceProfile: buildDeviceProfile(),
      StartTimeTicks: startTicks,
      MaxStreamingBitrate: 120_000_000,
      AutoOpenLiveStream: true,
    },
  });
  const mediaSource = data.MediaSources?.[0];
  if (!mediaSource) throw new Error('No playable media source');
  return { mediaSource, playSessionId: data.PlaySessionId ?? '' };
}

export function resolveStreamUrl(
  serverUrl: string, token: string, itemId: string, ms: MediaSourceInfo, deviceId: string,
): { url: string; isHls: boolean } {
  if (ms.TranscodingUrl && ms.TranscodingSubProtocol === 'hls') {
    return { url: `${serverUrl}${ms.TranscodingUrl}`, isHls: true };
  }
  if (ms.SupportsDirectStream || ms.SupportsDirectPlay) {
    const container = (ms.Container ?? 'mp4').split(',')[0];
    const q = new URLSearchParams({
      Static: 'true',
      mediaSourceId: ms.Id ?? itemId,
      deviceId,
      api_key: token,
    });
    return { url: `${serverUrl}/Videos/${itemId}/stream.${container}?${q.toString()}`, isHls: false };
  }
  if (ms.TranscodingUrl) {
    return { url: `${serverUrl}${ms.TranscodingUrl}`, isHls: ms.TranscodingSubProtocol === 'hls' };
  }
  throw new Error('No streamable URL for media source');
}
```

> NOTE: the test expects param order `Static, mediaSourceId, deviceId, api_key`. `URLSearchParams` preserves insertion order, so the assertion matches.

- [ ] **Step 5: Run, verify pass. Commit.**

```bash
git add -A && git commit -m "feat: device profile, PlaybackInfo fetch, and stream URL resolver"
```

### Task 15: Progress reporting

**Files:**
- Create: `src/lib/jellyfin/reporting.ts`

**Interfaces:**
- Consumes: `Api`, SDK `playstate-api`.
- Produces:
  - `reportStart(api, { itemId, playSessionId, positionTicks })`
  - `reportProgress(api, { itemId, playSessionId, positionTicks, isPaused })`
  - `reportStopped(api, { itemId, playSessionId, positionTicks })`

  (No dedicated unit test — thin SDK wrappers exercised via manual integration.)

- [ ] **Step 1: Implement `reporting.ts`**

```ts
import type { Api } from '@jellyfin/sdk';
import { getPlaystateApi } from '@jellyfin/sdk/lib/utils/api/playstate-api';

type Base = { itemId: string; playSessionId: string; positionTicks: number };

export async function reportStart(api: Api, p: Base): Promise<void> {
  await getPlaystateApi(api).reportPlaybackStart({
    playbackStartInfo: { ItemId: p.itemId, PlaySessionId: p.playSessionId, PositionTicks: p.positionTicks, CanSeek: true },
  });
}

export async function reportProgress(api: Api, p: Base & { isPaused: boolean }): Promise<void> {
  await getPlaystateApi(api).reportPlaybackProgress({
    playbackProgressInfo: { ItemId: p.itemId, PlaySessionId: p.playSessionId, PositionTicks: p.positionTicks, IsPaused: p.isPaused },
  });
}

export async function reportStopped(api: Api, p: Base): Promise<void> {
  await getPlaystateApi(api).reportPlaybackStopped({
    playbackStopInfo: { ItemId: p.itemId, PlaySessionId: p.playSessionId, PositionTicks: p.positionTicks },
  });
}
```

- [ ] **Step 2: Typecheck** — `npx tsc -b`. Commit.

```bash
git add -A && git commit -m "feat: playback progress reporting wrappers"
```

### Task 16: VideoPlayer + Watch route

**Files:**
- Create: `src/routes/Watch.tsx`, `src/routes/Watch.module.css`
- Create: `src/components/player/VideoPlayer.tsx`, `src/components/player/VideoPlayer.module.css`
- Modify: `src/router.tsx` (add `/watch/:itemId`)
- Create: `src/components/player/VideoPlayer.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `useItem`, `fetchPlaybackInfo`, `resolveStreamUrl`, `reportStart/Progress/Stopped`, `getDeviceId`, hls.js.
- Produces:
  - `VideoPlayer({ src, isHls, poster, onProgress, startSeconds, onBack })` — HTML5 `<video>`; attaches hls.js when `isHls`; calls `onProgress(seconds, paused)` every ~10s and on pause/seek; seeks to `startSeconds` on load. Native controls for MVP.
  - `Watch` route: reads `:itemId`, fetches item + playback info, resolves URL, renders `VideoPlayer`, wires reporting, navigates back on exit.

- [ ] **Step 1: Write failing test for VideoPlayer** (renders a video element with given src for non-HLS)

`src/components/player/VideoPlayer.test.tsx`:
```tsx
import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } } }));
import VideoPlayer from './VideoPlayer';

test('renders a video element with src for progressive source', () => {
  const { container } = render(
    <VideoPlayer src="http://x/stream.mp4" isHls={false} poster={null} startSeconds={0} onProgress={() => {}} onBack={() => {}} />,
  );
  const video = container.querySelector('video');
  expect(video).not.toBeNull();
  expect(video?.getAttribute('src')).toBe('http://x/stream.mp4');
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `VideoPlayer.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({
  src, isHls, poster, startSeconds, onProgress, onBack,
}: {
  src: string; isHls: boolean; poster: string | null; startSeconds: number;
  onProgress: (seconds: number, paused: boolean) => void; onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | undefined;
    if (isHls && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }
    const onLoaded = () => { if (startSeconds > 0) video.currentTime = startSeconds; };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => { video.removeEventListener('loadedmetadata', onLoaded); hls?.destroy(); };
  }, [src, isHls, startSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tick = () => onProgress(video.currentTime, video.paused);
    const id = window.setInterval(tick, 10_000);
    const onPause = () => onProgress(video.currentTime, true);
    const onPlay = () => onProgress(video.currentTime, false);
    const onSeeked = () => onProgress(video.currentTime, video.paused);
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    video.addEventListener('seeked', onSeeked);
    return () => {
      window.clearInterval(id);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [onProgress]);

  return (
    <div className={styles.wrap}>
      <button className={styles.back} onClick={onBack} aria-label="Back">‹ Back</button>
      <video ref={videoRef} className={styles.video} poster={poster ?? undefined} controls autoPlay />
    </div>
  );
}
```

`VideoPlayer.module.css`:
```css
.wrap { position: fixed; inset: 0; background: #000; z-index: 300; }
.video { width: 100%; height: 100%; }
.back { position: absolute; top: 20px; left: 20px; z-index: 5; color: #fff; font-size: 18px; padding: 8px 16px; background: rgba(0,0,0,.5); border-radius: var(--nf-radius); }
```

- [ ] **Step 4: Implement `Watch.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useItem } from '../hooks/api/useItem';
import { getDeviceId } from '../lib/jellyfin/device';
import { getBackdropUrl } from '../lib/jellyfin/images';
import { fetchPlaybackInfo, resolveStreamUrl } from '../lib/jellyfin/playback';
import { reportStart, reportProgress, reportStopped } from '../lib/jellyfin/reporting';
import { ticksToSeconds } from '../lib/format';
import VideoPlayer from '../components/player/VideoPlayer';

export default function Watch() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const { api, session } = useApi();
  const { data: item } = useItem(itemId);
  const [stream, setStream] = useState<{ url: string; isHls: boolean } | null>(null);
  const sessionRef = useRef<{ playSessionId: string } | null>(null);
  const startTicks = item?.UserData?.PlaybackPositionTicks ?? 0;

  useEffect(() => {
    let active = true;
    (async () => {
      const { mediaSource, playSessionId } = await fetchPlaybackInfo(api, session.userId, itemId, startTicks);
      if (!active) return;
      sessionRef.current = { playSessionId };
      const resolved = resolveStreamUrl(session.serverUrl, session.accessToken, itemId, mediaSource, getDeviceId());
      setStream(resolved);
      await reportStart(api, { itemId, playSessionId, positionTicks: startTicks });
    })().catch(() => { if (active) setStream(null); });
    return () => { active = false; };
  }, [api, session, itemId, startTicks]);

  const onProgress = useCallback((seconds: number, paused: boolean) => {
    const ps = sessionRef.current?.playSessionId;
    if (!ps) return;
    void reportProgress(api, { itemId, playSessionId: ps, positionTicks: Math.round(seconds * 10_000_000), isPaused: paused });
  }, [api, itemId]);

  const onBack = useCallback(() => {
    const ps = sessionRef.current?.playSessionId;
    const video = document.querySelector('video');
    const secs = video?.currentTime ?? 0;
    if (ps) void reportStopped(api, { itemId, playSessionId: ps, positionTicks: Math.round(secs * 10_000_000) });
    navigate(-1);
  }, [api, itemId, navigate]);

  if (!stream) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Preparing playback…</div>;
  return (
    <VideoPlayer
      src={stream.url}
      isHls={stream.isHls}
      poster={item ? getBackdropUrl(api, item, { width: 1280 }) : null}
      startSeconds={ticksToSeconds(startTicks)}
      onProgress={onProgress}
      onBack={onBack}
    />
  );
}
```

- [ ] **Step 5: Add route** in `router.tsx`:
```tsx
import Watch from './routes/Watch';
// inside the routes array:
{ path: '/watch/:itemId', element: <RequireAuth><Watch /></RequireAuth> },
```

- [ ] **Step 6: Run tests, verify pass.** `npm test`

- [ ] **Step 7: Manual integration** — `npm run dev`, log in, click Play on a Continue-Watching item: video should start at the saved position; let it play ~15s, hit Back, reload Home, confirm the Continue Watching progress bar advanced (progress reporting works). Try a movie Play from Billboard and from the DetailModal.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: VideoPlayer with hls.js and Watch route with progress reporting"
```

---

## Phase 8 — Polish

### Task 17: Loading skeletons + row error/empty states

**Files:**
- Create: `src/components/common/RowSkeleton.tsx`, `src/components/common/RowSkeleton.module.css`
- Modify: `src/routes/Home.tsx` (show skeletons while `isLoading`; guard row queries with error fallback), `src/components/row/Row.tsx` if needed.

**Interfaces:**
- Produces: `RowSkeleton({ title })` — a titled row of shimmer tiles.

- [ ] **Step 1: Implement `RowSkeleton.tsx`**

```tsx
import styles from './RowSkeleton.module.css';

export default function RowSkeleton({ title }: { title: string }) {
  return (
    <section className={styles.row}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.strip}>
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.tile} />)}
      </div>
    </section>
  );
}
```

`RowSkeleton.module.css`:
```css
.row { margin: 0 0 3vw; }
.title { font-size: clamp(14px,1.4vw,24px); font-weight: 700; color: #e5e5e5; padding: 0 var(--nf-inset); margin-bottom: 8px; }
.strip { display: grid; grid-auto-flow: column; grid-auto-columns: calc((100% - 2*var(--nf-inset) - 20px)/6); gap: var(--nf-card-gap); padding: 0 var(--nf-inset); }
.tile { aspect-ratio: 16/9; border-radius: var(--nf-radius); background: linear-gradient(90deg, #1a1a1a, #2a2a2a, #1a1a1a); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .tile { animation: none; } }
```

- [ ] **Step 2: Use in `Home.tsx`** — for the top rows, render `<RowSkeleton title="Continue Watching" />` when `useResumeItems().isLoading`, etc. Example for the resume row:
```tsx
const resumeQ = useResumeItems();
// ...
{resumeQ.isLoading ? <RowSkeleton title="Continue Watching" /> : <Row title="Continue Watching" items={resumeQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
```
Apply the same pattern to Next Up. (`Row` already renders nothing on empty, and a failed query yields `data = []` → row hidden, so a broken row never breaks the page.)

- [ ] **Step 3: Run tests, verify pass. Manual: throttle network in devtools, confirm skeletons show then resolve.**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: loading skeletons and resilient row states"
```

### Task 18: README + full test + typecheck gate

**Files:**
- Create: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Write `README.md`**

```markdown
# Jellyflix

A Netflix-style web UI for Jellyfin. React + Vite + TypeScript, talking to a Jellyfin server via @jellyfin/sdk.

## Dev
1. Copy `.env.local` with `VITE_JELLYFIN_SERVER=https://your-server`.
2. `npm install`
3. `npm run dev` — the dev server proxies `/jf` → your Jellyfin server (no CORS setup needed).
4. Log in with your Jellyfin credentials.

## Test
- `npm test` — unit + component tests (Vitest).
- `npm run build` — typecheck + production build.

## Architecture
See `docs/superpowers/specs/2026-07-04-jellyflix-design.md` and `docs/superpowers/plans/2026-07-04-jellyflix-implementation.md`.
```

- [ ] **Step 2: Run the full gate**

Run:
```bash
npm test && npx tsc -b && npm run build
```
Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README and finalize MVP"
```

---

## Self-Review

**Spec coverage:**
- Auth (login, persist, restore, guard) → Tasks 3–5. ✓
- Home billboard + rows (Resume/NextUp/Latest per library) → Tasks 7, 11. ✓
- 16:9 cards + progress bars + image fallbacks (episodes = Primary) → Tasks 6, 9. ✓
- Hover-expand preview + arrow paging + responsive → Tasks 10, 12. ✓
- Detail modal + series episode list → Task 13. ✓
- Playback (device profile, PlaybackInfo, direct/HLS resolve, VideoPlayer, resume, progress reporting) → Tasks 14–16. ✓
- Netflix visual system (tokens, nav transparent→solid, gradients, motion, prefers-reduced-motion) → Tasks 1, 11, 12. ✓
- Error/loading states → Task 17. ✓
- Testing strategy (unit for lib, hook test, component tests, manual E2E) → throughout. ✓

**Deferred (per spec, intentionally not tasked):** Profiles screen, search, My List management, autoplay hover-trailers, subtitle/audio track switching, transcoding-quality selector, multi-server.

**Type consistency:** `Session` shape, `useApi()` return, image builder signatures, `resolveStreamUrl`/`fetchPlaybackInfo` signatures, and `onOpen`/`onPlay` callback types are consistent across tasks. `Row` gains an `onPlay` prop in Task 12 (Task 11 introduces `Row` without it) — Task 12 Step 8 explicitly updates all `Row` usages and the `Row.test.tsx` mock; Task 11's `Home` already defines `onPlay`, so threading it through is a prop addition only.

**Known follow-ups to watch during execution:**
- `getLatestMedia` returns an array directly (not `{ Items }`) — handled in `useLatestMedia`.
- Direct-stream URL uses `stream.{container}`; multi-value `Container` (e.g. `"mkv,webm"`) is split to the first value in `resolveStreamUrl` (Task 14).
- SDK factory import paths (`@jellyfin/sdk/lib/utils/api/*-api`) are on the unstable SDK build; if an import path 404s at build time, confirm the exact export name via `ls node_modules/@jellyfin/sdk/lib/utils/api/` during Task 2.
