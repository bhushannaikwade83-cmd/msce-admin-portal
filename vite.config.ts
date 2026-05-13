import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { b2DevSignPlugin } from './vite-plugin-b2-sign'

/** Same keys as Flutter `lib/config/supabase_env.dart` — one `.env` at repo root for app + portal. */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  const raw = fs.readFileSync(filePath, 'utf8')
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq <= 0) continue
    const key = s.slice(0, eq).trim()
    let v = s.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[key] = v
  }
  return out
}

function loadMergedEnv(): Record<string, string> {
  // ../.. from msce-website/msce-admin-portal → e.g. Desktop/PROJECTS (not the Flutter app folder).
  const repoRoot = path.resolve(__dirname, '../..')
  const portalDir = __dirname
  const flutterAppDir = path.join(repoRoot, 'EDUSETU-ATTENDACE-APP-main')
  return {
    ...parseEnvFile(path.join(repoRoot, '.env')),
    ...parseEnvFile(path.join(repoRoot, '.env.local')),
    ...parseEnvFile(path.join(flutterAppDir, '.env')),
    ...parseEnvFile(path.join(flutterAppDir, '.env.local')),
    ...parseEnvFile(path.join(portalDir, '.env')),
    ...parseEnvFile(path.join(portalDir, '.env.local')),
  }
}

/**
 * Supabase URL/keys for `define` at build time.
 * 1) `.env` files (merged) win locally so a stray shell export does not override your real project.
 * 2) `process.env` is used when files are empty — required for Vercel/CI (no committed `.env.local`).
 */
function resolveSupabase(merged: Record<string, string>): {
  url: string
  anonKey: string
  storageBucket: string
} {
  const url =
    (merged.VITE_SUPABASE_URL || merged.SUPABASE_URL || '').trim() ||
    (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const anonKey =
    (merged.VITE_SUPABASE_ANON_KEY || merged.SUPABASE_ANON_KEY || '').trim() ||
    (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
    ).trim()
  const storageBucket =
    (merged.VITE_STORAGE_BUCKET || '').trim() ||
    (process.env.VITE_STORAGE_BUCKET || '').trim()
  return { url, anonKey, storageBucket }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const merged = loadMergedEnv()
  const { url, anonKey, storageBucket } = resolveSupabase(merged)
  if (mode === 'production' && (!url || !anonKey)) {
    console.warn(
      '[vite] Production build: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are empty. ' +
        'Set them in Vercel → Project → Settings → Environment Variables (or use merged .env files for local builds).',
    )
  }
  if (url.includes('your_project') || url.includes('xxxx')) {
    console.warn(
      '[vite] SUPABASE_URL looks like a placeholder. Fix .env / tools/admin-portal-react/.env.local — not the shell.',
    )
  }
  if (
    mode === 'development' &&
    (!merged.B2B_KEY_ID?.trim() ||
      !merged.B2B_APPLICATION_KEY?.trim() ||
      !merged.B2B_BUCKET_ID?.trim() ||
      !merged.B2B_BUCKET_NAME?.trim())
  ) {
    console.warn(
      '[vite] B2 photo signing disabled until B2B_KEY_ID, B2B_APPLICATION_KEY, B2B_BUCKET_ID, B2B_BUCKET_NAME are set (e.g. in repository root or msce-admin-portal/.env). POST /api/b2-sign-photo will return 503.',
    )
  }
  /** Opt-in only — avoids Vite proxy 502 / bad shell env; set VITE_SUPABASE_DEV_PROXY=true if the browser blocks *.supabase.co. */
  const devProxyOptIn = ['true', '1'].includes(
    merged.VITE_SUPABASE_DEV_PROXY?.trim().toLowerCase() ?? '',
  )
  const devProxyEnabled = mode === 'development' && !!url && devProxyOptIn

  return {
    plugins: [
      react(),
      ...(mode === 'development' ? [b2DevSignPlugin(merged)] : []),
    ],
    envDir: path.resolve(__dirname, '../..'),
    define: {
      // Do not use import.meta.env.VITE_SUPABASE_* for the client — Vite loadEnv + env can override define.
      __EDUSETU_SUPABASE_URL__: JSON.stringify(url),
      __EDUSETU_SUPABASE_ANON_KEY__: JSON.stringify(anonKey),
      __EDUSETU_STORAGE_BUCKET__: JSON.stringify(storageBucket),
      __EDUSETU_USE_SUPABASE_PROXY__: JSON.stringify(devProxyEnabled),
      /** Production: set VITE_B2_SIGN_API to your HTTPS endpoint that accepts POST { objectPath } → { url }. */
      __EDUSETU_B2_SIGN_API__: JSON.stringify(
        (merged.VITE_B2_SIGN_API || process.env.VITE_B2_SIGN_API || '').trim(),
      ),
    },
    server: {
      proxy: {
        ...(devProxyEnabled
          ? {
              '/__supabase': {
                target: url,
                changeOrigin: true,
                secure: true,
                ws: true,
                rewrite: (p) => p.replace(/^\/__supabase/, ''),
                configure: (proxy) => {
                  proxy.on('error', (err) => {
                    console.error('[vite] Supabase proxy error:', err.message)
                  })
                },
              },
            }
          : {}),
        ...(mode === 'development'
          ? {
              '/api-pincode': {
                target: 'https://api.postalpincode.in',
                changeOrigin: true,
                secure: true,
                rewrite: (p) => p.replace(/^\/api-pincode/, ''),
              },
            }
          : {}),
      },
    },
  }
})
