/**
 * Reports — pick institute, then institute-wide or per-student attendance CSV.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { csvEscape } from '../lib/reportCsv'
import { discoverSchema, type SchemaConfig } from '../lib/schemaDiscovery'
import type { InstituteRow } from './InstituteList'
import { StudentDisplayPhoto } from './StudentDisplayPhoto'

type Student = Record<string, unknown> & {
  id: string
  name?: string | null
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

type ReportMode = 'institute' | 'student'

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return null
}

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

function fmtTime(val: string | null | undefined) {
  if (!val) return '—'
  try {
    if (String(val).includes('T')) {
      return new Date(String(val)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }
    const [h, m] = String(val).split(':')
    const hr = parseInt(h, 10)
    return `${((hr % 12) || 12).toString().padStart(2, '0')}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
  } catch {
    return String(val)
  }
}

function safeFilePart(s: string | null | undefined): string {
  const t = (s ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 48)
  return t || 'report'
}

function monthRange(month: string): { from: string; to: string } {
  const [yr, mo] = month.split('-')
  const y = parseInt(yr ?? '0', 10)
  const mCal = parseInt(mo ?? '1', 10)
  const from = `${yr}-${mo}-01`
  const last = new Date(y, mCal, 0)
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  return { from, to }
}

function rollToNameMap(students: Student[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const s of students) {
    const name = pick(s, 'name', 'student_name', 'full_name') ?? s.id
    for (const r of studentRollIdentifiers(s)) {
      if (!m.has(r)) m.set(r, name)
    }
  }
  return m
}

async function fetchAllPaged(
  run: (rangeFrom: number, rangeTo: number) => PromiseLike<{
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }>,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  const page = 1000
  let rangeFrom = 0
  for (;;) {
    const rangeTo = rangeFrom + page - 1
    const { data, error } = await Promise.resolve(run(rangeFrom, rangeTo))
    if (error) throw new Error(error.message)
    const chunk = data ?? []
    out.push(...chunk)
    if (chunk.length < page) break
    rangeFrom += page
  }
  return out
}

function getPhotoIn(r: AttendanceRecord): string {
  return String(r.in_photo_url ?? r['entry_photo'] ?? r['photo_in'] ?? '')
}

function getPhotoOut(r: AttendanceRecord): string {
  return String(r.out_photo_url ?? r['exit_photo'] ?? r['photo_out'] ?? '')
}

export function ReportsSection({ embedded = false }: { embedded?: boolean }) {
  const [schema, setSchema] = useState<SchemaConfig>({
    subjectTable: null,
    attendanceTable: null,
    discovered: false,
  })
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [institute, setInstitute] = useState<InstituteRow | null>(null)
  const [mode, setMode] = useState<ReportMode>('institute')
  const [students, setStudents] = useState<Student[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [month, setMonth] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [institutes, setInstitutes] = useState<InstituteRow[]>([])
  const [instLoading, setInstLoading] = useState(true)
  const [instSearch, setInstSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const studentSearchRef = useRef<HTMLInputElement>(null)

  const runDiscovery = useCallback(async () => {
    setSchemaLoading(true)
    setSchema(await discoverSchema())
    setSchemaLoading(false)
  }, [])

  useEffect(() => {
    void runDiscovery()
  }, [runDiscovery])

  useEffect(() => {
    async function loadInst() {
      setInstLoading(true)
      try {
        const sb = getSupabase()
        const { data, error: qErr } = await sb.from('institutes').select('*').order('name').limit(5000)
        if (qErr) throw qErr
        setInstitutes((data ?? []) as InstituteRow[])
      } catch (e) {
        setInstitutes([])
      } finally {
        setInstLoading(false)
      }
    }
    void loadInst()
    setTimeout(() => searchRef.current?.focus(), 120)
  }, [])

  const loadStudents = useCallback(async (inst: InstituteRow) => {
    setStudentsLoading(true)
    setStudentsError(null)
    try {
      const sb = getSupabase()
      const { data, error: qErr } = await sb
        .from('students')
        .select('*')
        .eq('institute_id', inst.id)
        .order('name')
      if (qErr) throw qErr
      setStudents((data ?? []) as Student[])
    } catch (e) {
      setStudents([])
      setStudentsError(e instanceof Error ? e.message : String(e))
    } finally {
      setStudentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (institute) {
      void loadStudents(institute)
      setSelectedStudent(null)
      setSearch('')
      setTimeout(() => studentSearchRef.current?.focus(), 150)
    }
  }, [institute, loadStudents])

  const filteredInst = institutes.filter((i) => {
    const q = instSearch.toLowerCase()
    return (
      !q ||
      (i.name ?? '').toLowerCase().includes(q) ||
      (i.institute_code ?? '').toLowerCase().includes(q) ||
      (i.city ?? '').toLowerCase().includes(q)
    )
  })

  const filteredStudents = students.filter((s) => {
    const q = search.toLowerCase()
    if (!q) return true
    const name = pick(s, 'name', 'student_name', 'full_name') ?? ''
    const roll = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') ?? ''
    const cls = pick(s, 'class_name', 'class', 'grade') ?? ''
    return [name, roll, cls].some((v) => v.toLowerCase().includes(q))
  })

  async function downloadInstituteReport() {
    if (!institute || !schema.attendanceTable) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const sb = getSupabase()
      const attTable = schema.attendanceTable
      const { from, to } = monthRange(month)
      let raw: Record<string, unknown>[] = []

      if (attTable === 'teacher_attendance') {
        raw = await fetchAllPaged((rangeFrom, rangeTo) =>
          sb
            .from(attTable)
            .select('*')
            .eq('institute_id', institute.id)
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: false })
            .range(rangeFrom, rangeTo),
        )
      } else {
        const ids = students.map((s) => s.id)
        if (ids.length === 0) {
          setError('No students in this institute — cannot load attendance by student id.')
          return
        }
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100)
          const part = await fetchAllPaged((rangeFrom, rangeTo) =>
            sb
              .from(attTable)
              .select('*')
              .in('student_id', chunk)
              .gte('date', from)
              .lte('date', to)
              .order('date', { ascending: false })
              .range(rangeFrom, rangeTo),
          )
          raw = raw.concat(part)
        }
      }

      const rollMap = rollToNameMap(students)
      const instName = institute.name ?? institute.id
      const detailHeader = [
        'institute_id',
        'institute_name',
        'date',
        'student_key',
        'student_name',
        'status',
        'in_time',
        'out_time',
        'subject_id',
        'record_id',
        'in_photo_url',
        'out_photo_url',
      ]
      const detailRows: string[][] = []
      const summary = new Map<
        string,
        { name: string; roll: string; present: number; absent: number; other: number }
      >()

      for (const row of raw) {
        const rec =
          attTable === 'teacher_attendance'
            ? flattenTeacherAttendanceRow(row)
            : (row as AttendanceRecord)
        const sid = String(rec.student_id ?? row.student_id ?? '')
        const st = String(rec.status ?? '').toLowerCase()
        const displayName = rollMap.get(sid) ?? sid
        const dateStr = rec.date ? String(rec.date).slice(0, 10) : ''
        detailRows.push([
          institute.id,
          instName,
          dateStr,
          sid,
          displayName,
          String(rec.status ?? ''),
          fmtTime(rec.in_time as string | null),
          fmtTime(rec.out_time as string | null),
          String(rec.subject_id ?? ''),
          rec.id,
          getPhotoIn(rec),
          getPhotoOut(rec),
        ])

        const key = `${sid}\t${displayName}`
        if (!summary.has(key)) {
          summary.set(key, {
            name: displayName,
            roll: sid,
            present: 0,
            absent: 0,
            other: 0,
          })
        }
        const agg = summary.get(key)!
        if (st === 'present') agg.present += 1
        else if (st === 'absent') agg.absent += 1
        else agg.other += 1
      }

      const summaryHeader = [
        'institute_id',
        'institute_name',
        'month',
        'student_name',
        'attendance_student_key',
        'present_days',
        'absent_days',
        'other_marked',
        'total_records',
      ]
      const summaryRows = [...summary.values()].map((a) => [
        institute.id,
        instName,
        month,
        a.name,
        a.roll,
        String(a.present),
        String(a.absent),
        String(a.other),
        String(a.present + a.absent + a.other),
      ])

      const meta = [
        `report_type,institute_attendance`,
        `institute,${csvEscape(instName)}`,
        `institute_id,${csvEscape(institute.id)}`,
        `month,${csvEscape(month)}`,
        `table,${csvEscape(attTable)}`,
        `generated,${csvEscape(new Date().toISOString())}`,
        `detail_row_count,${String(detailRows.length)}`,
        '',
        '=== SUMMARY (per student) ===',
      ].join('\n')
      const meta2 = ['', '', '=== DETAIL (each attendance row) ===', ''].join('\n')

      const summaryCsv =
        '\ufeff' +
        meta +
        '\n' +
        summaryHeader.map(csvEscape).join(',') +
        '\n' +
        summaryRows.map((r) => r.map(csvEscape).join(',')).join('\n') +
        '\n' +
        meta2 +
        '\n' +
        detailHeader.map(csvEscape).join(',') +
        '\n' +
        detailRows.map((r) => r.map(csvEscape).join(',')).join('\n')

      const blob = new Blob([summaryCsv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report_institute_${safeFilePart(institute.institute_code ?? institute.id)}_${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setInfo(`Downloaded ${detailRows.length} attendance row(s); ${summary.size} student(s) in summary.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function downloadStudentReport() {
    if (!institute || !selectedStudent || !schema.attendanceTable) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const sb = getSupabase()
      const attTable = schema.attendanceTable
      const { from, to } = monthRange(month)
      const studentName = pick(selectedStudent, 'name', 'student_name', 'full_name') ?? selectedStudent.id
      let raw: Record<string, unknown>[] = []

      if (attTable === 'teacher_attendance') {
        const keys = studentRollIdentifiers(selectedStudent)
        if (keys.length === 0) throw new Error('Student has no roll / id for attendance lookup.')
        raw = await fetchAllPaged((rangeFrom, rangeTo) =>
          sb
            .from(attTable)
            .select('*')
            .in('student_id', keys)
            .eq('institute_id', institute.id)
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: false })
            .range(rangeFrom, rangeTo),
        )
      } else {
        raw = await fetchAllPaged((rangeFrom, rangeTo) =>
          sb
            .from(attTable)
            .select('*')
            .eq('student_id', selectedStudent.id)
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: false })
            .range(rangeFrom, rangeTo),
        )
      }

      const flat = raw.map((row) =>
        attTable === 'teacher_attendance' ? flattenTeacherAttendanceRow(row) : (row as AttendanceRecord),
      )
      const header = ['date', 'status', 'in_time', 'out_time', 'subject_id', 'record_id', 'in_photo_url', 'out_photo_url']
      const rows = flat.map((rec) => [
        rec.date ? String(rec.date).slice(0, 10) : '',
        String(rec.status ?? ''),
        fmtTime(rec.in_time as string | null),
        fmtTime(rec.out_time as string | null),
        String(rec.subject_id ?? ''),
        rec.id,
        getPhotoIn(rec),
        getPhotoOut(rec),
      ])

      const meta = [
        `report_type,student_attendance`,
        `institute,${csvEscape(institute.name ?? '')}`,
        `institute_id,${csvEscape(institute.id)}`,
        `student,${csvEscape(studentName)}`,
        `student_id,${csvEscape(selectedStudent.id)}`,
        `month,${csvEscape(month)}`,
        `table,${csvEscape(attTable)}`,
        `generated,${csvEscape(new Date().toISOString())}`,
        '',
      ].join('\n')

      const blob = new Blob(['\ufeff' + meta + '\n' + header.map(csvEscape).join(',') + '\n' + rows.map((r) => r.map(csvEscape).join(',')).join('\n')], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report_student_${safeFilePart(studentName)}_${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setInfo(`Downloaded ${rows.length} row(s) for ${studentName}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const shell = embedded ? 'dash-section card-elevated' : 'card'
  const active = filteredInst.filter((i) => i.is_active !== false)
  const inactive = filteredInst.filter((i) => i.is_active === false)

  return (
    <div className={`${shell} students-shell-flush`}>
      <div className="students-tab-header">
        <div className="students-tab-title">
          <span className="section-kicker">Reports</span>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Attendance reports</h2>
        </div>
      </div>

      <div className="students-body">
        {schemaLoading ? (
          <div className="loading-row">
            <div className="loading-spinner" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Detecting attendance table…</span>
          </div>
        ) : !schema.attendanceTable ? (
          <div className="error">
            No attendance table found. Open <strong>Students &amp; Attendance</strong> to verify schema, or check
            Supabase.
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => void runDiscovery()}>
              ↻ Retry
            </button>
          </div>
        ) : null}

        {!schemaLoading && schema.attendanceTable && (
          <p className="muted small" style={{ marginBottom: '1rem' }}>
            Using table <code>{schema.attendanceTable}</code>. Choose an institute, then download an{' '}
            <strong>institute-wide</strong> report (all students + summary) or pick one <strong>student</strong> (search
            or list) for their monthly attendance CSV.
          </p>
        )}

        {!institute ? (
          <>
            <div className="overview-notice" style={{ marginBottom: '1rem' }}>
              <span>🏫</span>
              <span>
                <strong>Step 1 —</strong> Select an institute to generate reports.
              </span>
            </div>
            <div className="search-bar-row">
              <div className="search-bar">
                <span className="search-icon">🔍</span>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search institute by name, code or city…"
                  value={instSearch}
                  onChange={(e) => setInstSearch(e.target.value)}
                  className="search-input"
                />
                {instSearch && (
                  <button type="button" className="search-clear" onClick={() => setInstSearch('')} aria-label="Clear">
                    ✕
                  </button>
                )}
              </div>
              <span className="search-count">{instLoading ? 'Loading…' : `${filteredInst.length} match(es)`}</span>
            </div>
            {instLoading && (
              <div className="loading-row">
                <div className="loading-spinner" />
                <span>Loading institutes…</span>
              </div>
            )}
            {!instLoading && active.length > 0 && (
              <>
                <div className="section-title-row">
                  <h3 className="section-heading">Active institutes</h3>
                  <span className="section-count">{active.length}</span>
                </div>
                <div className="institute-grid">
                  {active.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      className="inst-card"
                      onClick={() => setInstitute(i)}
                    >
                      <div className="inst-card-icon">🏛️</div>
                      <div className="inst-card-body">
                        <div className="inst-card-name">{i.name ?? i.id}</div>
                        <div className="inst-card-meta">
                          {i.institute_code && <span className="inst-chip">{i.institute_code}</span>}
                          {i.city && <span className="inst-chip">📍 {i.city}</span>}
                        </div>
                      </div>
                      <div className="inst-card-arrow">›</div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {inactive.length > 0 && (
              <>
                <div className="section-title-row" style={{ marginTop: '1.25rem' }}>
                  <h3 className="section-heading">Inactive institutes</h3>
                  <span className="section-count">{inactive.length}</span>
                </div>
                <div className="institute-grid">
                  {inactive.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      className={`inst-card${i.is_active === false ? ' inst-card-inactive' : ''}`}
                      onClick={() => setInstitute(i)}
                    >
                      <div className="inst-card-icon">🏛️</div>
                      <div className="inst-card-body">
                        <div className="inst-card-name">{i.name ?? i.id}</div>
                        <div className="inst-card-meta">
                          {i.institute_code && <span className="inst-chip">{i.institute_code}</span>}
                          <span className="inst-chip inst-chip-inactive">Inactive</span>
                        </div>
                      </div>
                      <div className="inst-card-arrow">›</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="drill-breadcrumb" style={{ marginBottom: '1rem' }}>
              <button type="button" className="drill-back" onClick={() => { setInstitute(null); setSelectedStudent(null); setMode('institute') }}>
                ← All institutes
              </button>
              <span className="drill-sep">›</span>
              <span className="drill-crumb active">{institute.name ?? institute.id}</span>
            </div>

            <div className="inst-info-bar card-elevated" style={{ marginBottom: '1rem' }}>
              <div className="inst-info-icon">📊</div>
              <div>
                <div className="inst-info-name">Reports for {institute.name}</div>
                <div className="inst-info-meta">
                  {institute.institute_code && <span>Code: {institute.institute_code}</span>}
                  {studentsLoading ? <span> · Loading students…</span> : <span> · {students.length} student(s)</span>}
                </div>
              </div>
            </div>

            <div className="reports-mode-toggle" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button
                type="button"
                className={`btn ${mode === 'institute' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setMode('institute')
                  setSelectedStudent(null)
                }}
              >
                Full institute report
              </button>
              <button
                type="button"
                className={`btn ${mode === 'student' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMode('student')}
              >
                One student report
              </button>
            </div>

            <div className="card-elevated" style={{ padding: '1rem', marginBottom: '1rem' }}>
              <label className="att-month-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📅 Month</span>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="att-month-input" />
              </label>
            </div>

            {error && <div className="error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            {info && <div className="success" style={{ marginBottom: '0.75rem' }}>{info}</div>}

            {mode === 'institute' && (
              <div className="card-elevated" style={{ padding: '1.25rem' }}>
                <h3 className="section-heading" style={{ marginTop: 0 }}>
                  Institute attendance (all students)
                </h3>
                <p className="muted small">
                  One CSV file: <strong>summary</strong> (present / absent / other counts per student) and{' '}
                  <strong>detail</strong> (every attendance row in the month).
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || studentsLoading || !schema.attendanceTable}
                  onClick={() => void downloadInstituteReport()}
                >
                  {busy ? 'Working…' : '📥 Download institute CSV'}
                </button>
              </div>
            )}

            {mode === 'student' && (
              <div className="card-elevated" style={{ padding: '1rem' }}>
                <h3 className="section-heading" style={{ marginTop: 0 }}>
                  Select student
                </h3>
                <p className="muted small">Search by name, roll number, or class — then choose a student.</p>
                <div className="search-bar-row" style={{ marginBottom: '0.75rem' }}>
                  <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                      ref={studentSearchRef}
                      type="text"
                      placeholder="Search students…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="search-input"
                    />
                    {search && (
                      <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Clear">
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="search-count">
                    {filteredStudents.length} of {students.length}
                  </span>
                </div>
                {studentsError && <div className="error">{studentsError}</div>}
                {studentsLoading && (
                  <div className="loading-row">
                    <div className="loading-spinner" />
                    <span>Loading students…</span>
                  </div>
                )}
                {!studentsLoading && (
                  <div className="students-grid reports-student-scroll">
                    {filteredStudents.map((s) => {
                      const name = pick(s, 'name', 'student_name', 'full_name') ?? '—'
                      const roll = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno')
                      const sel = selectedStudent?.id === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className="student-card"
                          style={{
                            outline: sel ? '2px solid var(--gov-navy, #003087)' : undefined,
                          }}
                          onClick={() => setSelectedStudent(s)}
                        >
                          <div className="student-avatar">
                            <StudentDisplayPhoto student={s} displayName={name} size="sm" />
                          </div>
                          <div className="student-info">
                            <div className="student-name">{name}</div>
                            {roll && <div className="student-meta">Roll: {roll}</div>}
                          </div>
                          <div className="student-arrow">{sel ? '✓' : '›'}</div>
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !selectedStudent || !schema.attendanceTable}
                    onClick={() => void downloadStudentReport()}
                  >
                    {busy ? 'Working…' : '📥 Download student attendance CSV'}
                  </button>
                  {selectedStudent && (
                    <span className="muted small" style={{ marginLeft: '0.75rem' }}>
                      Selected:{' '}
                      <strong>{pick(selectedStudent, 'name', 'student_name', 'full_name') ?? selectedStudent.id}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
