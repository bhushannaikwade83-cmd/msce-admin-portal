/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase keys are injected at build time via `vite.config` `define` (not `import.meta.env.VITE_*`). */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_STORAGE_BUCKET?: string
  readonly VITE_SUPABASE_DEV_PROXY?: string
  /** GCC TBC Exam App's own PHP+MySQL backend (separate from Supabase). Defaults to production if unset. */
  readonly VITE_GCCTBC_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
