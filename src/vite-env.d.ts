/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase keys are injected via vite.config define (__EDUSETU_*), not import.meta.env.VITE_*, so shell env cannot override. */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_STORAGE_BUCKET?: string
  readonly VITE_SUPABASE_DEV_PROXY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
