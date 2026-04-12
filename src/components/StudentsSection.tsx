/**
 * StudentsSection — MSCE Admin Portal
 * Auto-discovers actual table names by probing Supabase.
 * Works regardless of whether your schema uses:
 *   institute_subjects (EduSetu) / subjects / courses / …
 *   teacher_attendance (EduSetu) / attendance_in_out / attendance_records / …
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { immediateImgSrc, resolvePhotoUrlString } from '../lib/photoUrl'
import {
  attendanceReportRows,
  csvEscape,
  downloadCsv,
  instituteDirectoryCsvRows,
  instituteStudentRosterRows,
} from '../lib/reportCsv'
import type { InstituteRow } from './InstituteList'
import { StudentDisplayPhoto } from './StudentDisplayPhoto'
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
  is_active?: boolean | null
  email?: string | null
  phone?: string | null
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

/** Pick a display field from a row — tries multiple possible column names */
function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return null
}

/** EduSetu `teacher_attendance.student_id` is usually roll / sr_no / user_id, not `students.id`. */
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

function flattenTeacherAttendanceRow(row: Record<string, unknown>): AttendanceRecord {
  const p =
    row.payload !== null && typeof row.payload === 'object'
      ? (row.payload as Record<string, unknown>)
      : {}
  return {
    ...row,
    id: String(row.id ?? ''),
    date: (row.date ?? p.date ?? null) as string | null,
    status: (row.status ?? p.status ?? null) as string | null,
    in_time: (p.entryTime ?? p.timestamp ?? row.in_time ?? null) as string | null,
    out_time: (p.exitTime ?? row.out_time ?? null) as string | null,
    in_photo_url: (p.entryPhoto ?? p.photoUrl ?? row.in_photo_url ?? null) as string | null,
    out_photo_url: (p.exitPhoto ?? row.out_photo_url ?? null) as string | null,
  } as AttendanceRecord
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
          Schema detected — subjects: <code>{cfg.subjectTable}</code> · attendance: <code>{cfg.attendanceTable}</code>
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
   PHOTO LIGHTBOX
══════════════════════════════════════════════════════════════ */

function PhotoLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal aria-label={alt}>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
        <img src={src} alt={alt} className="lightbox-img" />
        <p className="lightbox-caption">{alt}</p>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PHOTO THUMBNAIL
══════════════════════════════════════════════════════════════ */

function PhotoThumb({ url, label }: { url: string | null | undefined; label: string }) {
  const [lb, setLb] = useState(false)
  const [err, setErr] = useState(false)
  const raw = url ? String(url) : null
  const [resolved, setResolved] = useState<string | null>(() => immediateImgSrc(raw))
  const [pending, setPending] = useState(() => !!raw && !immediateImgSrc(raw))

  useEffect(() => {
    const u = url ? String(url) : null
    const fast = immediateImgSrc(u)
    if (fast) {
      setResolved(fast)
      setPending(false)
      setErr(false)
      return
    }
    if (!u) {
      setResolved(null)
      setPending(false)
      setErr(false)
      return
    }
    setPending(true)
    let cancelled = false
    void resolvePhotoUrlString(u).then((r) => {
      if (cancelled) return
      setPending(false)
      setResolved(r)
      setErr(false)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  if (!raw) {
    return (
      <div className="att-photo-slot att-photo-empty">
        <span className="att-photo-empty-icon">📷</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</span>
        <span className="att-photo-no-photo">No photo</span>
      </div>
    )
  }

  const src = resolved
  const showErr = err || (!pending && !src)

  return (
    <>
      <div
        className={`att-photo-slot${showErr ? ' att-photo-error' : ''}`}
        onClick={() => !showErr && src && setLb(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !showErr && src && setLb(true)}
        title={`View ${label} photo`}
      >
        <div className="att-photo-label">{label === 'In' ? '🟢' : '🔴'} {label}</div>
        {pending ? (
          <div className="att-photo-err-msg" style={{ opacity: 0.75 }}>
            <span>⏳</span>
            <span>Loading…</span>
          </div>
        ) : showErr ? (
          <div className="att-photo-err-msg">
            <span>⚠️</span>
            <span>Failed to load</span>
          </div>
        ) : (
          <img src={src!} alt={`${label} photo`} className="att-photo-img" onError={() => setErr(true)} />
        )}
        {!showErr && src && <div className="att-photo-overlay">🔍 View</div>}
      </div>
      {lb && src && <PhotoLightbox src={src} alt={`${label} photo`} onClose={() => setLb(false)} />}
    </>
  )
}

/* ══════════════════════════════════════════════════════════════
   LEVEL 3 — ATTENDANCE VIEW
══════════════════════════════════════════════════════════════ */

function AttendanceView({
  student, subject, attTable, onBack,
}: {
  student: Student
  subject: Subject
  attTable: string
  onBack: () => void
}) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
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

      // EduSetu: per-day doc keyed by roll in `student_id`, times/photos in `payload` JSON
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
        setRecords((data ?? []).map((r) => flattenTeacherAttendanceRow(r as Record<string, unknown>)))
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
  }, [student, subject.id, attTable, month])

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
  student, subjectTable, attTable, onBack, onSelectSubject,
}: {
  student: Student
  subjectTable: string | null
  attTable: string | null
  onBack: () => void
  onSelectSubject: (s: Subject) => void
}) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const studentName = pick(student, 'name', 'student_name', 'full_name') ?? student.id

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)

      const instId = pick(student, 'institute_id', 'school_id', 'org_id', 'instituteid')

      if (subjectTable) {
        try {
          const sb = getSupabase()
          // Try filtering by institute_id; if no such column, fetch all
          let q = sb.from(subjectTable).select('*').order('name')
          if (instId) q = q.eq('institute_id', instId)
          const { data, error: qErr } = await q

          if (!qErr) {
            setSubjects((data ?? []) as Subject[])
            setLoading(false)
            return
          }
          // If institute_id column doesn't exist, fetch without filter
          if (qErr.message?.includes('does not exist') || (qErr as {code?:string}).code === '42703') {
            const { data: d2 } = await sb.from(subjectTable).select('*').order('name')
            setSubjects((d2 ?? []) as Subject[])
            setLoading(false)
            return
          }
          throw new Error(qErr.message)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } else if (attTable) {
        // No subject table found — derive subjects from distinct subject_id in attendance
        try {
          const sb = getSupabase()
          const { data } = await sb
            .from(attTable)
            .select('subject_id')
            .eq('student_id', student.id)
          const unique = [...new Set((data ?? []).map((r: Record<string,unknown>) => r.subject_id).filter(Boolean))]
          setSubjects(unique.map(id => ({ id: String(id), name: `Subject ${id}`, subject_code: null }) as Subject))
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } else {
        setError('No subjects or attendance table found in your database. Check table names in Supabase.')
      }

      setLoading(false)
    }
    void load()
  }, [student, subjectTable, attTable])

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
        <div className="student-avatar-lg">
          <StudentDisplayPhoto student={student} displayName={studentName} size="lg" />
          <span className="student-avatar-initials-lg">{initials(studentName)}</span>
        </div>
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
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   LEVEL 1 — STUDENTS LIST
══════════════════════════════════════════════════════════════ */

function StudentsList({
  institute, onBack, onSelectStudent,
}: {
  institute: InstituteRow
  onBack: () => void
  onSelectStudent: (s: Student) => void
}) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const sb = getSupabase()
        const { data, error: qErr } = await sb
          .from('students')
          .select('*')
          .eq('institute_id', institute.id)
          .order('name')
        if (qErr) throw new Error([qErr.message, qErr.details, (qErr as {hint?:string}).hint].filter(Boolean).join(' — '))
        setStudents((data ?? []) as Student[])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    void load()
    setTimeout(() => searchRef.current?.focus(), 100)
  }, [institute.id])

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    if (!q) return true
    const name    = pick(s, 'name', 'student_name', 'full_name') ?? ''
    const roll    = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') ?? ''
    const cls     = pick(s, 'class_name', 'class', 'grade') ?? ''
    const email   = pick(s, 'email', 'email_id') ?? ''
    return [name, roll, cls, email].some(v => v.toLowerCase().includes(q))
  })

  return (
    <div className="students-panel">
      <div className="drill-breadcrumb">
        <button className="drill-back" onClick={onBack}>← Back to Institutes</button>
        <span className="drill-sep">›</span>
        <span className="drill-crumb active">{institute.name ?? institute.id}</span>
      </div>

      <div className="inst-info-bar card-elevated">
        <div className="inst-info-icon">🏫</div>
        <div>
          <div className="inst-info-name">{institute.name}</div>
          <div className="inst-info-meta">
            {institute.institute_code && <span>Code: {institute.institute_code}</span>}
            {institute.city          && <span>· {institute.city}</span>}
            {institute.state         && <span>· {institute.state}</span>}
          </div>
        </div>
        <div className="inst-info-count">
          <span className="big-num">{students.length}</span>
          <span className="big-lbl">Students</span>
        </div>
      </div>

      <div className="search-bar-row">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name, roll no, class or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
          {search && <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear">✕</button>}
        </div>
        <span className="search-count">{filtered.length} of {students.length}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading || students.length === 0}
          title="Download full institute roster as CSV (all students, not only search filter)"
          onClick={() => {
            const { header, data } = instituteStudentRosterRows(institute, students as Record<string, unknown>[])
            const code = safeFilePart(institute.institute_code ?? institute.id.slice(0, 8))
            const stamp = new Date().toISOString().slice(0, 10)
            downloadCsv(`institute_${code}_roster_${stamp}.csv`, header, data)
          }}
        >
          📥 Roster CSV
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading-row"><div className="loading-spinner" /><span>Loading students…</span></div>}

      {!loading && filtered.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">👤</div>
          <div className="empty-title">{search ? 'No matching students' : 'No students enrolled'}</div>
          <div className="empty-sub">{search ? `No results for "${search}"` : 'No students registered for this institute yet.'}</div>
        </div>
      )}

      <div className="students-grid">
        {filtered.map(s => {
          const name  = pick(s, 'name', 'student_name', 'full_name') ?? '—'
          const roll  = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno', 'admission_no')
          const cls   = pick(s, 'class_name', 'class', 'grade', 'standard', 'std')
          const sec   = pick(s, 'section', 'div', 'division')
          const active = s.is_active !== false

          return (
            <button key={s.id} className="student-card" onClick={() => onSelectStudent(s)}>
              <div className="student-avatar">
                <StudentDisplayPhoto student={s} displayName={name} size="sm" />
                <span className="student-avatar-initials">{initials(name)}</span>
              </div>
              <div className="student-info">
                <div className="student-name">{name}</div>
                {roll && <div className="student-meta">Roll: {roll}</div>}
                {cls  && <div className="student-meta">{cls}{sec ? ` — ${sec}` : ''}</div>}
              </div>
              <div className={`student-status-dot ${active ? 'dot-active' : 'dot-inactive'}`} title={active ? 'Active' : 'Inactive'} />
              <div className="student-arrow">›</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   LEVEL 0 — INSTITUTE PICKER
══════════════════════════════════════════════════════════════ */

function InstitutePicker({ onSelectInstitute }: { onSelectInstitute: (i: InstituteRow) => void }) {
  const [institutes, setInstitutes] = useState<InstituteRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const sb = getSupabase()
        const { data, error: qErr } = await sb
          .from('institutes').select('*').order('name').limit(500)
        if (qErr) throw qErr
        setInstitutes((data ?? []) as InstituteRow[])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    void load()
    setTimeout(() => searchRef.current?.focus(), 100)
  }, [])

  const filtered = institutes.filter(i => {
    const q = search.toLowerCase()
    return !q
      || (i.name ?? '').toLowerCase().includes(q)
      || (i.institute_code ?? '').toLowerCase().includes(q)
      || (i.city ?? '').toLowerCase().includes(q)
  })

  const active   = filtered.filter(i => i.is_active !== false)
  const inactive = filtered.filter(i => i.is_active === false)

  return (
    <div className="students-panel">
      <div className="overview-notice" style={{ marginBottom: '1.25rem' }}>
        <span>📋</span>
        <span>Select an institute to browse enrolled students and their subject-wise attendance with entry/exit photos.</span>
      </div>
      <div className="search-bar-row">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input ref={searchRef} type="text" placeholder="Search institute by name, code or city…"
            value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
          {search && <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear">✕</button>}
        </div>
        <span className="search-count">{loading ? 'Loading…' : `${filtered.length} institute${filtered.length !== 1 ? 's' : ''}`}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading || institutes.length === 0}
          title="Download institute list as CSV"
          onClick={() => {
            const { header, data } = instituteDirectoryCsvRows(institutes)
            const stamp = new Date().toISOString().slice(0, 10)
            downloadCsv(`institutes_directory_${stamp}.csv`, header, data)
          }}
        >
          📥 Directory CSV
        </button>
      </div>

      {error  && <div className="error">{error}</div>}
      {loading && <div className="loading-row"><div className="loading-spinner" /><span>Loading institutes…</span></div>}

      {!loading && filtered.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">🏫</div>
          <div className="empty-title">{search ? 'No matching institutes' : 'No institutes found'}</div>
          <div className="empty-sub">{search ? `No results for "${search}"` : 'Add institutes from the Institutes tab.'}</div>
        </div>
      )}

      {active.length > 0 && (
        <>
          <div className="section-title-row">
            <h3 className="section-heading">✅ Active Institutes</h3>
            <span className="section-count">{active.length}</span>
          </div>
          <div className="institute-grid">
            {active.map(i => <InstCard key={i.id} inst={i} onClick={() => onSelectInstitute(i)} />)}
          </div>
        </>
      )}
      {inactive.length > 0 && (
        <>
          <div className="section-title-row" style={{ marginTop: '1.5rem' }}>
            <h3 className="section-heading">⏸ Inactive Institutes</h3>
            <span className="section-count">{inactive.length}</span>
          </div>
          <div className="institute-grid">
            {inactive.map(i => <InstCard key={i.id} inst={i} onClick={() => onSelectInstitute(i)} />)}
          </div>
        </>
      )}
    </div>
  )
}

function InstCard({ inst, onClick }: { inst: InstituteRow; onClick: () => void }) {
  return (
    <button className={`inst-card${inst.is_active === false ? ' inst-card-inactive' : ''}`} onClick={onClick}>
      <div className="inst-card-icon">🏛️</div>
      <div className="inst-card-body">
        <div className="inst-card-name">{inst.name ?? inst.id}</div>
        <div className="inst-card-meta">
          {inst.institute_code && <span className="inst-chip">{inst.institute_code}</span>}
          {inst.city           && <span className="inst-chip">📍 {inst.city}</span>}
          {inst.is_active === false && <span className="inst-chip inst-chip-inactive">Inactive</span>}
        </div>
      </div>
      <div className="inst-card-arrow">›</div>
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════
   ROOT — StudentsSection
══════════════════════════════════════════════════════════════ */

export function StudentsSection({ embedded = false }: { embedded?: boolean }) {
  const [level, setLevel]         = useState<DrillLevel>('institutes')
  const [institute, setInstitute] = useState<InstituteRow | null>(null)
  const [student, setStudent]     = useState<Student | null>(null)
  const [subject, setSubject]     = useState<Subject | null>(null)
  const [schema, setSchema]       = useState<SchemaConfig>({ subjectTable: null, attendanceTable: null, discovered: false })
  const [schemaLoading, setSchemaLoading] = useState(true)

  async function runDiscovery() {
    setSchemaLoading(true)
    const cfg = await discoverSchema()
    setSchema(cfg)
    setSchemaLoading(false)
  }

  useEffect(() => { void runDiscovery() }, [])

  const shell = embedded ? 'dash-section card-elevated' : 'card'

  return (
    <div className={`${shell} students-shell-flush`}>
      {/* Header */}
      <div className="students-tab-header">
        <div className="students-tab-title">
          <span className="section-kicker">Students</span>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Student Attendance Viewer</h2>
        </div>
        <div className="tab-breadcrumb-trail">
          <span className={`trail-item${level === 'institutes' ? ' trail-active' : ' trail-clickable'}`}
            onClick={() => { setLevel('institutes'); setInstitute(null); setStudent(null); setSubject(null) }}>
            🏛 Institutes
          </span>
          {institute && <>
            <span className="trail-sep">›</span>
            <span className={`trail-item${level === 'students' ? ' trail-active' : ' trail-clickable'}`}
              onClick={() => { setLevel('students'); setStudent(null); setSubject(null) }}>
              {institute.name}
            </span>
          </>}
          {student && <>
            <span className="trail-sep">›</span>
            <span className={`trail-item${level === 'subjects' ? ' trail-active' : ' trail-clickable'}`}
              onClick={() => { setLevel('subjects'); setSubject(null) }}>
              {pick(student, 'name', 'student_name', 'full_name') ?? student.id}
            </span>
          </>}
          {subject && <>
            <span className="trail-sep">›</span>
            <span className="trail-item trail-active">
              {pick(subject, 'name', 'subject_name', 'course_name', 'title') ?? subject.id}
            </span>
          </>}
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
          <InstitutePicker onSelectInstitute={i => { setInstitute(i); setStudent(null); setSubject(null); setLevel('students') }} />
        )}
        {level === 'students' && institute && (
          <StudentsList
            institute={institute}
            onBack={() => { setLevel('institutes'); setInstitute(null) }}
            onSelectStudent={s => { setStudent(s); setSubject(null); setLevel('subjects') }}
          />
        )}
        {level === 'subjects' && student && (
          <SubjectFolders
            student={student}
            subjectTable={schema.subjectTable}
            attTable={schema.attendanceTable}
            onBack={() => { setLevel('students'); setStudent(null) }}
            onSelectSubject={s => { setSubject(s); setLevel('attendance') }}
          />
        )}
        {level === 'attendance' && student && subject && schema.attendanceTable && (
          <AttendanceView
            student={student}
            subject={subject}
            attTable={schema.attendanceTable}
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
