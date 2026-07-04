/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_JELLYFIN_SERVER: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
declare module '*.module.css';
