import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Injected in vite.config define — avoids import.meta.env being overwritten by shell VITE_* at build time. */
declare const __EDUSETU_SUPABASE_URL__: string
declare const __EDUSETU_SUPABASE_ANON_KEY__: string
declare const __EDUSETU_STORAGE_BUCKET__: string
declare const __EDUSETU_USE_SUPABASE_PROXY__: boolean
/** Optional full URL for production B2 signing (e.g. serverless). Empty in dev uses Vite `/api/b2-sign-photo`. */
declare const __EDUSETU_B2_SIGN_API__: string

const GLOBAL_KEY = '__edusetu_admin_portal_supabase__'

function getGlobalCache(): SupabaseClient | null {
  if (typeof globalThis === 'undefined') return null
  return (globalThis as unknown as Record<string, SupabaseClient>)[GLOBAL_KEY] ?? null
}

function setGlobalCache(client: SupabaseClient) {
  if (typeof globalThis === 'undefined') return
  ;(globalThis as unknown as Record<string, SupabaseClient>)[GLOBAL_KEY] = client
}

let cached: SupabaseClient | null = null
const URL_MARK = '__edusetu_supabase_base_url__' as const

/** Set in vite.config define when VITE_SUPABASE_DEV_PROXY=true (opt-in); avoids broken /__supabase 502 when proxy is off. */
function effectiveSupabaseUrl(baseUrl: string): string {
  if (typeof window === 'undefined') return baseUrl
  if (!__EDUSETU_USE_SUPABASE_PROXY__) return baseUrl
  return new URL('/__supabase', window.location.origin).href
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const baseUrl = __EDUSETU_SUPABASE_URL__?.trim()
  const anonKey = __EDUSETU_SUPABASE_ANON_KEY__?.trim()
  if (!baseUrl || !anonKey) {
    throw new Error(
      'Missing Supabase URL/anon key. Use the same project root .env as the Flutter app: SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_* in tools/admin-portal-react/.env.local).',
    )
  }
  return { url: effectiveSupabaseUrl(baseUrl), anonKey }
}

function clientBaseUrl(client: SupabaseClient): string | undefined {
  return (client as unknown as Record<string, string>)[URL_MARK]
}

/** Single client per tab; survives Vite HMR so GoTrueClient is not duplicated. */
export function getSupabase(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig()

  const fromGlobal = getGlobalCache()
  if (fromGlobal && clientBaseUrl(fromGlobal) === url) {
    return fromGlobal
  }
  if (cached && clientBaseUrl(cached) === url) {
    setGlobalCache(cached)
    return cached
  }

  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  ;(cached as unknown as Record<string, string>)[URL_MARK] = url
  setGlobalCache(cached)
  return cached
}

export function storageBucketName(): string | undefined {
  const b = __EDUSETU_STORAGE_BUCKET__?.trim()
  return b || undefined
}
