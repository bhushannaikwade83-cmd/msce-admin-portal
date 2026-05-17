import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { b2DevSignPlugin } from './vite-plugin-b2-sign'

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
  const flutterAppRoot = path.resolve(__dirname, '../MSCE')
  const websiteDir = __dirname
  return {
    ...parseEnvFile(path.join(flutterAppRoot, '.env')),
    ...parseEnvFile(path.join(flutterAppRoot, '.env.local')),
    ...parseEnvFile(path.join(flutterAppRoot, 'app_config.env')),
    ...parseEnvFile(path.join(websiteDir, '.env')),
    ...parseEnvFile(path.join(websiteDir, '.env.local')),
  }
}

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

export default defineConfig(({ mode }) => {
  const merged = loadMergedEnv()
  const { url, anonKey, storageBucket } = resolveSupabase(merged)
  if (mode === 'production' && (!url || !anonKey)) {
    console.warn(
      '[vite] Production build: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in env or .env files.',
    )
  }
  const devProxyOptIn = ['true', '1'].includes(
    merged.VITE_SUPABASE_DEV_PROXY?.trim().toLowerCase() ?? '',
  )
  const devProxyEnabled = mode === 'development' && !!url && devProxyOptIn
  const b2SignApi = (merged.VITE_B2_SIGN_API || process.env.VITE_B2_SIGN_API || '').trim()
  const b2DevSignEnabled =
    mode === 'development' &&
    !!merged.B2B_KEY_ID?.trim() &&
    !!merged.B2B_APPLICATION_KEY?.trim() &&
    !!merged.B2B_BUCKET_ID?.trim() &&
    !!merged.B2B_BUCKET_NAME?.trim()

  return {
    plugins: [
      react(),
      ...(mode === 'development' ? [b2DevSignPlugin(merged)] : []),
    ],
    envDir: path.resolve(__dirname, '../MSCE'),
    assetsInclude: ['**/*.apk'],
    define: {
      __EDUSETU_SUPABASE_URL__: JSON.stringify(url),
      __EDUSETU_SUPABASE_ANON_KEY__: JSON.stringify(anonKey),
      __EDUSETU_STORAGE_BUCKET__: JSON.stringify(storageBucket),
      __EDUSETU_USE_SUPABASE_PROXY__: JSON.stringify(devProxyEnabled),
      __EDUSETU_B2_SIGN_API__: JSON.stringify(b2SignApi),
      __EDUSETU_B2_SIGN_ENABLED__: JSON.stringify(!!b2SignApi || b2DevSignEnabled),
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
