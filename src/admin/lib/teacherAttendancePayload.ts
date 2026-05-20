/**
 * Normalize Flutter `teacher_attendance.payload` — supports string JSON and nested `subjectSessions`.
 */
import { parseDbJsonObject } from './parseDbJson'

export type SubjectFolderHint = Record<string, unknown> & {
  id?: string
  name?: string | null
  subject_name?: string | null
  course_name?: string | null
  title?: string | null
  subject_code?: string | null
}

export type TeacherAttendanceFlat = Record<string, unknown> & {
  id: string
  student_id?: string | null
  subject_id?: string | null
  date?: string | null
  in_time?: string | null
  out_time?: string | null
  in_photo_url?: string | null
  out_photo_url?: string | null
  status?: string | null
}

export function strTrim(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function firstNonEmpty(...vals: unknown[]): string | null {
  for (const v of vals) {
    const s = strTrim(v)
    if (s) return s
  }
  return null
}

function pickSubjectLabels(subject: SubjectFolderHint | null | undefined): string[] {
  if (!subject) return []
  const raw = [
    strTrim(subject.id),
    strTrim(subject.name),
    strTrim(subject.subject_name),
    strTrim(subject.course_name),
    strTrim(subject.title),
    strTrim(subject.subject_code),
  ].filter(Boolean) as string[]
  return [...new Set(raw)]
}

function normalizeCourseKey(s: string): string {
  return s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Pick `subjectSessions` entry key matching folder subject (institute_subjects row or attendance-derived name). */
export function matchSubjectSessionKey(
  sessions: Record<string, unknown>,
  subject: SubjectFolderHint | null | undefined,
): string | null {
  const keys = Object.keys(sessions)
  if (keys.length === 0) return null
  const labels = pickSubjectLabels(subject)
  if (labels.length === 0) return null

  const lowerKeys = new Map(keys.map((k) => [k.toLowerCase(), k] as const))
  for (const l of labels) {
    const hit = lowerKeys.get(l.toLowerCase())
    if (hit) return hit
  }

  const normLabels = labels.map(normalizeCourseKey)
  for (const k of keys) {
    const nk = normalizeCourseKey(k)
    if (normLabels.some((l) => l === nk)) return k
  }

  for (const k of keys) {
    const nk = normalizeCourseKey(k)
    for (const l of normLabels) {
      if (!l || !nk) continue
      if (nk.includes(l) || l.includes(nk)) {
        if (Math.min(l.length, nk.length) >= 8) return k
      }
    }
  }

  return null
}

/** When folder has no subject (single “Attendance” bucket), merge earliest entry / latest exit across sessions. */
export function aggregateSubjectSessionsPayload(sessions: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.values(sessions).filter(
    (v): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v),
  )
  if (entries.length === 0) return null
  if (entries.length === 1) return entries[0]

  let entryBest: { t: number; s: Record<string, unknown> } | null = null
  let exitBest: { t: number; s: Record<string, unknown> } | null = null

  for (const e of entries) {
    const etRaw = e.entryTime ?? e.timestamp
    const xtRaw = e.exitTime
    if (etRaw != null) {
      const n = Date.parse(String(etRaw))
      if (Number.isFinite(n) && (!entryBest || n < entryBest.t)) entryBest = { t: n, s: e }
    }
    if (xtRaw != null) {
      const n = Date.parse(String(xtRaw))
      if (Number.isFinite(n) && (!exitBest || n > exitBest.t)) exitBest = { t: n, s: e }
    }
  }

  const merged: Record<string, unknown> = {}
  if (entryBest) {
    merged.entryTime = entryBest.s.entryTime ?? entryBest.s.timestamp
    merged.timestamp = entryBest.s.timestamp
    merged.entryPhoto = firstNonEmpty(entryBest.s.entryPhoto, entryBest.s.photoUrl, entryBest.s.entry_photo)
    merged.photoUrl = entryBest.s.photoUrl
    merged.entryPhotoPath = entryBest.s.entryPhotoPath ?? entryBest.s.entry_photo_path
  }
  if (exitBest) {
    merged.exitTime = exitBest.s.exitTime
    merged.exitPhoto = firstNonEmpty(exitBest.s.exitPhoto, exitBest.s.photoUrl, exitBest.s.exit_photo)
    merged.exitPhotoPath = exitBest.s.exitPhotoPath ?? exitBest.s.exit_photo_path
  }

  const anyPresent = entries.some((e) => String(e.status ?? '').toLowerCase() === 'present')
  merged.status = anyPresent ? 'present' : entries[0]?.status

  return merged
}

/** Subject folder names from payload: `subject`, `subjects[]`, and `subjectSessions` keys. */
export function collectSubjectNamesFromTeacherPayload(p: Record<string, unknown>): string[] {
  const names = new Set<string>()
  const subj = strTrim(p.subject)
  if (subj) names.add(subj)
  const subs = p.subjects
  if (Array.isArray(subs)) {
    for (const x of subs) {
      const n = strTrim(x)
      if (n) names.add(n)
    }
  }
  const ss = p.subjectSessions
  if (ss !== null && typeof ss === 'object' && !Array.isArray(ss)) {
    for (const k of Object.keys(ss as Record<string, unknown>)) {
      const t = k.trim()
      if (t) names.add(t)
    }
  }
  return [...names]
}

function subjectFolderIsUnspecified(subject: SubjectFolderHint | null | undefined): boolean {
  if (subject == null) return true
  const labels = pickSubjectLabels(subject)
  if (labels.length === 0 || (labels.length === 1 && labels[0] === '')) return true
  /** Synthetic folder when subjects are inferred only from attendance rows (`StudentsSection`). */
  if (labels.length === 1 && labels[0].toLowerCase() === 'attendance') return true
  return false
}

/** Flatten one teacher_attendance row for UI / CSV / merges. Pass `subject` when drilling into a subject folder. */
export function flattenTeacherAttendanceRow(
  row: Record<string, unknown>,
  subject?: SubjectFolderHint | null,
): TeacherAttendanceFlat {
  const p = parseDbJsonObject(row.payload)

  const sessionsRaw = p.subjectSessions
  const sessions =
    sessionsRaw !== null && typeof sessionsRaw === 'object' && !Array.isArray(sessionsRaw)
      ? (sessionsRaw as Record<string, unknown>)
      : null

  let sess: Record<string, unknown> | null = null
  if (sessions && Object.keys(sessions).length > 0) {
    if (subjectFolderIsUnspecified(subject)) {
      sess = aggregateSubjectSessionsPayload(sessions)
    } else {
      const key = matchSubjectSessionKey(sessions, subject)
      const raw = key ? sessions[key] : null
      sess =
        raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
    }
  }

  const src = sess ?? p

  const in_time = firstNonEmpty(
    src.entryTime,
    src.timestamp,
    p.entryTime,
    p.timestamp,
    row.in_time,
  )
  const out_time = firstNonEmpty(src.exitTime, p.exitTime, row.out_time)

  const in_photo_url = firstNonEmpty(
    src.entryPhoto,
    src.photoUrl,
    src.entry_photo,
    src.entryPhotoPath,
    src.entry_photo_path,
    p.entryPhoto,
    p.photoUrl,
    row.in_photo_url,
  )

  const out_photo_url = firstNonEmpty(
    src.exitPhoto,
    src.exit_photo,
    src.exitPhotoPath,
    src.exit_photo_path,
    p.exitPhoto,
    row.out_photo_url,
  )

  const statusVal = firstNonEmpty(row.status, src.status, p.status)

  const dateVal = row.date ?? p.date

  const folderLabels = pickSubjectLabels(subject ?? ({} as SubjectFolderHint))
  const subjectHint = firstNonEmpty(sess?.subjectName, folderLabels[0], p.subject)

  return {
    ...row,
    id: String(row.id ?? ''),
    date: dateVal != null ? String(dateVal).slice(0, 10) : null,
    status: statusVal,
    in_time,
    out_time,
    in_photo_url,
    out_photo_url,
    student_id: row.student_id != null ? String(row.student_id) : null,
    subject_id: subjectHint,
  }
}
