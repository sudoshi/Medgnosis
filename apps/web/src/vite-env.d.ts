/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REALTIME_ALERTS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
