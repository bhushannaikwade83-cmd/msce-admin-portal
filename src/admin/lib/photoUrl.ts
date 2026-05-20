/**
 * Resolve student / attendance photo fields to a browser-usable URL.
 * Matches Flutter: B2 private files need ?Authorization=…; Supabase paths use createSignedUrl.
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

async function requestB2SignedUrl(objectPath: string): Promise<string | null> {
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

/** Non-B2 HTTP URLs that work as img src without signing. */
export function immediateImgSrc(raw: string | null | undefined): string | null {
  const s = str(raw)
  if (!s || !isHttpUrl(s)) return null
  if (/backblazeb2\.com/i.test(s) && !hasB2AuthQuery(s)) return null
  return s
}

/** Resolve a single URL or storage path (same as inline attendance photo strings). */
export async function resolvePhotoUrlString(raw: string | null | undefined): Promise<string | null> {
  const s = str(raw)
  if (!s) return null
  const fast = immediateImgSrc(s)
  if (fast) return fast
  if (isHttpUrl(s) && /backblazeb2\.com/i.test(s)) {
    const path = b2ObjectPathFromUrl(s)
    if (path) {
      const signed = await requestB2SignedUrl(path)
      if (signed) return signed
    }
    return null
  }
  const fromSupa = await supabaseSignedOrPublicUrl(s)
  if (fromSupa) return fromSupa
  return requestB2SignedUrl(s)
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

/**
 * Student row: prefer face_photo_url, fallback photo_url; use registration_photo_path for B2 sign
 * when the URL column is missing or is an unsigned B2 link.
 * Also handles HTTP URLs wrongly stored in *path* columns and public Supabase buckets.
 */
export async function resolveStudentPhotoUrl(row: Record<string, unknown>): Promise<string | null> {
  const face = pickStr(
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
  const regPath = pickStr(
    row,
    'registration_photo_path',
    'registration_photo_url',
    'photo_path',
    'photoPath',
  )

  if (regPath && !isHttpUrl(regPath)) {
    const b2 = await requestB2SignedUrl(regPath)
    if (b2) return b2
    const su = await supabaseSignedOrPublicUrl(regPath)
    if (su) return su
  }

  if (regPath && isHttpUrl(regPath)) {
    const via = await resolvePhotoUrlString(regPath)
    if (via) return via
  }

  if (face && isHttpUrl(face)) {
    const fast = immediateImgSrc(face)
    if (fast) return fast
    if (/backblazeb2\.com/i.test(face)) {
      const path =
        regPath && !isHttpUrl(regPath) ? regPath : b2ObjectPathFromUrl(face)
      if (path) {
        const signed = await requestB2SignedUrl(path)
        if (signed) return signed
      }
      return null
    }
    return face
  }

  if (face && !isHttpUrl(face)) {
    const r = await resolvePhotoUrlString(face)
    if (r) return r
  }

  const nested = pickNestedPhoto(row)
  if (nested) {
    const r = await resolvePhotoUrlString(nested)
    if (r) return r
  }

  const fuzzy = pickPhotoLikeFromRow(row)
  if (fuzzy && fuzzy !== face && fuzzy !== regPath) {
    return resolvePhotoUrlString(fuzzy)
  }

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
