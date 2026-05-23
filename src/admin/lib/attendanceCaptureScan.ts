/**
 * Scan all attendance entry/exit captures vs student registration photo (Cheat watch).
 */
import { flattenAttendanceInOutRow } from './attendanceInOut'
import {
  attendanceCaptureDiffersFromRegistration,
  photoStorageKey,
  registrationPhotoKey,
  type DayInOutMerge,
} from './photoCompare'
import { flattenTeacherAttendanceRow } from './teacherAttendancePayload'

export type AttendanceCaptureFlag = {
  date: string
  kind: 'entry' | 'exit'
  photoUrl: string | null
  at: string | null
}

export type StudentCaptureMismatch = {
  student: Record<string, unknown> & { id: string }
  flags: AttendanceCaptureFlag[]
}

/** One attendance_in_out row → one capture (entry or exit). */
export function captureFromInOutRow(raw: Record<string, unknown>): AttendanceCaptureFlag | null {
  const flat = flattenAttendanceInOutRow(raw)
  const date = flat.date != null ? String(flat.date).slice(0, 10) : ''
  if (!date) return null

  const type = String(raw.type ?? '').toLowerCase()
  let kind: 'entry' | 'exit' | null = null
  let photoUrl: string | null = null
  let at: string | null = null

  if (type === 'entry') {
    kind = 'entry'
    photoUrl = flat.in_photo_url != null ? String(flat.in_photo_url) : null
    at = flat.in_time != null ? String(flat.in_time) : null
  } else if (type === 'exit') {
    kind = 'exit'
    photoUrl = flat.out_photo_url != null ? String(flat.out_photo_url) : null
    at = flat.out_time != null ? String(flat.out_time) : null
  } else {
    const inP = flat.in_photo_url != null ? String(flat.in_photo_url).trim() : ''
    const outP = flat.out_photo_url != null ? String(flat.out_photo_url).trim() : ''
    if (inP) {
      kind = 'entry'
      photoUrl = inP
      at = flat.in_time != null ? String(flat.in_time) : null
    } else if (outP) {
      kind = 'exit'
      photoUrl = outP
      at = flat.out_time != null ? String(flat.out_time) : null
    }
  }

  if (!kind || !photoUrl?.trim()) return null
  return { date, kind, photoUrl: photoUrl.trim(), at }
}

/** One teacher_attendance row → up to two captures (entry + exit). */
export function capturesFromTeacherRow(raw: Record<string, unknown>): AttendanceCaptureFlag[] {
  const flat = flattenTeacherAttendanceRow(raw)
  const date = flat.date != null ? String(flat.date).slice(0, 10) : ''
  if (!date) return []

  const selfie =
    raw.verification_selfie != null && String(raw.verification_selfie).trim() !== ''
      ? String(raw.verification_selfie).trim()
      : null

  const out: AttendanceCaptureFlag[] = []

  const inP = flat.in_photo_url != null ? String(flat.in_photo_url).trim() : ''
  if (inP || selfie) {
    out.push({
      date,
      kind: 'entry',
      photoUrl: inP || selfie,
      at: flat.in_time != null ? String(flat.in_time) : null,
    })
  }

  const outP = flat.out_photo_url != null ? String(flat.out_photo_url).trim() : ''
  if (outP) {
    out.push({
      date,
      kind: 'exit',
      photoUrl: outP,
      at: flat.out_time != null ? String(flat.out_time) : null,
    })
  }

  return out
}

export function captureDiffersFromRegistration(
  student: Record<string, unknown>,
  capture: AttendanceCaptureFlag,
): boolean {
  const regKey = registrationPhotoKey(student)
  if (!regKey) return false
  const capKey = photoStorageKey(capture.photoUrl)
  return Boolean(capKey && capKey !== regKey)
}

/** All captures for one student that use a different file than registration face. */
export function mismatchedCapturesForStudent(
  student: Record<string, unknown> & { id: string },
  captures: AttendanceCaptureFlag[],
): AttendanceCaptureFlag[] {
  return captures.filter((c) => captureDiffersFromRegistration(student, c))
}

/** Build per-student flagged list (students with at least one mismatch). */
export function buildStudentCaptureMismatches(
  students: Array<Record<string, unknown> & { id: string }>,
  capturesByStudentId: Record<string, AttendanceCaptureFlag[]>,
): StudentCaptureMismatch[] {
  const out: StudentCaptureMismatch[] = []
  for (const student of students) {
    const caps = capturesByStudentId[student.id] ?? []
    const flags = mismatchedCapturesForStudent(student, caps)
    if (flags.length === 0) continue
    flags.sort((a, b) => {
      const dc = b.date.localeCompare(a.date)
      if (dc !== 0) return dc
      return a.kind.localeCompare(b.kind)
    })
    out.push({ student, flags })
  }
  out.sort((a, b) => {
    const ra =
      String(a.student.sr_no ?? a.student.user_id ?? a.student.id).trim() || a.student.id
    const rb =
      String(b.student.sr_no ?? b.student.user_id ?? b.student.id).trim() || b.student.id
    return ra.localeCompare(rb, undefined, { numeric: true })
  })
  return out
}

/** Single-day check (existing Cheat watch day column). */
export function dayCaptureMismatches(
  student: Record<string, unknown>,
  day: DayInOutMerge,
): AttendanceCaptureFlag[] {
  const diff = attendanceCaptureDiffersFromRegistration(student, day)
  const flags: AttendanceCaptureFlag[] = []
  const date = new Date().toISOString().slice(0, 10)
  if (diff.entryDiff && day.entryPhoto) {
    flags.push({ date, kind: 'entry', photoUrl: day.entryPhoto, at: day.entryAt })
  }
  if (diff.exitDiff && day.exitPhoto) {
    flags.push({ date, kind: 'exit', photoUrl: day.exitPhoto, at: day.exitAt })
  }
  return flags
}
