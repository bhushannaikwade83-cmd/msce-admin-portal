/**
 * StudentsSection — MSCE Admin Portal
 * Auto-discovers actual table names by probing Supabase.
 * Works regardless of whether your schema uses:
 *   institute_subjects (alternate schema) / subjects / courses / …
 *   teacher_attendance / attendance_in_out
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { sortByInstituteId } from '../lib/instituteSort'
import { fetchAllPaged } from '../lib/supabasePaged'
import { getSupabase } from '../lib/supabase'
import { applyInstituteCodeFilter, flattenAttendanceInOutRow } from '../lib/attendanceInOut'
import { parseDbJsonObject } from '../lib/parseDbJson'
import {
  collectSubjectNamesFromTeacherPayload,
  flattenTeacherAttendanceRow,
} from '../lib/teacherAttendancePayload'
import { isFacePhotoUpdatedForAttendance } from '../lib/attendanceIntegrity'
import { InstituteIntegrityPanel } from './InstituteIntegrityPanel'
import { PhotoThumb } from './PhotoThumb'
import {
  attendanceReportRows,
  csvEscape,
  downloadCsv,
  instituteDirectoryCsvRows,
  instituteStudentRosterRows,
} from '../lib/reportCsv'
import { downloadStudentReportPdf, fetchStudentReport } from '../lib/studentReportPdf'
import type { InstituteRow } from './InstituteList'
import { InstituteDistrictFilter } from './InstituteDistrictFilter'
import { usePortalAccess } from '../context/portal-access-context'
import {
  filterInstitutesByPortalPrefixes,
  findPortalDistrictByKey,
  findPortalDistrictForPrefixes,
  instituteRowMatchesPrefixes,
} from '../lib/portalDistricts'
import { StudentDisplayPhoto } from './StudentDisplayPhoto'
import { EditStudentModal } from './EditStudentModal'
import { formatSubjectsDisplay, subjectsFromStudent } from '../lib/studentSubjects'
import {
  ATTENDANCE_CANDIDATES,
  SUBJECT_CANDIDATES,
  discoverSchema,
  type SchemaConfig,
} from '../lib/schemaDiscovery'

/* ══════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════ */

type Student = Record<string, unknown> & {
  id: string
  name?: string | null
  roll_no?: string | null
  class_name?: string | null
  section?: string | null
  institute_id?: string | null
  photo_url?: string | null
  face_photo_url?: string | null
  registration_photo_path?: string | null
  original_face_photo_url?: string | null
  original_registration_photo_path?: string | null
  face_photo_changed_once?: boolean | null
  face_photo_changed_at?: string | null
  face_embedding?: unknown
  is_active?: boolean | null
  email?: string | null
  phone?: string | null
  subjects?: string[] | string | null
  subject?: string | null
  year?: string | null
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
}

type Subject = Record<string, unknown> & {
  id: string
  name?: string | null
  subject_code?: string | null
  institute_id?: string | null
}

type AttendanceRecord = Record<string, unknown> & {
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

type DrillLevel = 'institutes' | 'students' | 'subjects' | 'attendance'

const TABLE_PAGE_SIZE_DEFAULT = 50
const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const
const STUDENTS_VIEW_STORAGE_KEY = 'msce.admin.students.view'
const ADD_STUDENT_DRAFT_PREFIX = 'msce.admin.students.addDraft.'

type PersistedStudentsView = {
  level: DrillLevel
  institute: InstituteRow | null
  student: Student | null
  subject: Subject | null
}

type AddStudentDraft = {
  open: boolean
  firstName: string
  middleName: string
  lastName: string
  year: string
  subjectsCsv: string
}

function readSessionJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeSessionJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, JSON.stringify(value))
}

function removeSessionValue(key: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(key)
}

function isDrillLevel(v: unknown): v is DrillLevel {
  return v === 'institutes' || v === 'students' || v === 'subjects' || v === 'attendance'
}

function normalizePersistedStudentsView(raw: PersistedStudentsView | null): PersistedStudentsView | null {
  if (!raw || !isDrillLevel(raw.level)) return null
  const institute = raw.institute && typeof raw.institute.id === 'string' ? raw.institute : null
  const student = raw.student && typeof raw.student.id === 'string' ? raw.student : null
  const subject = raw.subject && typeof raw.subject.id === 'string' ? raw.subject : null

  if (!institute) {
    return { level: 'institutes', institute: null, student: null, subject: null }
  }
  if (!student) {
    return { level: raw.level === 'institutes' ? 'institutes' : 'students', institute, student: null, subject: null }
  }
  if (!subject) {
    return { level: raw.level === 'attendance' ? 'subjects' : raw.level, institute, student, subject: null }
  }
  return { level: raw.level, institute, student, subject }
}

function loadPersistedStudentsView(): PersistedStudentsView | null {
  return normalizePersistedStudentsView(readSessionJson<PersistedStudentsView>(STUDENTS_VIEW_STORAGE_KEY))
}

function addStudentDraftKey(instituteId: string): string {
  return `${ADD_STUDENT_DRAFT_PREFIX}${instituteId}`
}

function studentRollSortKey(s: Student): number {
  const roll = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno')
  if (roll) {
    const n = parseInt(roll.replace(/\D/g, ''), 10)
    if (Number.isFinite(n)) return n
  }
  const idN = parseInt(String(s.id).replace(/\D/g, ''), 10)
  return Number.isFinite(idN) ? idN : Number.MAX_SAFE_INTEGER
}

function sortStudents(rows: Student[]): Student[] {
  return [...rows].sort((a, b) => {
    const ka = studentRollSortKey(a)
    const kb = studentRollSortKey(b)
    if (ka !== kb) return ka - kb
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  })
}

function hasFacePhoto(s: Student): boolean {
  if (
    pick(
      s,
      'face_photo_url',
      'facePhotoUrl',
      'photo_url',
      'photoUrl',
      'registration_photo_path',
      'registration_photo_url',
      'photo_path',
      'photoPath',
      'face_image_url',
      'student_photo_url',
      'profile_photo',
      'avatar_url',
      'image_url',
      'thumbnail_url',
    )
  )
    return true
  const emb = s.face_embedding
  if (Array.isArray(emb) && emb.length > 0) return true
  if (typeof emb === 'string' && emb.trim() !== '' && emb !== '[]') return true
  return false
}

function DirectoryPager({
  safePage,
  pageCount,
  totalRows,
  pageSize,
  onPrev,
  onNext,
  onPageSize,
}: {
  safePage: number
  pageCount: number
  totalRows: number
  pageSize: number
  onPrev: () => void
  onNext: () => void
  onPageSize: (n: number) => void
}) {
  return (
    <div className="institutes-panel-pager">
      <button type="button" className="btn btn-ghost btn-sm" disabled={safePage <= 0} onClick={onPrev}>
        Previous
      </button>
      <span className="muted small institutes-pager-meta">
        Page {safePage + 1} of {pageCount} ({totalRows.toLocaleString('en-IN')} rows)
      </span>
      <label className="institutes-page-size">
        <span className="muted small">Per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {TABLE_PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={safePage >= pageCount - 1}
        onClick={onNext}
      >
        Next
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', weekday: 'short',
    })
  } catch { return String(iso) }
}

function fmtTime(val: string | null | undefined) {
  if (!val) return '—'
  try {
    if (String(val).includes('T')) {
      return new Date(String(val)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }
    const [h, m] = String(val).split(':')
    const hr = parseInt(h, 10)
    return `${((hr % 12) || 12).toString().padStart(2, '0')}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
  } catch { return String(val) }
}

function statusBadge(status: string | null | undefined) {
  const s = (status ?? '').toString().toLowerCase()
  if (s === 'present')  return <span className="badge badge-present">✓ Present</span>
  if (s === 'absent')   return <span className="badge badge-absent">✗ Absent</span>
  if (s === 'late')     return <span className="badge badge-late">⏰ Late</span>
  if (s === 'half_day') return <span className="badge badge-half">◑ Half Day</span>
  return <span className="badge badge-unknown">{status ?? '—'}</span>
}

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function safeFilePart(s: string | null | undefined): string {
  const t = (s ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 48)
  return t || 'student'
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

/** Per-student merged entry/exit for one calendar day (`attendance_in_out`). */
type DayInOutMerge = {
  entryAt: string | null
  exitAt: string | null
  entryPhoto: string | null
  exitPhoto: string | null
}

function rowTimeKeyForInOut(
  dateYmd: string,
  flat: AttendanceRecord,
  raw: Record<string, unknown>,
  kind: 'entry' | 'exit',
): number | null {
  const timeVal = kind === 'entry' ? flat.in_time : flat.out_time
  if (timeVal) {
    const s = String(timeVal).trim()
    if (s.includes('T')) {
      const n = Date.parse(s)
      if (Number.isFinite(n)) return n
    }
    if (dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      const pad = s.length >= 8 ? s.slice(0, 8) : s
      const n = Date.parse(`${dateYmd}T${pad}`)
      if (Number.isFinite(n)) return n
    }
  }
  if (raw.created_at != null) {
    const n = Date.parse(String(raw.created_at))
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Pick earliest entry and latest exit among rows for one student on `dateYmd`. */
function mergeAttendanceInOutDayForStudent(dateYmd: string, rawRows: Record<string, unknown>[]): DayInOutMerge {
  let entryBest: { k: number; at: string | null; photo: string | null } | null = null
  let exitBest: { k: number; at: string | null; photo: string | null } | null = null

  for (const raw of rawRows) {
    const flat = flattenAttendanceInOutRow(raw) as AttendanceRecord
    const type = String(raw.type ?? '').toLowerCase()

    if (type === 'entry') {
      const k = rowTimeKeyForInOut(dateYmd, flat, raw, 'entry')
      if (k != null && (!entryBest || k < entryBest.k)) {
        const at =
          (flat.in_time != null && String(flat.in_time) !== '' ? String(flat.in_time) : null) ??
          (raw.created_at != null ? String(raw.created_at) : null)
        entryBest = { k, at, photo: flat.in_photo_url != null ? String(flat.in_photo_url) : null }
      }
    }
    if (type === 'exit') {
      const k = rowTimeKeyForInOut(dateYmd, flat, raw, 'exit')
      if (k != null && (!exitBest || k > exitBest.k)) {
        const at =
          (flat.out_time != null && String(flat.out_time) !== '' ? String(flat.out_time) : null) ??
          (raw.created_at != null ? String(raw.created_at) : null)
        exitBest = { k, at, photo: flat.out_photo_url != null ? String(flat.out_photo_url) : null }
      }
    }
  }

  return {
    entryAt: entryBest?.at ?? null,
    exitAt: exitBest?.at ?? null,
    entryPhoto: entryBest?.photo ?? null,
    exitPhoto: exitBest?.photo ?? null,
  }
}

/** Pick a display field from a row — tries multiple possible column names */
function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return null
}

/** `teacher_attendance.student_id` is usually roll / sr_no / user_id, not `students.id`. */
function studentRollIdentifiers(s: Student): string[] {
  const out: string[] = []
  const add = (v: unknown) => {
    const t = v !== null && v !== undefined ? String(v).trim() : ''
    if (t !== '') out.push(t)
  }
  add(pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno', 'admission_no'))
  add(s.id)
  return [...new Set(out)]
}

/** Merge same-day teacher_attendance rows (one row often has both in/out; multiple rows = earliest in, latest out). */
function mergeTeacherAttendanceDayForStudent(dateYmd: string, rawRows: Record<string, unknown>[]): DayInOutMerge {
  let entryBest: { k: number; at: string | null; photo: string | null } | null = null
  let exitBest: { k: number; at: string | null; photo: string | null } | null = null

  for (const raw of rawRows) {
    const flat = flattenTeacherAttendanceRow(raw)
    const rowDate = flat.date != null ? String(flat.date).slice(0, 10) : null
    if (rowDate !== dateYmd) continue

    const ek = rowTimeKeyForInOut(dateYmd, flat, raw, 'entry')
    if (ek != null && (!entryBest || ek < entryBest.k)) {
      const at =
        (flat.in_time != null && String(flat.in_time) !== '' ? String(flat.in_time) : null) ??
        (raw.created_at != null ? String(raw.created_at) : null)
      entryBest = { k: ek, at, photo: flat.in_photo_url != null ? String(flat.in_photo_url) : null }
    }
    const xk = rowTimeKeyForInOut(dateYmd, flat, raw, 'exit')
    if (xk != null && (!exitBest || xk > exitBest.k)) {
      const at =
        (flat.out_time != null && String(flat.out_time) !== '' ? String(flat.out_time) : null) ??
        (raw.created_at != null ? String(raw.created_at) : null)
      exitBest = { k: xk, at, photo: flat.out_photo_url != null ? String(flat.out_photo_url) : null }
    }
  }

  return {
    entryAt: entryBest?.at ?? null,
    exitAt: exitBest?.at ?? null,
    entryPhoto: entryBest?.photo ?? null,
    exitPhoto: exitBest?.photo ?? null,
  }
}

function studentFolderLabel(s: Student): string {
  const label = pick(s, 'class_name', 'class', 'grade', 'standard', 'std')?.trim()
  return label || 'All students'
}

function AddStudentPanel({
  institute,
  onAdded,
  hidden = false,
}: {
  institute: InstituteRow
  onAdded: () => void
  hidden?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [year, setYear] = useState(`Year ${new Date().getFullYear()}`)
  const [subjectsCsv, setSubjectsCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    const saved = readSessionJson<AddStudentDraft>(addStudentDraftKey(institute.id))
    if (!saved) return
    setOpen(saved.open === true)
    setFirstName(saved.firstName ?? '')
    setMiddleName(saved.middleName ?? '')
    setLastName(saved.lastName ?? '')
    setYear(saved.year ?? `Year ${new Date().getFullYear()}`)
    setSubjectsCsv(saved.subjectsCsv ?? '')
  }, [institute.id])

  useEffect(() => {
    const hasDraft =
      open ||
      firstName.trim() !== '' ||
      middleName.trim() !== '' ||
      lastName.trim() !== '' ||
      subjectsCsv.trim() !== '' ||
      year.trim() !== `Year ${new Date().getFullYear()}`
    const key = addStudentDraftKey(institute.id)
    if (!hasDraft) {
      removeSessionValue(key)
      return
    }
    writeSessionJson(key, {
      open,
      firstName,
      middleName,
      lastName,
      year,
      subjectsCsv,
    } satisfies AddStudentDraft)
  }, [institute.id, open, firstName, middleName, lastName, year, subjectsCsv])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setOk(null)
    const fn = firstName.trim()
    const mn = middleName.trim()
    const ln = lastName.trim()
    if (!fn || !ln) {
      setErr('First and last name are required.')
      return
    }
    const fullName = `${fn} ${mn} ${ln}`.replace(/\s+/g, ' ').trim()
    setBusy(true)
    try {
      const sb = getSupabase()
      const nameCompare = `${fn.toLowerCase()} ${mn.toLowerCase()} ${ln.toLowerCase()}`.replace(/\s+/g, ' ').trim()
      const { data: dupRows } = await sb
        .from('students')
        .select('id,first_name,middle_name,last_name,name')
        .eq('institute_id', institute.id)
        .ilike('first_name', fn)
        .ilike('last_name', ln)
      for (const row of dupRows ?? []) {
        const r = row as Record<string, unknown>
        const ex =
          `${String(r.first_name ?? '').toLowerCase()} ${String(r.middle_name ?? '').toLowerCase()} ${String(r.last_name ?? '').toLowerCase()}`
            .replace(/\s+/g, ' ')
            .trim()
        const nm = String(r.name ?? '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
        if ((ex && ex === nameCompare) || (nm && nm === fullName.toLowerCase())) {
          setErr('A student with the same full name is already registered in this institute.')
          setBusy(false)
          return
        }
      }
      const { data: peakRaw, error: peakErr } = await sb.rpc('institute_peak_student_numbers', {
        p_institute_id: institute.id,
      })
      if (peakErr) throw peakErr
      const peak = (peakRaw ?? {}) as { sr_max?: number; roll_max?: number }
      const base = Math.max(Number(peak.sr_max ?? 0), Number(peak.roll_max ?? 0))
      const nextSr = String(base + 1)
      const subjList = subjectsCsv.split(',').map((s) => s.trim()).filter(Boolean)
      // Use basic insert without ON CONFLICT
      const { error: insErr } = await sb
        .from('students')
        .insert({
          institute_id: institute.id,
          user_id: nextSr,
          sr_no: nextSr,
          name: fullName,
          first_name: fn,
          middle_name: mn || null,
          last_name: ln,
          year: year.trim() || `Year ${new Date().getFullYear()}`,
          subjects: subjList.length > 0 ? subjList : null,
          subject: subjList.length > 0 ? subjList.join(', ') : null,
        }, { count: 'estimated' })
      if (insErr) throw insErr
      try {
        const { data: instRow } = await sb.from('institutes').select('student_count').eq('id', institute.id).maybeSingle()
        const cur = Number((instRow as { student_count?: number } | null)?.student_count ?? 0)
        await sb.from('institutes').update({ student_count: cur + 1 }).eq('id', institute.id)
      } catch {
        /* optional counter — ignore if RLS/column blocks */
      }
      setOk(`Saved ${fullName} with roll ${nextSr}. Data is live in the database. Add face photo from the mobile app.`)
      setFirstName('')
      setMiddleName('')
      setLastName('')
      setYear(`Year ${new Date().getFullYear()}`)
      setSubjectsCsv('')
      removeSessionValue(addStudentDraftKey(institute.id))
      onAdded()
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (hidden) return null

  return (
    <div className="students-add-panel">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong>Add student</strong>
          <span className="muted small" style={{ marginLeft: '0.5rem' }}>
            Inserts into Supabase <code>students</code> for this institute (roll numbers match the app).
          </span>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${open ? 'btn-ghost' : 'btn-primary'}`}
          onClick={() => {
            setOpen(!open)
            setErr(null)
            setOk(null)
          }}
        >
          {open ? 'Close form' : '＋ Add student'}
        </button>
      </div>
      {ok && !open ? (
        <p className="success small" style={{ marginTop: '0.5rem' }}>
          {ok}
        </p>
      ) : null}
      {open ? (
        <form className="form-grid" style={{ marginTop: '0.75rem' }} onSubmit={(e) => void onSubmit(e)}>
          {err ? (
            <p className="error span-2" style={{ margin: 0 }}>
              {err}
            </p>
          ) : null}
          <label>
            First name <span className="req">*</span>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="off" />
          </label>
          <label>
            Middle name
            <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Last name <span className="req">*</span>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="off" />
          </label>
          <label>
            Year / batch label
            <input type="text" value={year} onChange={(e) => setYear(e.target.value)} autoComplete="off" />
          </label>
          <label className="span-2">
            Subjects (comma-separated, optional)
            <input
              type="text"
              value={subjectsCsv}
              onChange={(e) => setSubjectsCsv(e.target.value)}
              placeholder="e.g. English, Maths"
              autoComplete="off"
            />
          </label>
          <div className="span-2" style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save to database'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SCHEMA DISCOVERY BANNER
══════════════════════════════════════════════════════════════ */

function SchemaBanner({ cfg, onRetry }: { cfg: SchemaConfig; onRetry: () => void }) {
  if (!cfg.discovered) return null

  const allOk = cfg.subjectTable && cfg.attendanceTable
  if (allOk) {
    return (
      <div className="schema-banner schema-banner-ok">
        <span>✅</span>
        <span>
          Schema detected — subjects: <code>{cfg.subjectTable}</code> · attendance:{' '}
          <code>{cfg.attendanceTables.join(', ')}</code>
        </span>
      </div>
    )
  }

  const missing = [
    !cfg.subjectTable    && `subjects (tried: ${SUBJECT_CANDIDATES.join(', ')})`,
    !cfg.attendanceTable && `attendance (tried: ${ATTENDANCE_CANDIDATES.join(', ')})`,
  ].filter(Boolean).join(' | ')

  return (
    <div className="schema-banner schema-banner-warn">
      <span>⚠️</span>
      <div>
        <strong>Table not found:</strong> {missing}
        <br />
        <span style={{ fontSize: '0.78rem', opacity: 0.85 }}>
          Check your Supabase Table Editor and confirm exact table names.
        </span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: '0.75rem' }} onClick={onRetry}>
          ↻ Retry detection
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   LEVEL 3 — ATTENDANCE VIEW
══════════════════════════════════════════════════════════════ */

function AttendanceView({
  student, subject, attTable, institute, onBack,
}: {
  student: Student
  subject: Subject
  attTable: string
  institute: InstituteRow
  onBack: () => void
}) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [month, setMonth]     = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const sb = getSupabase()
      const [yr, mo] = month.split('-')
      const from = `${yr}-${mo}-01`
      const to   = new Date(+yr, +mo, 0).toISOString().slice(0, 10)
      const instId = pick(student, 'institute_id', 'school_id', 'org_id')

      // teacher_attendance: per-day doc keyed by roll in `student_id`, times/photos in `payload` JSON
      if (attTable === 'teacher_attendance') {
        const keys = studentRollIdentifiers(student)
        if (keys.length === 0) throw new Error('Student row has no roll / sr_no / id for attendance lookup')
        let q = sb
          .from(attTable)
          .select('*')
          .in('student_id', keys)
          .gte('date', from)
          .lte('date', to)
        if (instId) q = q.eq('institute_id', instId)
        const { data, error: qErr } = await q.order('date', { ascending: false })
        if (qErr) throw new Error(qErr.message + (qErr.details ? ` — ${qErr.details}` : ''))
        setRecords((data ?? []).map((r) => flattenTeacherAttendanceRow(r as Record<string, unknown>, subject)))
        return
      }

      if (attTable === 'attendance_in_out') {
        let q = applyInstituteCodeFilter(
          sb.from(attTable).select('*').eq('student_id', student.id),
          institute,
        )
          .gte('attendance_date', from)
          .lte('attendance_date', to)
        const subjKey = subject.id?.trim()
        if (subjKey) {
          q = q.filter('additional->>subject', 'eq', subjKey)
        }
        const { data, error: qErr } = await q.order('attendance_date', { ascending: false })
        if (qErr) throw new Error(qErr.message + (qErr.details ? ` — ${qErr.details}` : ''))
        setRecords((data ?? []).map((r: Record<string, unknown>) => flattenAttendanceInOutRow(r) as AttendanceRecord))
        return
      }

      // Generic: filter by student id + optional subject
      let q = sb.from(attTable).select('*').eq('student_id', student.id).gte('date', from).lte('date', to)
      if (subject.id) q = q.eq('subject_id', subject.id)
      const { data, error: qErr } = await q.order('date', { ascending: false })

      if (qErr) throw new Error(qErr.message + (qErr.details ? ` — ${qErr.details}` : ''))
      setRecords((data ?? []) as AttendanceRecord[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [student, subject, attTable, month, institute])

  useEffect(() => { void load() }, [load])

  const present = records.filter(r => String(r.status ?? '').toLowerCase() === 'present').length
  const absent  = records.filter(r => String(r.status ?? '').toLowerCase() === 'absent').length

  /* Detect photo URL columns dynamically from first record */
  function getInPhoto(r: AttendanceRecord): string | null {
    return (r.in_photo_url ?? r['in_photo'] ?? r['entry_photo'] ?? r['photo_in'] ?? r['checkin_photo'] ?? null) as string | null
  }
  function getOutPhoto(r: AttendanceRecord): string | null {
    return (r.out_photo_url ?? r['out_photo'] ?? r['exit_photo'] ?? r['photo_out'] ?? r['checkout_photo'] ?? null) as string | null
  }
  function getDate(r: AttendanceRecord): string | null {
    return (r.date ?? r['attendance_date'] ?? r['created_at'] ?? null) as string | null
  }
  function getInTime(r: AttendanceRecord): string | null {
    return (r.in_time ?? r['check_in'] ?? r['checkin_time'] ?? r['entry_time'] ?? null) as string | null
  }
  function getOutTime(r: AttendanceRecord): string | null {
    return (r.out_time ?? r['check_out'] ?? r['checkout_time'] ?? r['exit_time'] ?? null) as string | null
  }
  function getStatus(r: AttendanceRecord): string | null {
    return (r.status ?? r['attendance_status'] ?? null) as string | null
  }

  const subjectName = pick(subject, 'name', 'subject_name', 'course_name', 'title') ?? subject.id
  const studentName = pick(student, 'name', 'student_name', 'full_name') ?? student.id

  return (
    <div className="students-panel">
      <div className="drill-breadcrumb">
        <button className="drill-back" onClick={onBack}>← Back to Subjects</button>
        <span className="drill-sep">›</span>
        <span className="drill-crumb">{studentName}</span>
        <span className="drill-sep">›</span>
        <span className="drill-crumb active">{subjectName}</span>
      </div>

      <div className="att-header card-elevated">
        <div className="att-header-left">
          <div className="att-subject-icon">📚</div>
          <div>
            <div className="att-subject-name">{subjectName}</div>
            {pick(subject, 'subject_code', 'code', 'course_code') && (
              <div className="att-subject-code">Code: {pick(subject, 'subject_code', 'code', 'course_code')}</div>
            )}
            <div className="att-student-ref">
              Student: <strong>{studentName}</strong>
              {pick(student, 'roll_no', 'roll_number', 'rollno') && (
                <> &nbsp;·&nbsp; Roll: <strong>{pick(student, 'roll_no', 'roll_number', 'rollno')}</strong></>
              )}
            </div>
          </div>
        </div>
        <div className="att-stats">
          <div className="att-stat-box att-stat-present"><div className="att-stat-num">{present}</div><div className="att-stat-lbl">Present</div></div>
          <div className="att-stat-box att-stat-absent"><div className="att-stat-num">{absent}</div><div className="att-stat-lbl">Absent</div></div>
          <div className="att-stat-box att-stat-total"><div className="att-stat-num">{records.length}</div><div className="att-stat-lbl">Total</div></div>
        </div>
      </div>

      <div className="att-controls">
        <label className="att-month-label">
          📅 Month
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="att-month-input" />
        </label>
        <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading || records.length === 0}
          title="Download attendance for the selected month as CSV"
          onClick={() => {
            const flat = records.map((rec) => ({
              date: fmtDate(getDate(rec)),
              status: getStatus(rec) ?? '',
              inTime: fmtTime(getInTime(rec)),
              outTime: fmtTime(getOutTime(rec)),
              inPhoto: getInPhoto(rec) ?? '',
              outPhoto: getOutPhoto(rec) ?? '',
            }))
            const meta = [
              `student,${csvEscape(studentName)}`,
              `student_id,${csvEscape(student.id)}`,
              `subject,${csvEscape(subjectName)}`,
              `subject_id,${csvEscape(subject.id)}`,
              `month,${csvEscape(month)}`,
              `generated,${csvEscape(new Date().toISOString())}`,
              '',
            ].join('\n')
            const { header, data } = attendanceReportRows(flat)
            const lines = [
              meta,
              header.map(csvEscape).join(','),
              ...data.map((r) => r.map(csvEscape).join(',')),
            ]
            const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `attendance_${safeFilePart(studentName)}_${safeFilePart(subjectName)}_${month}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          📥 Month CSV
        </button>
        {attTable === 'attendance_in_out' ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={loading || pdfBusy}
            title="Download monthly PDF (same format as MSCE app)"
            onClick={() => {
              void (async () => {
                setPdfBusy(true)
                setError(null)
                try {
                  const [yr, mo] = month.split('-')
                  const start = new Date(+yr, +mo - 1, 1)
                  const end = new Date(+yr, +mo, 0)
                  const report = await fetchStudentReport(institute, student, start, end)
                  downloadStudentReportPdf(report)
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e))
                } finally {
                  setPdfBusy(false)
                }
              })()
            }}
          >
            {pdfBusy ? 'Generating…' : '📄 Month PDF'}
          </button>
        ) : null}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Table: <code>{attTable}</code></span>
      </div>

      {error && <div className="error">{error}</div>}

      {!loading && records.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-title">No attendance records</div>
          <div className="empty-sub">No records found for {month}. Try a different month.</div>
        </div>
      )}

      <div className="att-records">
        {records.map(rec => (
          <div key={String(rec.id)} className="att-card card-elevated">
            <div className="att-card-head">
              <div className="att-date-block">
                <div className="att-date">{fmtDate(getDate(rec))}</div>
                <div className="att-times">
                  <span className="att-time-in">🟢 In: {fmtTime(getInTime(rec))}</span>
                  <span className="att-time-out">🔴 Out: {fmtTime(getOutTime(rec))}</span>
                </div>
              </div>
              <div>{statusBadge(getStatus(rec))}</div>
            </div>
            <div className="att-photos">
              <PhotoThumb url={getInPhoto(rec)}  label="In" />
              <PhotoThumb url={getOutPhoto(rec)} label="Out" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   LEVEL 2 — SUBJECT FOLDERS
══════════════════════════════════════════════════════════════ */

function SubjectFolders({
  student, subjectTable, attTable, institute, readOnly = false, onBack, onSelectSubject, onStudentUpdated,
}: {
  student: Student
  subjectTable: string | null
  attTable: string | null
  institute: InstituteRow
  readOnly?: boolean
  onBack: () => void
  onSelectSubject: (s: Subject) => void
  onStudentUpdated?: (s: Student) => void
}) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [editingStudent, setEditingStudent] = useState(false)

  const studentName = pick(student, 'name', 'student_name', 'full_name') ?? student.id

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const instId = pick(student, 'institute_id', 'school_id', 'org_id', 'instituteid')
      let fromSubjectTable: Subject[] | null = null

      if (subjectTable) {
        try {
          const sb = getSupabase()
          let q = sb.from(subjectTable).select('*').order('name')
          if (instId) q = q.eq('institute_id', instId)
          const { data, error: qErr } = await q

          if (!qErr) {
            fromSubjectTable = (data ?? []) as Subject[]
          } else if (qErr.message?.includes('does not exist') || (qErr as { code?: string }).code === '42703') {
            const { data: d2 } = await sb.from(subjectTable).select('*').order('name')
            fromSubjectTable = (d2 ?? []) as Subject[]
          } else {
            throw new Error(qErr.message)
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
          return
        }
      }

      if (fromSubjectTable && fromSubjectTable.length > 0) {
        setSubjects(fromSubjectTable)
        setLoading(false)
        return
      }

      if (!attTable) {
        setSubjects([])
        setError(
          subjectTable
            ? `No rows in "${subjectTable}" for this institute and no attendance table was detected.`
            : 'No subjects or attendance table found in your database. Check table names in Supabase.',
        )
        setLoading(false)
        return
      }

      try {
        const sb = getSupabase()
        if (attTable === 'attendance_in_out') {
          const { data, error: qErr } = await applyInstituteCodeFilter(
            sb.from(attTable).select('additional').eq('student_id', student.id),
            institute,
          ).limit(2000)
          if (qErr) throw new Error(qErr.message)
          const names = new Set<string>()
          for (const r of data ?? []) {
            const add = parseDbJsonObject((r as Record<string, unknown>).additional)
            const sub = add.subject != null ? String(add.subject).trim() : ''
            if (sub !== '') names.add(sub)
          }
          if (names.size === 0) {
            setSubjects([{ id: '', name: 'Attendance', subject_code: null } as Subject])
          } else {
            setSubjects(
              [...names].sort().map((n) => ({ id: n, name: n, subject_code: null }) as Subject),
            )
          }
        } else if (attTable === 'teacher_attendance') {
          const keys = studentRollIdentifiers(student)
          if (keys.length === 0) throw new Error('Student has no roll / id for attendance lookup')
          let q = sb.from(attTable).select('payload').in('student_id', keys).limit(2000)
          if (instId) q = q.eq('institute_id', instId)
          const { data, error: qErr } = await q
          if (qErr) throw new Error(qErr.message)
          const names = new Set<string>()
          for (const r of data ?? []) {
            const p = parseDbJsonObject((r as Record<string, unknown>).payload)
            for (const n of collectSubjectNamesFromTeacherPayload(p)) names.add(n)
          }
          if (names.size === 0) {
            setSubjects([{ id: '', name: 'Attendance', subject_code: null } as Subject])
          } else {
            setSubjects(
              [...names].sort().map((n) => ({ id: n, name: n, subject_code: null }) as Subject),
            )
          }
        } else {
          const { data, error: qErr } = await sb
            .from(attTable)
            .select('subject_id')
            .eq('student_id', student.id)
          if (qErr) throw new Error(qErr.message)
          const unique = [
            ...new Set((data ?? []).map((r: Record<string, unknown>) => r.subject_id).filter(Boolean)),
          ]
          setSubjects(
            unique.map(
              (id) => ({ id: String(id), name: `Subject ${id}`, subject_code: null }) as Subject,
            ),
          )
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setSubjects([])
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [student, subjectTable, attTable, institute])

  const folderColors = ['#003087', '#FF6600', '#138808', '#7B1FA2', '#0288D1', '#D32F2F', '#795548', '#F57C00']

  return (
    <div className="students-panel">
      <div className="drill-breadcrumb">
        <button className="drill-back" onClick={onBack}>← Back to Students</button>
        <span className="drill-sep">›</span>
        <span className="drill-crumb active">{studentName}</span>
      </div>

      {/* Student profile */}
      <div className="student-profile-card card-elevated">
        {student.face_photo_changed_once === true &&
        pick(student, 'original_face_photo_url', 'original_registration_photo_path') ? (
          <div className="student-registration-photos-dual">
            <div className="student-registration-photo-block">
              <div className="student-registration-photo-label">Original registration</div>
              <div className="student-avatar-lg">
                <StudentDisplayPhoto
                  student={{
                    ...student,
                    face_photo_url: student.original_face_photo_url,
                    registration_photo_path: student.original_registration_photo_path,
                    photo_thumbnail: null,
                  }}
                  displayName={`${studentName} (original)`}
                  size="lg"
                />
                <span className="student-avatar-initials-lg">{initials(studentName)}</span>
              </div>
            </div>
            <div className="student-registration-photo-block">
              <div className="student-registration-photo-label">Updated registration (attendance)</div>
              <div className="student-avatar-lg">
                <StudentDisplayPhoto student={student} displayName={studentName} size="lg" />
                <span className="student-avatar-initials-lg">{initials(studentName)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="student-avatar-lg">
            <StudentDisplayPhoto student={student} displayName={studentName} size="lg" />
            <span className="student-avatar-initials-lg">{initials(studentName)}</span>
          </div>
        )}
        <div className="student-profile-info">
          <div className="student-profile-name">{studentName}</div>
          {pick(student, 'roll_no', 'roll_number', 'rollno', 'admission_no') && (
            <div className="student-profile-detail">📋 Roll No: <strong>{pick(student, 'roll_no', 'roll_number', 'rollno', 'admission_no')}</strong></div>
          )}
          {pick(student, 'class_name', 'class', 'grade', 'standard', 'std') && (
            <div className="student-profile-detail">
              🏫 Class: <strong>
                {pick(student, 'class_name', 'class', 'grade', 'standard', 'std')}
                {pick(student, 'section', 'div', 'division') ? ` — ${pick(student, 'section', 'div', 'division')}` : ''}
              </strong>
            </div>
          )}
          {pick(student, 'email', 'email_id', 'mail') && (
            <div className="student-profile-detail">✉️ {pick(student, 'email', 'email_id', 'mail')}</div>
          )}
          {pick(student, 'phone', 'mobile', 'mobile_no', 'contact_no', 'phone_number') && (
            <div className="student-profile-detail">📞 {pick(student, 'phone', 'mobile', 'mobile_no', 'contact_no', 'phone_number')}</div>
          )}
          <div className="student-profile-detail">
            📚 Enrolled subjects:{' '}
            <strong>{formatSubjectsDisplay(subjectsFromStudent(student), 8)}</strong>
          </div>
          {!readOnly ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '0.5rem' }}
              onClick={() => setEditingStudent(true)}
            >
              ✏️ Edit name / subjects
            </button>
          ) : null}
        </div>
      </div>

      <div className="section-title-row">
        <h3 className="section-heading">📁 Subject Folders</h3>
        <span className="section-count">
          {subjects.length} subject{subjects.length !== 1 ? 's' : ''}
          {subjectTable && <> &nbsp;<code style={{fontSize:'0.65rem'}}>{subjectTable}</code></>}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm push-end"
          disabled={loading || subjects.length === 0}
          title="Download this student’s subject list as CSV"
          onClick={() => {
            const instId = pick(student, 'institute_id', 'school_id', 'org_id', 'instituteid') ?? ''
            const header = [
              'student_id',
              'student_name',
              'institute_id',
              'subject_id',
              'subject_name',
              'subject_code',
            ]
            const rows = subjects.map((sub) => [
              student.id,
              studentName,
              instId,
              sub.id,
              pick(sub, 'name', 'subject_name', 'course_name', 'title') ?? sub.id,
              pick(sub, 'subject_code', 'code', 'course_code') ?? '',
            ])
            const stamp = new Date().toISOString().slice(0, 10)
            downloadCsv(`student_${safeFilePart(studentName)}_subjects_${stamp}.csv`, header, rows)
          }}
        >
          📥 Subjects CSV
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading-row"><div className="loading-spinner" /><span>Loading subjects…</span></div>}

      {!loading && !error && subjects.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <div className="empty-title">No subjects found</div>
          <div className="empty-sub">
            {subjectTable
              ? `No subjects in "${subjectTable}" for this institute.`
              : 'No subject table detected. Check your database schema.'}
          </div>
        </div>
      )}

      <div className="folder-grid">
        {subjects.map((sub, i) => {
          const label = pick(sub, 'name', 'subject_name', 'course_name', 'title') ?? `Subject ${sub.id}`
          const code  = pick(sub, 'subject_code', 'code', 'course_code')
          return (
            <button
              key={sub.id}
              className="folder-card"
              onClick={() => onSelectSubject(sub)}
              style={{ '--folder-color': folderColors[i % folderColors.length] } as React.CSSProperties}
            >
              <div className="folder-tab" />
              <div className="folder-body">
                <div className="folder-icon">📚</div>
                <div className="folder-name">{label}</div>
                {code && <div className="folder-code">{code}</div>}
                <div className="folder-hint">View attendance →</div>
              </div>
            </button>
          )
        })}
      </div>

      {editingStudent && !readOnly ? (
        <EditStudentModal
          student={student}
          instituteLabel={institute.name ?? institute.institute_code ?? institute.id}
          onClose={() => setEditingStudent(false)}
          onSaved={async () => {
            setEditingStudent(false)
            try {
              const sb = getSupabase()
              const { data, error: qErr } = await sb.from('students').select('*').eq('id', student.id).maybeSingle()
              if (qErr) throw qErr
              if (data) onStudentUpdated?.(data as Student)
            } catch {
              /* list refresh on back */
            }
          }}
        />
      ) : null}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   LEVEL 1 — STUDENTS LIST
══════════════════════════════════════════════════════════════ */

function StudentsList({
  institute,
  reloadToken = 0,
  attendanceTables,
  readOnly = false,
  onBack,
  onSelectStudent,
}: {
  institute: InstituteRow
  reloadToken?: number
  attendanceTables: string[]
  readOnly?: boolean
  onBack: () => void
  onSelectStudent: (s: Student) => void
}) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const [tablePage, setTablePage] = useState(0)
  const [tablePageSize, setTablePageSize] = useState(TABLE_PAGE_SIZE_DEFAULT)
  const searchRef = useRef<HTMLInputElement>(null)
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dayAtt, setDayAtt] = useState<Record<string, DayInOutMerge>>({})
  const [attLoading, setAttLoading] = useState(false)
  const [attError, setAttError] = useState<string | null>(null)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)

  const showDayAttendance =
    attendanceTables.includes('attendance_in_out') || attendanceTables.includes('teacher_attendance')
  const primaryAttTable = attendanceTables[0] ?? null

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sb = getSupabase()
      const raw = await fetchAllPaged<Student>((rangeFrom, rangeTo) =>
        sb
          .from('students')
          .select('*')
          .eq('institute_id', institute.id)
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
      setStudents(sortStudents(raw))
    } catch (e) {
      setStudents([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [institute.id])

  useEffect(() => {
    void load()
    setTimeout(() => searchRef.current?.focus(), 100)
  }, [load, reloadTick, reloadToken])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => {
      const name = pick(s, 'name', 'student_name', 'full_name') ?? ''
      const roll = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') ?? ''
      const cls = pick(s, 'class_name', 'class', 'grade') ?? ''
      const email = pick(s, 'email', 'email_id') ?? ''
      const subs = subjectsFromStudent(s).join(' ')
      return [name, roll, cls, email, subs, s.id].some((v) => v.toLowerCase().includes(q))
    })
  }, [students, search])

  const photoMismatchStudents = useMemo(
    () => sortStudents(students.filter(isFacePhotoUpdatedForAttendance)),
    [students],
  )

  const stats = useMemo(() => {
    let faceRegistered = 0
    for (const s of students) {
      if (hasFacePhoto(s)) faceRegistered += 1
    }
    return {
      total: students.length,
      faceRegistered,
      facePending: students.length - faceRegistered,
      photoMismatch: photoMismatchStudents.length,
      inactive: students.filter((s) => s.is_active === false).length,
    }
  }, [students, photoMismatchStudents.length])

  const tablePageCount = Math.max(1, Math.ceil(filtered.length / tablePageSize))
  const safeTablePage = Math.min(tablePage, tablePageCount - 1)

  const paginatedRows = useMemo(() => {
    const start = safeTablePage * tablePageSize
    return filtered.slice(start, start + tablePageSize)
  }, [filtered, safeTablePage, tablePageSize])

  useEffect(() => {
    setTablePage(0)
  }, [search, tablePageSize, institute.id])

  useEffect(() => {
    if (tablePage > tablePageCount - 1) {
      setTablePage(Math.max(0, tablePageCount - 1))
    }
  }, [tablePage, tablePageCount])

  const loadDayAttendance = useCallback(async () => {
    setAttError(null)
    if (!showDayAttendance || students.length === 0) {
      setDayAtt({})
      setAttLoading(false)
      return
    }
    setAttLoading(true)
    try {
      const sb = getSupabase()
      const ids = students.map((s) => s.id)
      const prefersInOut = attendanceTables.includes('attendance_in_out')

      if (prefersInOut) {
        const chunks = chunkIds(ids, 100)
        const byStudent: Record<string, Record<string, unknown>[]> = {}

        for (const ch of chunks) {
          if (ch.length === 0) continue
          const q = applyInstituteCodeFilter(
            sb.from('attendance_in_out').select('*').eq('attendance_date', attDate).in('student_id', ch),
            institute,
          )
          const { data, error: qErr } = await q
          if (qErr) throw qErr
          for (const row of data ?? []) {
            const sid = row.student_id != null ? String(row.student_id) : ''
            if (!sid) continue
            if (!byStudent[sid]) byStudent[sid] = []
            byStudent[sid].push(row as Record<string, unknown>)
          }
        }

        const next: Record<string, DayInOutMerge> = {}
        for (const id of ids) {
          next[id] = mergeAttendanceInOutDayForStudent(attDate, byStudent[id] ?? [])
        }
        setDayAtt(next)
      } else if (attendanceTables.includes('teacher_attendance')) {
        const rollToStudentId = new Map<string, string>()
        for (const s of students) {
          for (const k of studentRollIdentifiers(s)) {
            rollToStudentId.set(k, s.id)
          }
        }
        const chunks: Student[][] = []
        for (let i = 0; i < students.length; i += 40) chunks.push(students.slice(i, i + 40))
        const byStudent: Record<string, Record<string, unknown>[]> = {}
        for (const id of ids) byStudent[id] = []

        for (const ch of chunks) {
          if (ch.length === 0) continue
          const keys = [...new Set(ch.flatMap((s) => studentRollIdentifiers(s)))]
          let q = sb
            .from('teacher_attendance')
            .select('*')
            .eq('date', attDate)
            .in('student_id', keys)
          q = q.eq('institute_id', institute.id)
          const { data, error: qErr } = await q
          if (qErr) throw qErr
          for (const row of data ?? []) {
            const roll = row.student_id != null ? String(row.student_id) : ''
            const stuId = rollToStudentId.get(roll)
            if (!stuId) continue
            byStudent[stuId].push(row as Record<string, unknown>)
          }
        }

        const next: Record<string, DayInOutMerge> = {}
        for (const id of ids) {
          next[id] = mergeTeacherAttendanceDayForStudent(attDate, byStudent[id] ?? [])
        }
        setDayAtt(next)
      } else {
        setDayAtt({})
      }
    } catch (e) {
      setDayAtt({})
      setAttError(e instanceof Error ? e.message : String(e))
    } finally {
      setAttLoading(false)
    }
  }, [showDayAttendance, institute, students, attDate, attendanceTables])

  useEffect(() => {
    void loadDayAttendance()
  }, [loadDayAttendance])

  return (
    <div className="students-panel">
      <div className="drill-breadcrumb">
        <button type="button" className="drill-back" onClick={onBack}>
          ← Back to Institutes
        </button>
        <span className="drill-sep">›</span>
        <span className="drill-crumb active">{institute.name ?? institute.id}</span>
      </div>

      <div className="inst-info-bar card-elevated">
        <div className="inst-info-icon">🏫</div>
        <div>
          <div className="inst-info-name">{institute.name}</div>
          <div className="inst-info-meta">
            {institute.institute_code && <span>Code: {institute.institute_code}</span>}
            {institute.city && <span>· {institute.city}</span>}
            {institute.state && <span>· {institute.state}</span>}
          </div>
        </div>
        <div className="inst-info-count">
          <span className="big-num">{loading ? '…' : stats.total.toLocaleString('en-IN')}</span>
          <span className="big-lbl">Students</span>
        </div>
      </div>

      <div className="institutes-stat-grid">
        <div className="institutes-stat-card">
          <span className="institutes-stat-value">{loading ? '…' : stats.total.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Total students</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--active">
          <span className="institutes-stat-value">{loading ? '…' : stats.faceRegistered.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Face registered</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--warn">
          <span className="institutes-stat-value">{loading ? '…' : stats.facePending.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Face pending</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--muted">
          <span className="institutes-stat-value">{loading ? '…' : stats.inactive.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Inactive</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--warn">
          <span className="institutes-stat-value">
            {loading ? '…' : stats.photoMismatch.toLocaleString('en-IN')}
          </span>
          <span className="institutes-stat-label">Photo updated for attendance</span>
        </div>
      </div>

      <InstituteIntegrityPanel
        institute={institute}
        students={students}
        loading={loading}
        attDate={attDate}
        onAttDateChange={setAttDate}
        dayAtt={dayAtt}
        attLoading={attLoading}
        attError={attError}
        showDayAttendance={showDayAttendance}
        onSelectStudent={onSelectStudent}
      />

      <AddStudentPanel institute={institute} onAdded={() => setReloadTick((t) => t + 1)} hidden={readOnly} />

      <div className="search-bar-row institutes-search-row students-att-toolbar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search students — name, roll, class, email, id…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setTablePage(0)
            }}
            className="search-input"
            aria-label="Filter students"
          />
          {search ? (
            <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              ✕
            </button>
          ) : null}
        </div>
        <label className="students-att-date-field">
          <span className="muted small">Day attendance</span>
          <input
            type="date"
            value={attDate}
            onChange={(e) => setAttDate(e.target.value)}
            disabled={loading}
            title="Load entry / exit times and photos for this date (attendance_in_out or teacher_attendance)"
            aria-label="Attendance date for entry and exit columns"
          />
        </label>
        <span className="search-count">
          {loading ? '…' : `${filtered.length} of ${students.length} shown`}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading || students.length === 0}
          title="Download full institute roster as CSV"
          onClick={() => {
            const { header, data } = instituteStudentRosterRows(institute, students as Record<string, unknown>[])
            const code = safeFilePart(institute.institute_code ?? institute.id.slice(0, 8))
            const stamp = new Date().toISOString().slice(0, 10)
            downloadCsv(`institute_${code}_roster_${stamp}.csv`, header, data)
          }}
        >
          📥 Roster CSV
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {attError ? <p className="error">{attError}</p> : null}
      {!showDayAttendance && !loading && students.length > 0 ? (
        <p className="muted small" style={{ margin: '0 0 0.5rem' }}>
          Entry / exit columns need <code>attendance_in_out</code> or <code>teacher_attendance</code> in the database.
          Detected: {primaryAttTable ? <code>{attendanceTables.join(', ')}</code> : <span>none</span>}. Open a student
          for subject-wise history when subjects exist.
        </p>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <div className="loading-row">
          <div className="loading-spinner" />
          <span>Loading students…</span>
        </div>
      ) : null}

      <div className="table-wrap institutes-table-wrap students-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Photo</th>
              <th>Name</th>
              <th>Roll</th>
              <th>Class</th>
              <th>Subjects</th>
              <th title="Earliest entry on selected date (attendance_in_out)">Entry</th>
              <th title="Latest exit on selected date">Exit</th>
              <th>Face</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && !loading ? (
              <tr>
                <td colSpan={10} className="muted">
                  No students registered for this institute yet.
                </td>
              </tr>
            ) : filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan={10} className="muted">
                  No students match “{search}”. Clear the search to see all {students.length} row(s).
                </td>
              </tr>
            ) : (
              paginatedRows.map((s) => {
                const name = pick(s, 'name', 'student_name', 'full_name') ?? '—'
                const roll = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno', 'admission_no') ?? '—'
                const cls = pick(s, 'class_name', 'class', 'grade', 'standard', 'std')
                const sec = pick(s, 'section', 'div', 'division')
                const active = s.is_active !== false
                const faceOk = hasFacePhoto(s)
                const classLabel = cls ? `${cls}${sec ? ` — ${sec}` : ''}` : studentFolderLabel(s)
                const rowAtt = dayAtt[s.id]
                const enrolledSubjects = subjectsFromStudent(s)

                return (
                  <tr key={s.id} className={!active ? 'student-row-inactive' : undefined}>
                    <td className="students-photo-cell">
                      <div className="student-table-avatar">
                        <StudentDisplayPhoto student={s} displayName={name} size="sm" />
                        <span>{initials(name)}</span>
                      </div>
                    </td>
                    <td className="student-name-cell">
                      <strong>{name}</strong>
                      <div className="muted small">
                        <code className="tiny">{s.id}</code>
                      </div>
                    </td>
                    <td>{roll}</td>
                    <td>{classLabel}</td>
                    <td className="small" title={enrolledSubjects.join(', ') || undefined}>
                      {formatSubjectsDisplay(enrolledSubjects)}
                    </td>
                    <td className="students-day-att-cell">
                      {showDayAttendance ? (
                        <>
                          <div className="students-att-time">{attLoading ? '…' : fmtTime(rowAtt?.entryAt)}</div>
                          <PhotoThumb url={rowAtt?.entryPhoto} label="In" compact />
                        </>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td className="students-day-att-cell">
                      {showDayAttendance ? (
                        <>
                          <div className="students-att-time">{attLoading ? '…' : fmtTime(rowAtt?.exitAt)}</div>
                          <PhotoThumb url={rowAtt?.exitPhoto} label="Out" compact />
                        </>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td>
                      {faceOk ? (
                        <span className="badge badge-present">Registered</span>
                      ) : (
                        <span className="badge badge-muted">Pending</span>
                      )}
                    </td>
                    <td>
                      {active ? (
                        <span className="badge badge-present">Active</span>
                      ) : (
                        <span className="badge badge-absent">Inactive</span>
                      )}
                    </td>
                    <td className="actions-cell">
                      <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
                        {!readOnly ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm institutes-action-btn"
                            onClick={() => setEditingStudent(s)}
                          >
                            Edit
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-primary btn-sm institutes-action-btn"
                          onClick={() => onSelectStudent(s)}
                        >
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 ? (
        <DirectoryPager
          safePage={safeTablePage}
          pageCount={tablePageCount}
          totalRows={filtered.length}
          pageSize={tablePageSize}
          onPrev={() => setTablePage((p) => Math.max(0, p - 1))}
          onNext={() => setTablePage((p) => Math.min(tablePageCount - 1, p + 1))}
          onPageSize={(n) => {
            setTablePageSize(n)
            setTablePage(0)
          }}
        />
      ) : null}

      {editingStudent && !readOnly ? (
        <EditStudentModal
          student={editingStudent}
          instituteLabel={institute.name ?? institute.institute_code ?? institute.id}
          onClose={() => setEditingStudent(null)}
          onSaved={() => {
            setReloadTick((t) => t + 1)
            setEditingStudent(null)
          }}
        />
      ) : null}

    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   LEVEL 0 — INSTITUTE PICKER
══════════════════════════════════════════════════════════════ */

function InstitutePicker({
  reloadToken = 0,
  onSelectInstitute,
}: {
  reloadToken?: number
  onSelectInstitute: (i: InstituteRow) => void
}) {
  const portal = usePortalAccess()
  const lockedDistrict = useMemo(
    () => findPortalDistrictForPrefixes(portal.institutePrefixes),
    [portal.institutePrefixes],
  )
  const [districtKey, setDistrictKey] = useState('')
  const [institutes, setInstitutes] = useState<InstituteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tablePage, setTablePage] = useState(0)
  const [tablePageSize, setTablePageSize] = useState(TABLE_PAGE_SIZE_DEFAULT)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sb = getSupabase()
      const raw = await fetchAllPaged<InstituteRow>((rangeFrom, rangeTo) =>
        sb
          .from('institutes')
          .select('*')
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
      const scoped =
        portal.mode === 'district_viewer' && portal.institutePrefixes.length > 0
          ? filterInstitutesByPortalPrefixes(raw, portal.institutePrefixes)
          : raw
      setInstitutes(sortByInstituteId(scoped))
    } catch (e) {
      setInstitutes([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [portal.mode, portal.institutePrefixes])

  useEffect(() => {
    void load()
    setTimeout(() => searchRef.current?.focus(), 100)
  }, [load, reloadToken])

  const effectiveDistrictKey =
    portal.mode === 'district_viewer' && lockedDistrict ? lockedDistrict.key : districtKey

  const districtFiltered = useMemo(() => {
    if (!effectiveDistrictKey) return institutes
    const district = findPortalDistrictByKey(effectiveDistrictKey)
    if (!district) return institutes
    return institutes.filter((i) => instituteRowMatchesPrefixes(i, district.prefixes))
  }, [institutes, effectiveDistrictKey])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return districtFiltered
    return districtFiltered.filter((i) =>
      [i.name, i.institute_code, i.id, i.city, i.state, i.pincode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [districtFiltered, search])

  const stats = useMemo(() => {
    let active = 0
    for (const r of institutes) {
      if (r.is_active !== false) active += 1
    }
    return {
      total: institutes.length,
      active,
      inactive: institutes.length - active,
    }
  }, [institutes])

  const tablePageCount = Math.max(1, Math.ceil(filtered.length / tablePageSize))
  const safeTablePage = Math.min(tablePage, tablePageCount - 1)

  const paginatedRows = useMemo(() => {
    const start = safeTablePage * tablePageSize
    return filtered.slice(start, start + tablePageSize)
  }, [filtered, safeTablePage, tablePageSize])

  useEffect(() => {
    setTablePage(0)
  }, [search, tablePageSize, effectiveDistrictKey])

  useEffect(() => {
    if (tablePage > tablePageCount - 1) {
      setTablePage(Math.max(0, tablePageCount - 1))
    }
  }, [tablePage, tablePageCount])

  return (
    <div className="students-panel">
      <InstituteDistrictFilter
        rows={institutes}
        districtKey={effectiveDistrictKey}
        onDistrictKeyChange={(key) => {
          setDistrictKey(key)
          setTablePage(0)
        }}
        filteredCount={districtFiltered.length}
        lockedDistrict={portal.mode === 'district_viewer' ? lockedDistrict : null}
        disabled={loading}
      />

      <div className="institutes-stat-grid">
        <div className="institutes-stat-card">
          <span className="institutes-stat-value">{loading ? '…' : stats.total.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Total institutes</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--active">
          <span className="institutes-stat-value">{loading ? '…' : stats.active.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Active</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--muted">
          <span className="institutes-stat-value">{loading ? '…' : stats.inactive.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Inactive</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--warn">
          <span className="institutes-stat-value">{loading ? '…' : filtered.length.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Matching search</span>
        </div>
      </div>

      <div className="search-bar-row institutes-search-row">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search institutes — name, code, city, state, id…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setTablePage(0)
            }}
            className="search-input"
            aria-label="Filter institutes"
          />
          {search ? (
            <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              ✕
            </button>
          ) : null}
        </div>
        <span className="search-count">
          {loading
            ? '…'
            : effectiveDistrictKey
              ? `${filtered.length} of ${districtFiltered.length} in district · ${institutes.length} total loaded`
              : `${filtered.length} of ${institutes.length} shown`}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading || institutes.length === 0}
          title="Download institute list as CSV"
          onClick={() => {
            const { header, data } = instituteDirectoryCsvRows(districtFiltered)
            const stamp = new Date().toISOString().slice(0, 10)
            downloadCsv(`institutes_directory_${stamp}.csv`, header, data)
          }}
        >
          📥 Directory CSV
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <div className="loading-row">
          <div className="loading-spinner" />
          <span>Loading institutes…</span>
        </div>
      ) : null}

      <div className="table-wrap institutes-table-wrap students-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>ID</th>
              <th>City</th>
              <th>State</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {institutes.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="muted">
                  No institutes found. Add institutes from the Institutes tab.
                </td>
              </tr>
            ) : filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="muted">
                  No institutes match “{search}”. Clear the search to see all {institutes.length} row(s).
                </td>
              </tr>
            ) : (
              paginatedRows.map((i) => (
                <tr key={i.id} className={i.is_active === false ? 'inst-row-inactive' : undefined}>
                  <td className="inst-name-cell">
                    <strong>{i.name ?? '—'}</strong>
                  </td>
                  <td>{i.institute_code ?? '—'}</td>
                  <td>
                    <code className="tiny">{i.id}</code>
                  </td>
                  <td>{i.city ?? '—'}</td>
                  <td>{i.state ?? '—'}</td>
                  <td>
                    {i.is_active !== false ? (
                      <span className="badge badge-present">Active</span>
                    ) : (
                      <span className="badge badge-absent">Inactive</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm institutes-action-btn"
                      onClick={() => onSelectInstitute(i)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 ? (
        <DirectoryPager
          safePage={safeTablePage}
          pageCount={tablePageCount}
          totalRows={filtered.length}
          pageSize={tablePageSize}
          onPrev={() => setTablePage((p) => Math.max(0, p - 1))}
          onNext={() => setTablePage((p) => Math.min(tablePageCount - 1, p + 1))}
          onPageSize={(n) => {
            setTablePageSize(n)
            setTablePage(0)
          }}
        />
      ) : null}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ROOT — StudentsSection
══════════════════════════════════════════════════════════════ */

export function StudentsSection({
  embedded = false,
  readOnly = false,
  jumpToInstituteId = null,
  onJumpToInstituteHandled,
}: {
  embedded?: boolean
  readOnly?: boolean
  jumpToInstituteId?: string | null
  onJumpToInstituteHandled?: () => void
}) {
  const [level, setLevel]         = useState<DrillLevel>(() => loadPersistedStudentsView()?.level ?? 'institutes')
  const [institute, setInstitute] = useState<InstituteRow | null>(() => loadPersistedStudentsView()?.institute ?? null)
  const [student, setStudent]     = useState<Student | null>(() => loadPersistedStudentsView()?.student ?? null)
  const [subject, setSubject]     = useState<Subject | null>(() => loadPersistedStudentsView()?.subject ?? null)
  const [schema, setSchema]       = useState<SchemaConfig>({
    subjectTable: null,
    attendanceTable: null,
    attendanceTables: [],
    discovered: false,
  })
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!jumpToInstituteId) return
    let cancelled = false
    ;(async () => {
      try {
        const sb = getSupabase()
        const { data, error } = await sb.from('institutes').select('*').eq('id', jumpToInstituteId).maybeSingle()
        if (cancelled) return
        if (!error && data) {
          setInstitute(data as InstituteRow)
          setLevel('students')
          setStudent(null)
          setSubject(null)
        }
      } finally {
        if (!cancelled) onJumpToInstituteHandled?.()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [jumpToInstituteId, onJumpToInstituteHandled])

  useEffect(() => {
    writeSessionJson(STUDENTS_VIEW_STORAGE_KEY, {
      level,
      institute,
      student,
      subject,
    } satisfies PersistedStudentsView)
  }, [level, institute, student, subject])

  async function runDiscovery() {
    setSchemaLoading(true)
    const cfg = await discoverSchema()
    setSchema(cfg)
    setSchemaLoading(false)
  }

  useEffect(() => { void runDiscovery() }, [])

  const shell = embedded ? 'dash-section students-page' : 'card students-page'

  return (
    <div className={shell}>
      <div className="card-head institutes-page-head">
        <div>
          {embedded ? <span className="section-kicker">Students</span> : <h2>Students</h2>}
          <p className="muted small students-page-lead">
            {readOnly
              ? 'Browse institutes and students in your district. View attendance and reports — editing is disabled.'
              : 'Browse institutes, manage rosters, and open each student\u2019s subject folders with live attendance from the database.'}
          </p>
          <div className="students-breadcrumb-trail tab-breadcrumb-trail">
            <span
              className={`trail-item${level === 'institutes' ? ' trail-active' : ' trail-clickable'}`}
              onClick={() => {
                setLevel('institutes')
                setInstitute(null)
                setStudent(null)
                setSubject(null)
              }}
            >
              Institutes
            </span>
            {institute ? (
              <>
                <span className="trail-sep">›</span>
                <span
                  className={`trail-item${level === 'students' ? ' trail-active' : ' trail-clickable'}`}
                  onClick={() => {
                    setLevel('students')
                    setStudent(null)
                    setSubject(null)
                  }}
                >
                  {institute.name}
                </span>
              </>
            ) : null}
            {student ? (
              <>
                <span className="trail-sep">›</span>
                <span
                  className={`trail-item${level === 'subjects' ? ' trail-active' : ' trail-clickable'}`}
                  onClick={() => {
                    setLevel('subjects')
                    setSubject(null)
                  }}
                >
                  {pick(student, 'name', 'student_name', 'full_name') ?? student.id}
                </span>
              </>
            ) : null}
            {subject ? (
              <>
                <span className="trail-sep">›</span>
                <span className="trail-item trail-active">
                  {pick(subject, 'name', 'subject_name', 'course_name', 'title') ?? subject.id}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="card-head-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setReloadToken((t) => t + 1)}
            disabled={schemaLoading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="students-body">
  {/* Schema discovery status */}
        {schemaLoading ? (
          <div className="loading-row" style={{ marginBottom: '0.5rem' }}>
            <div className="loading-spinner" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Detecting database schema…
            </span>
          </div>
        ) : (
          <SchemaBanner cfg={schema} onRetry={() => void runDiscovery()} />
        )}

        {level === 'institutes' && (
          <InstitutePicker reloadToken={reloadToken} onSelectInstitute={(i) => { setInstitute(i); setStudent(null); setSubject(null); setLevel('students') }} />
        )}
        {level === 'students' && institute && (
          <StudentsList
            institute={institute}
            reloadToken={reloadToken}
            attendanceTables={schema.attendanceTables}
            readOnly={readOnly}
            onBack={() => { setLevel('institutes'); setInstitute(null) }}
            onSelectStudent={(s) => { setStudent(s); setSubject(null); setLevel('subjects') }}
          />
        )}
        {level === 'subjects' && student && institute && (
          <SubjectFolders
            student={student}
            subjectTable={schema.subjectTable}
            attTable={schema.attendanceTable}
            institute={institute}
            readOnly={readOnly}
            onBack={() => { setLevel('students'); setStudent(null) }}
            onSelectSubject={s => { setSubject(s); setLevel('attendance') }}
            onStudentUpdated={(s) => setStudent(s)}
          />
        )}
        {level === 'attendance' && student && subject && schema.attendanceTable && institute && (
          <AttendanceView
            student={student}
            subject={subject}
            attTable={schema.attendanceTable}
            institute={institute}
            onBack={() => { setLevel('subjects'); setSubject(null) }}
          />
        )}
        {level === 'attendance' && !schema.attendanceTable && !schemaLoading && (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <div className="empty-title">Attendance table not found</div>
            <div className="empty-sub">
              Tried: {ATTENDANCE_CANDIDATES.join(', ')}. Check your Supabase table names.
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => void runDiscovery()}>
              ↻ Retry detection
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
