/**
 * Compare registration vs attendance photo storage keys (B2 path or normalized path).
 */
import { b2ObjectPathFromPhotoUrl, isHttpUrl, pickStr, studentPhotoSources } from './photoUrl'

export type DayInOutMerge = {
  entryAt: string | null
  exitAt: string | null
  entryPhoto: string | null
  exitPhoto: string | null
}

/** Normalize a photo URL or storage path to a stable comparison key. */
export function photoStorageKey(urlOrPath: string | null | undefined): string | null {
  const s = urlOrPath != null ? String(urlOrPath).trim() : ''
  if (!s) return null
  const b2 = b2ObjectPathFromPhotoUrl(s)
  if (b2) return b2.toLowerCase()
  if (!isHttpUrl(s)) return s.replace(/^\/+/, '').toLowerCase()
  try {
    const u = new URL(s)
    const fromPath = b2ObjectPathFromPhotoUrl(s)
    return (fromPath ?? u.pathname).toLowerCase()
  } catch {
    return s.toLowerCase()
  }
}

/** Current registration face used for attendance matching. */
export function registrationPhotoKey(row: Record<string, unknown>): string | null {
  const { photoUrl, storagePath } = studentPhotoSources(row)
  return photoStorageKey(storagePath) ?? photoStorageKey(photoUrl)
}

/** Original registration photo before a one-time attendance face update. */
export function originalRegistrationPhotoKey(row: Record<string, unknown>): string | null {
  const origUrl = pickStr(row, 'original_face_photo_url', 'original_registration_photo_url')
  const origPath = pickStr(row, 'original_registration_photo_path')
  return photoStorageKey(origPath) ?? photoStorageKey(origUrl)
}

export function hasRegistrationAttendancePhotoMismatch(row: Record<string, unknown>): boolean {
  if (row.face_photo_changed_once !== true) return false
  return Boolean(
    pickStr(row, 'original_face_photo_url', 'original_registration_photo_path'),
  )
}

export function attendanceCaptureDiffersFromRegistration(
  row: Record<string, unknown>,
  day: DayInOutMerge,
): { entryDiff: boolean; exitDiff: boolean } {
  const regKey = registrationPhotoKey(row)
  if (!regKey) return { entryDiff: false, exitDiff: false }
  const entryKey = photoStorageKey(day.entryPhoto)
  const exitKey = photoStorageKey(day.exitPhoto)
  return {
    entryDiff: Boolean(entryKey && entryKey !== regKey),
    exitDiff: Boolean(exitKey && exitKey !== regKey),
  }
}
