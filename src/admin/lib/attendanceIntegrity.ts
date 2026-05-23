/**
 * Signals for proxy / wrong-person attendance review (MSCE admin).
 * Primary DB flag: students.face_photo_changed_once (app saved new face after attendance capture).
 */
import { parseDbJsonObject } from './parseDbJson'

export function pickStr(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return null
}

/** Student registered one face, then attendance flow stored a different face on the record. */
export function isFacePhotoUpdatedForAttendance(student: Record<string, unknown>): boolean {
  if (student.face_photo_changed_once !== true) return false
  return Boolean(pickStr(student, 'original_face_photo_url', 'original_registration_photo_path'))
}

export function studentInstNo(student: Record<string, unknown>): string | null {
  return pickStr(student, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno', 'admission_no')
}

export function studentDisplayName(student: Record<string, unknown>): string {
  return pickStr(student, 'name', 'student_name', 'full_name') ?? String(student.id ?? '—')
}

const INTEGRITY_KEY_RE =
  /(?:mismatch|cheat|fraud|proxy|wrong|spoof|liveness|duplicate|override|manual|suspicious|unmatched|notmatch|nomatch|failed|reject|bypass)/i

const LOW_SCORE_KEY_RE = /(?:matchscore|similarity|confidence|distance|threshold)/i

const OTHER_STUDENT_KEY_RE =
  /(?:matchedstudent|detectedstudent|actualstudent|recognizedstudent|otherstudent|wrongstudent)/i

/** Deep-scan attendance `additional` / payload JSON for app-written integrity hints. */
export function collectAttendanceIntegritySignals(
  obj: unknown,
  depth = 0,
  path = '',
  out: string[] = [],
): string[] {
  if (obj === null || obj === undefined || depth > 8) return out

  if (typeof obj === 'boolean' || typeof obj === 'number' || typeof obj === 'string') {
    return out
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length && i < 50; i++) {
      collectAttendanceIntegritySignals(obj[i], depth + 1, `${path}[${i}].`, out)
    }
    return out
  }

  if (typeof obj !== 'object') return out

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const full = path ? `${path}${k}` : k
    if (INTEGRITY_KEY_RE.test(k)) {
      if (v === true || v === false || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '')) {
        out.push(`${full}=${String(v).slice(0, 120)}`)
      }
    }
    if (OTHER_STUDENT_KEY_RE.test(k) && typeof v === 'string' && v.trim() !== '') {
      out.push(`${full}=${v.trim().slice(0, 80)}`)
    }
    if (LOW_SCORE_KEY_RE.test(k) && typeof v === 'number' && v > 0 && v < 0.55) {
      out.push(`${full}=${v} (low)`)
    }
    collectAttendanceIntegritySignals(v, depth + 1, `${full}.`, out)
  }

  return [...new Set(out)].slice(0, 12)
}

/** Stable key for “same capture file used for multiple students”. */
export function attendanceCapturePhotoKey(row: Record<string, unknown>): string | null {
  const direct = pickStr(row, 'photo_url', 'photo_path', 'in_photo_url')
  if (direct) return direct.toLowerCase()

  const add = parseDbJsonObject(row.additional)
  const fromAdd = pickStr(
    add as Record<string, unknown>,
    'entryPhoto',
    'entry_photo',
    'photoUrl',
    'photo_url',
    'exitPhoto',
    'exit_photo',
  )
  return fromAdd ? fromAdd.toLowerCase() : null
}

export type DuplicateCaptureGroup = {
  photoKey: string
  studentIds: string[]
  instituteCodes: string[]
  rows: Record<string, unknown>[]
}

export function groupDuplicateCaptures(rows: Record<string, unknown>[]): DuplicateCaptureGroup[] {
  const byPhoto = new Map<string, Record<string, unknown>[]>()

  for (const row of rows) {
    const key = attendanceCapturePhotoKey(row)
    if (!key || key.length < 8) continue
    const list = byPhoto.get(key) ?? []
    list.push(row)
    byPhoto.set(key, list)
  }

  const groups: DuplicateCaptureGroup[] = []
  for (const [photoKey, list] of byPhoto) {
    const studentIds = [...new Set(list.map((r) => String(r.student_id ?? '').trim()).filter(Boolean))]
    if (studentIds.length < 2) continue
    const instituteCodes = [
      ...new Set(list.map((r) => String(r.institute_code ?? '').trim()).filter(Boolean)),
    ]
    groups.push({ photoKey, studentIds, instituteCodes, rows: list })
  }

  groups.sort((a, b) => b.studentIds.length - a.studentIds.length)
  return groups
}
