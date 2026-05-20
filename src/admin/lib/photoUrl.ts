/**
 * Resolve student / attendance photo fields to a browser-usable URL.
 * Matches Flutter MSCE app: B2 objects get fresh temp URLs via Supabase `b2-storage-proxy` (`download_auth`);
 * Supabase storage paths use createSignedUrl; dev may fall back to Vite `/api/b2-sign-photo`.
 */
import { getSupabase, storageBucketName } from './supabase'

declare const __EDUSETU_B2_SIGN_API__: string
declare const __EDUSETU_B2_SIGN_ENABLED__: boolean

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

export function pickStr(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = str(row[k])
    if (v) return v
  }
  return null
}

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

function hasB2AuthQuery(url: string): boolean {
  return /[?&]Authorization=/i.test(url)
}

/** Extract B2 object key from a friendly /file/{bucket}/... URL. */
export function b2ObjectPathFromUrl(url: string): string | null {
  if (!/backblazeb2\.com/i.test(url)) return null
  try {
    const parsed = new URL(url)
    const m = parsed.pathname.match(/\/file\/[^/]+\/(.+)/)
    if (!m) return null
    return decodeURIComponent(m[1].replace(/\+/g, ' '))
  } catch {
    return null
  }
}

async function supabaseSignedUrl(path: string): Promise<string | null> {
  const bucket = storageBucketName()
  if (!bucket) return null
  try {
    const sb = getSupabase()
    const clean = path.trim().replace(/^\/+/, '')
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(clean, 3600)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

/** When the bucket/object is public, signed URL may be unnecessary — try after sign fails. */
function supabasePublicUrl(path: string): string | null {
  const bucket = storageBucketName()
  if (!bucket) return null
  try {
    const sb = getSupabase()
    const clean = path.trim().replace(/^\/+/, '')
    const { data } = sb.storage.from(bucket).getPublicUrl(clean)
    return data?.publicUrl ?? null
  } catch {
    return null
  }
}

async function supabaseSignedOrPublicUrl(path: string): Promise<string | null> {
  const signed = await supabaseSignedUrl(path)
  if (signed) return signed
  return supabasePublicUrl(path)
}

/** Same as Flutter `B2BStorageService.getPhotoUrl` via `b2-storage-proxy` + `download_auth`. */
async function requestB2SignedUrlViaEdge(objectPath: string): Promise<string | null> {
  const clean = objectPath.trim().replace(/^\/+/, '')
  if (!clean) return null
  try {
    const sb = getSupabase()
    const { data, error } = await sb.functions.invoke('b2-storage-proxy', {
      body: { action: 'download_auth', objectPath: clean, validSeconds: 3600 },
    })
    if (error) return null
    const d = (data ?? {}) as Record<string, unknown>
    if (d.success === false) return null
    const authToken = str(d.authorizationToken)
    const downloadUrl = str(d.downloadUrl)
    const bucketName = str(d.bucketName)
    if (!authToken || !downloadUrl || !bucketName) return null
    const enc = encodeURIComponent(clean)
    return `${downloadUrl}/file/${bucketName}/${enc}?Authorization=${authToken}`
  } catch {
    return null
  }
}

async function requestB2SignedUrl(objectPath: string): Promise<string | null> {
  const viaEdge = await requestB2SignedUrlViaEdge(objectPath)
  if (viaEdge) return viaEdge

  const api = typeof __EDUSETU_B2_SIGN_API__ === 'string' ? __EDUSETU_B2_SIGN_API__.trim() : ''
  if (!api && !__EDUSETU_B2_SIGN_ENABLED__) return null
  const endpoint = api || '/api/b2-sign-photo'
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectPath }),
      credentials: 'same-origin',
    })
    if (!r.ok) return null
    const j = (await r.json()) as { url?: string }
    return str(j.url)
  } catch {
    return null
  }
}

/** Flutter `StorageService.getPhotoUrl` — fresh B2 temp URL with one retry. */
export async function getPhotoUrl(objectPath: string): Promise<string | null> {
  const clean = objectPath.trim().replace(/^\/+/, '')
  if (!clean) return null
  const first = await requestB2SignedUrl(clean)
  if (first) return first
  await new Promise((r) => setTimeout(r, 500))
  return requestB2SignedUrl(clean)
}

/** Flutter `StorageService.b2ObjectPathFromPhotoUrl`. */
export function b2ObjectPathFromPhotoUrl(url: string): string | null {
  return b2ObjectPathFromUrl(url)
}

/** Flutter `StorageService.ensureSignedUrl`. */
export async function ensureSignedUrl(url: string): Promise<string> {
  const u = url.trim()
  if (!u) return u
  const b2Path = b2ObjectPathFromUrl(u)
  if (b2Path) {
    const signed = await getPhotoUrl(b2Path)
    if (signed) return signed
  }
  const fast = immediateImgSrc(u)
  if (fast) return fast
  return u
}

/**
 * Flutter `StorageService.getTemporaryPhotoUrl` — priority: storagePath, then photoUrl
 * (raw path, B2 URL, or other HTTP).
 */
export async function getTemporaryPhotoUrl(opts: {
  photoUrl?: string | null
  storagePath?: string | null
}): Promise<string | null> {
  const storagePath = str(opts.storagePath)
  const photoUrl = str(opts.photoUrl)

  if (storagePath) {
    const fromPath = await getPhotoUrl(storagePath)
    if (fromPath) return fromPath
    const su = await supabaseSignedOrPublicUrl(storagePath)
    if (su) return su
  }

  if (!photoUrl) return null

  if (!isHttpUrl(photoUrl)) {
    const fromPath = await getPhotoUrl(photoUrl)
    if (fromPath) return fromPath
    return supabaseSignedOrPublicUrl(photoUrl)
  }

  const fast = immediateImgSrc(photoUrl)
  if (fast) return fast

  const b2Path = b2ObjectPathFromUrl(photoUrl)
  if (b2Path) {
    const signed = await getPhotoUrl(b2Path)
    if (signed) return signed
    return null
  }

  return ensureSignedUrl(photoUrl)
}

/** Map a `students` row to Flutter SecureNetworkImage inputs. */
export function studentPhotoSources(row: Record<string, unknown>): {
  photoUrl: string | null
  storagePath: string | null
  version: string | null
  thumbnail: string | null
} {
  const photoUrl = pickStr(
    row,
    'face_photo_url',
    'facePhotoUrl',
    'photo_url',
    'photoUrl',
    'profile_photo',
    'avatar_url',
    'image_url',
    'face_image_url',
    'student_photo_url',
    'registration_photo_url',
  )
  let storagePath = pickStr(
    row,
    'registration_photo_path',
    'photo_path',
    'photoPath',
  )
  if (storagePath && isHttpUrl(storagePath)) {
    const extracted = b2ObjectPathFromUrl(storagePath)
    storagePath = extracted
  }
  const version = pickStr(row, 'photo_version', 'photoVersion')
  const thumbRaw = row.photo_thumbnail ?? row.photoThumbnail
  let thumbnail: string | null = null
  if (thumbRaw != null) {
    const s = String(thumbRaw).trim()
    if (s) thumbnail = s.startsWith('data:') ? s : `data:image/jpeg;base64,${s}`
  }
  return { photoUrl, storagePath, version, thumbnail }
}

/** Non-B2 HTTP URLs that work as img src without signing. */
export function immediateImgSrc(raw: string | null | undefined): string | null {
  const s = str(raw)
  if (!s || !isHttpUrl(s)) return null
  if (/backblazeb2\.com/i.test(s) && !hasB2AuthQuery(s)) return null
  return s
}

/** Resolve a single URL or storage path (attendance in/out photos, etc.). */
export async function resolvePhotoUrlString(raw: string | null | undefined): Promise<string | null> {
  const s = str(raw)
  if (!s) return null
  if (!isHttpUrl(s)) {
    return getTemporaryPhotoUrl({ storagePath: s })
  }
  const path = /backblazeb2\.com/i.test(s) ? b2ObjectPathFromUrl(s) : null
  return getTemporaryPhotoUrl({ photoUrl: s, storagePath: path })
}

/** Any column on `students` that looks like a photo (names differ between Flutter migrations). */
function pickPhotoLikeFromRow(row: Record<string, unknown>): string | null {
  const orderedKeys = [
    'face_photo_url',
    'facePhotoUrl',
    'photo_url',
    'photoUrl',
    'registration_photo_url',
    'registrationPhotoUrl',
    'student_photo_url',
    'registered_photo_url',
    'profile_photo',
    'avatar_url',
    'image_url',
    'face_image_url',
    'registration_photo_path',
    'photo_path',
    'photoPath',
    'image',
    'thumbnail_url',
    'profile_image',
  ] as const
  const fromOrdered = pickStr(row, ...orderedKeys)
  if (fromOrdered) return fromOrdered

  for (const [k, v] of Object.entries(row)) {
    if (typeof v !== 'string') continue
    const s = v.trim()
    if (s.length < 4) continue
    if (!/(photo|face|image|avatar|portrait|picture|registration|thumbnail)/i.test(k)) continue
    if (/^https?:\/\//i.test(s)) return s
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(s)) return s
    if (/^[\w.-]+(?:\/[\w.-]+)+$/i.test(s)) return s
  }
  return null
}

function pickNestedPhoto(row: Record<string, unknown>): string | null {
  for (const nestKey of ['metadata', 'meta', 'extra', 'profile', 'additional']) {
    const n = row[nestKey]
    if (n != null && typeof n === 'object' && !Array.isArray(n)) {
      const sub = pickPhotoLikeFromRow(n as Record<string, unknown>)
      if (sub) return sub
      const deep = pickStr(
        n as Record<string, unknown>,
        'face_photo_url',
        'photo_url',
        'photoUrl',
        'registration_photo_path',
        'image_url',
      )
      if (deep) return deep
    }
  }
  return null
}

/** Student row — same resolution order as Flutter `getTemporaryPhotoUrl` + list fallbacks. */
export async function resolveStudentPhotoUrl(row: Record<string, unknown>): Promise<string | null> {
  const { photoUrl, storagePath } = studentPhotoSources(row)
  const main = await getTemporaryPhotoUrl({ photoUrl, storagePath })
  if (main) return main

  const nested = pickNestedPhoto(row)
  if (nested) return resolvePhotoUrlString(nested)

  const fuzzy = pickPhotoLikeFromRow(row)
  if (fuzzy) return resolvePhotoUrlString(fuzzy)

  return null
}

/** Stable fingerprint for React deps — any photo-like column change should reload the image. */
export function studentPhotoDepsKey(row: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(row)) {
    if (v == null || v === '') continue
    if (!/(photo|face|image|avatar|portrait|picture|registration|thumbnail|metadata|meta|profile)/i.test(k))
      continue
    if (typeof v === 'object') {
      try {
        parts.push(`${k}:${JSON.stringify(v)}`)
      } catch {
        parts.push(`${k}:<obj>`)
      }
    } else {
      parts.push(`${k}:${String(v).slice(0, 500)}`)
    }
  }
  parts.sort()
  return parts.join('|')
}
