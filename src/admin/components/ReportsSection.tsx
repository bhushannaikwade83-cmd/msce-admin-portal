/**
 * Reports — pick institute, then institute-wide or per-student attendance PDF.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { fetchAllPaged } from '../lib/supabasePaged'
import { applyInstituteCodeFilter } from '../lib/attendanceInOut'
import { downloadInstituteReportPdf, fetchInstituteReport } from '../lib/instituteReport'
import { discoverSchema, type SchemaConfig } from '../lib/schemaDiscovery'
import { downloadStudentReportPdf, fetchStudentReport } from '../lib/studentReportPdf'
import type { InstituteRow } from './InstituteList'
import { StudentDisplayPhoto } from './StudentDisplayPhoto'

type Student = Record<string, unknown> & {
  id: string
  name?: string | null
}

type ReportMode = 'institute' | 'student'

const TABLE_PAGE_SIZE_DEFAULT = 50
const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const

function todayStatusBadge(status: string | undefined) {
  const s = (status ?? 'absent').toLowerCase()
  if (s === 'present') return <span className="badge badge-present">✓ Present</span>
  return <span className="badge badge-absent">✗ Absent</span>
}

function ReportsPager({
  page,
  pageCount,
  pageSize,
  totalRows,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageCount: number
  pageSize: number
  totalRows: number
  onPageChange: (next: number) => void
  onPageSizeChange: (size: number) => void
}) {
  if (totalRows <= 0) return null
  return (
    <div className="reports-panel-pager">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page <= 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
      >
        Previous
      </button>
      <span className="muted small reports-pager-meta">
        Page {page + 1} of {pageCount} ({totalRows.toLocaleString('en-IN')} rows)
      </span>
      <label className="reports-page-size">
        <span className="muted small">Per page</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value))
            onPageChange(0)
          }}
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
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
      >
        Next
      </button>
    </div>
  )
}

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return null
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

export function ReportsSection({
  embedded = false,
  jumpToInstituteId = null,
  onJumpToInstituteHandled,
}: {
  embedded?: boolean
  jumpToInstituteId?: string | null
  onJumpToInstituteHandled?: () => void
}) {
  const [schema, setSchema] = useState<SchemaConfig>({
    subjectTable: null,
    attendanceTable: null,
    attendanceTables: [],
    discovered: false,
  })
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [institute, setInstitute] = useState<InstituteRow | null>(null)
  const [mode, setMode] = useState<ReportMode>('institute')
  const [students, setStudents] = useState<Student[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState<string | null>(null)
  const [studentAttendance, setStudentAttendance] = useState<Map<string, { status: string; date: string }>>(new Map())
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
  const [instTablePage, setInstTablePage] = useState(0)
  const [instTablePageSize, setInstTablePageSize] = useState(TABLE_PAGE_SIZE_DEFAULT)
  const [studentTablePage, setStudentTablePage] = useState(0)
  const [studentTablePageSize, setStudentTablePageSize] = useState(TABLE_PAGE_SIZE_DEFAULT)
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

  const loadInstitutes = useCallback(async () => {
    setInstLoading(true)
    try {
      const sb = getSupabase()
      const raw = await fetchAllPaged<InstituteRow>((rangeFrom, rangeTo) =>
        sb.from('institutes').select('*').order('name').range(rangeFrom, rangeTo),
      )
      setInstitutes(raw as InstituteRow[])
    } catch {
      setInstitutes([])
    } finally {
      setInstLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInstitutes()
    setTimeout(() => searchRef.current?.focus(), 120)
  }, [loadInstitutes])

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
          setMode('institute')
          setSelectedStudent(null)
          setSearch('')
        }
      } finally {
        if (!cancelled) onJumpToInstituteHandled?.()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [jumpToInstituteId, onJumpToInstituteHandled])

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

      // 📊 Load today's attendance status for all students
      const today = new Date().toISOString().split('T')[0]
      const attMap = new Map<string, { status: string; date: string }>()

      if (data && data.length > 0) {
        try {
          const studentIds = (data as Student[]).map((s) => s.id)
          const attQuery = applyInstituteCodeFilter(
            sb.from('attendance_in_out').select('student_id, attendance_date, type, additional'),
            inst,
          )
          const { data: attData, error: attErr } = await attQuery
            .eq('attendance_date', today)
            .in('student_id', studentIds)

          if (!attErr && attData) {
            for (const rec of attData) {
              const add =
                rec.additional !== null && typeof rec.additional === 'object'
                  ? (rec.additional as Record<string, unknown>)
                  : {}
              const fromAdd = add.status != null ? String(add.status).toLowerCase() : ''
              const status =
                fromAdd ||
                (String(rec.type ?? '') === 'entry' || String(rec.type ?? '') === 'exit' ? 'present' : 'absent')
              attMap.set(String(rec.student_id), {
                status,
                date: String(rec.attendance_date ?? today),
              })
            }
          }
        } catch (attLoadErr) {
          console.warn('Failed to load attendance:', attLoadErr)
        }
      }

      setStudentAttendance(attMap)
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

  const handleRefresh = useCallback(() => {
    void runDiscovery()
    if (institute) void loadStudents(institute)
    else void loadInstitutes()
  }, [institute, loadInstitutes, loadStudents, runDiscovery])

  const filteredInst = useMemo(() => {
    const q = instSearch.trim().toLowerCase()
    if (!q) return institutes
    return institutes.filter((i) =>
      [i.name, i.institute_code, i.city, i.state, i.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [institutes, instSearch])

  const instTablePageCount = Math.max(1, Math.ceil(filteredInst.length / instTablePageSize))
  const safeInstTablePage = Math.min(instTablePage, instTablePageCount - 1)
  const paginatedInst = useMemo(() => {
    const start = safeInstTablePage * instTablePageSize
    return filteredInst.slice(start, start + instTablePageSize)
  }, [filteredInst, safeInstTablePage, instTablePageSize])

  useEffect(() => {
    setInstTablePage(0)
  }, [instSearch, instTablePageSize])

  useEffect(() => {
    if (instTablePage > instTablePageCount - 1) {
      setInstTablePage(Math.max(0, instTablePageCount - 1))
    }
  }, [instTablePage, instTablePageCount])

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (institute && s.institute_id && s.institute_id !== institute.id) return false
      const q = search.trim().toLowerCase()
      if (!q) return true
      const name = pick(s, 'name', 'student_name', 'full_name') ?? ''
      const roll = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') ?? ''
      const cls = pick(s, 'class_name', 'class', 'grade') ?? ''
      return [name, roll, cls].some((v) => v.toLowerCase().includes(q))
    })
  }, [students, institute, search])

  const studentTablePageCount = Math.max(1, Math.ceil(filteredStudents.length / studentTablePageSize))
  const safeStudentTablePage = Math.min(studentTablePage, studentTablePageCount - 1)
  const paginatedStudents = useMemo(() => {
    const start = safeStudentTablePage * studentTablePageSize
    return filteredStudents.slice(start, start + studentTablePageSize)
  }, [filteredStudents, safeStudentTablePage, studentTablePageSize])

  useEffect(() => {
    setStudentTablePage(0)
  }, [search, studentTablePageSize, institute?.id])

  useEffect(() => {
    if (studentTablePage > studentTablePageCount - 1) {
      setStudentTablePage(Math.max(0, studentTablePageCount - 1))
    }
  }, [studentTablePage, studentTablePageCount])

  const stats = useMemo(() => {
    let activeInst = 0
    for (const i of institutes) {
      if (i.is_active !== false) activeInst += 1
    }
    let presentToday = 0
    let absentToday = 0
    for (const v of studentAttendance.values()) {
      if (v.status === 'present') presentToday += 1
      else absentToday += 1
    }
    return {
      institutesTotal: institutes.length,
      institutesActive: activeInst,
      institutesShown: filteredInst.length,
      studentsTotal: students.length,
      presentToday,
      absentToday,
    }
  }, [institutes, filteredInst.length, students.length, studentAttendance])

  async function downloadInstituteReport() {
    if (!institute) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const { from, to } = monthRange(month)
      const [y, m, d] = from.split('-').map(Number)
      const start = new Date(y, (m ?? 1) - 1, d ?? 1)
      const [y2, m2, d2] = to.split('-').map(Number)
      const end = new Date(y2, (m2 ?? 1) - 1, d2 ?? 1)
      const report = await fetchInstituteReport(
        {
          id: institute.id,
          institute_code: institute.institute_code,
          name: institute.name,
        },
        start,
        end,
      )
      if (report.studentRecords.length === 0) {
        setError('No students with attendance data for this month.')
        return
      }
      downloadInstituteReportPdf(report)
      setInfo(
        `Downloaded institute PDF (${report.studentRecords.length} students, ${report.periodText}).`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function downloadStudentReport() {
    if (!institute || !selectedStudent) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const studentName =
        pick(selectedStudent, 'name', 'student_name', 'full_name') ?? selectedStudent.id
      const { from, to } = monthRange(month)
      const [y, m, d] = from.split('-').map(Number)
      const start = new Date(y, (m ?? 1) - 1, d ?? 1)
      const [y2, m2, d2] = to.split('-').map(Number)
      const end = new Date(y2, (m2 ?? 1) - 1, d2 ?? 1)
      const report = await fetchStudentReport(
        {
          id: institute.id,
          institute_code: institute.institute_code,
          name: institute.name,
        },
        selectedStudent,
        start,
        end,
      )
      downloadStudentReportPdf(report)
      setInfo(`Downloaded PDF for ${studentName} (${report.periodText}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const shell = embedded ? 'dash-section reports-page' : 'card reports-page'
  const selectedStudentName = selectedStudent
    ? pick(selectedStudent, 'name', 'student_name', 'full_name') ?? selectedStudent.id
    : null

  return (
    <div className={shell}>
      <div className="card-head reports-page-head">
        <div>
          {!embedded ? <h2>Reports</h2> : <span className="section-kicker">Attendance reports</span>}
          <p className="muted small reports-page-lead">
            Choose an institute, set the report month, then download PDFs using the same{' '}
            <code>attendance_in_out</code> logic as the MSCE app (tabular institute report or per-student daily
            detail). Open from <strong>Institutes → Report</strong> to pre-select an institute.
          </p>
        </div>
        <div className="card-head-actions">
          {institute && mode === 'institute' ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || studentsLoading}
              onClick={() => void downloadInstituteReport()}
            >
              {busy ? 'Working…' : '📄 Institute PDF'}
            </button>
          ) : null}
          {institute && mode === 'student' && selectedStudent ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void downloadStudentReport()}
            >
              {busy ? 'Working…' : '📄 Student PDF'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void handleRefresh()}
            disabled={instLoading || schemaLoading || studentsLoading}
          >
            {instLoading || schemaLoading || studentsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {schemaLoading ? (
        <div className="loading-row" style={{ marginBottom: '0.75rem' }}>
          <div className="loading-spinner" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Detecting attendance table…</span>
        </div>
      ) : !schema.attendanceTable ? (
        <div className="error" style={{ marginBottom: '0.75rem' }}>
          No attendance table found. Open <strong>Students &amp; Attendance</strong> to verify schema, or check Supabase.
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => void runDiscovery()}>
            ↻ Retry
          </button>
        </div>
      ) : null}

      <div className="reports-stat-grid">
        <div className="reports-stat-card">
          <span className="reports-stat-value">
            {instLoading ? '…' : stats.institutesTotal.toLocaleString('en-IN')}
          </span>
          <span className="reports-stat-label">Institutes</span>
        </div>
        <div className="reports-stat-card reports-stat-card--active">
          <span className="reports-stat-value">
            {instLoading ? '…' : stats.institutesActive.toLocaleString('en-IN')}
          </span>
          <span className="reports-stat-label">Active</span>
        </div>
        <div className="reports-stat-card reports-stat-card--info">
          <span className="reports-stat-value">
            {institute
              ? studentsLoading
                ? '…'
                : stats.studentsTotal.toLocaleString('en-IN')
              : instLoading
                ? '…'
                : stats.institutesShown.toLocaleString('en-IN')}
          </span>
          <span className="reports-stat-label">{institute ? 'Students' : 'Matching search'}</span>
        </div>
        <div className="reports-stat-card reports-stat-card--muted">
          <span className="reports-stat-value">
            {institute && !studentsLoading
              ? `${stats.presentToday.toLocaleString('en-IN')} / ${stats.absentToday.toLocaleString('en-IN')}`
              : '—'}
          </span>
          <span className="reports-stat-label">Present / absent today</span>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {!institute ? (
        <>
          <div className="search-bar-row reports-search-row">
            <div className="search-bar">
              <span className="search-icon">🔍</span>
              <input
                ref={searchRef}
                type="search"
                placeholder="Search institutes — name, code, city, state, id…"
                value={instSearch}
                onChange={(e) => {
                  setInstSearch(e.target.value)
                  setInstTablePage(0)
                }}
                className="search-input"
                aria-label="Filter institutes"
              />
              {instSearch ? (
                <button type="button" className="search-clear" onClick={() => setInstSearch('')} aria-label="Clear search">
                  ✕
                </button>
              ) : null}
            </div>
            <span className="search-count">
              {instLoading ? '…' : `${filteredInst.length} of ${institutes.length} shown`}
            </span>
          </div>

          {instLoading ? (
            <div className="loading-row">
              <div className="loading-spinner" />
              <span>Loading institutes…</span>
            </div>
          ) : null}

          <div className="table-wrap reports-table-wrap">
            <table className="table-dash-compact reports-directory-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {institutes.length === 0 && !instLoading ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No institutes found (or configure Supabase env first).
                    </td>
                  </tr>
                ) : filteredInst.length === 0 && !instLoading ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No institutes match “{instSearch}”. Clear the search to see all {institutes.length} row(s).
                    </td>
                  </tr>
                ) : (
                  paginatedInst.map((i) => (
                    <tr
                      key={i.id}
                      className={i.is_active === false ? 'reports-row-inactive' : undefined}
                      onClick={() => setInstitute(i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setInstitute(i)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                    >
                      <td className="reports-name-cell">
                        <strong>{i.name ?? '—'}</strong>
                      </td>
                      <td>{i.institute_code ?? '—'}</td>
                      <td>{i.city ?? '—'}</td>
                      <td>{i.state ?? '—'}</td>
                      <td>
                        {i.is_active === false ? (
                          <span className="badge badge-muted">Inactive</span>
                        ) : (
                          <span className="badge badge-present">Active</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ReportsPager
            page={safeInstTablePage}
            pageCount={instTablePageCount}
            pageSize={instTablePageSize}
            totalRows={filteredInst.length}
            onPageChange={setInstTablePage}
            onPageSizeChange={setInstTablePageSize}
          />
        </>
      ) : (
        <>
          <div className="reports-drill-bar">
            <button
              type="button"
              className="drill-back"
              onClick={() => {
                setInstitute(null)
                setSelectedStudent(null)
                setMode('institute')
                setError(null)
                setInfo(null)
              }}
            >
              ← All institutes
            </button>
            <span className="drill-sep">›</span>
            <span className="drill-crumb active">{institute.name ?? institute.id}</span>
          </div>

          <div className="reports-institute-banner">
            <span className="reports-institute-banner-icon">📊</span>
            <div>
              <div className="reports-institute-banner-title">{institute.name ?? institute.id}</div>
              <div className="reports-institute-banner-meta">
                {institute.institute_code ? <span>Code {institute.institute_code}</span> : null}
                {institute.city ? <span> · {institute.city}</span> : null}
                {studentsLoading ? (
                  <span> · Loading students…</span>
                ) : (
                  <span> · {students.length.toLocaleString('en-IN')} student(s)</span>
                )}
              </div>
            </div>
          </div>

          <div className="reports-toolbar">
            <div className="reports-mode-toggle">
              <button
                type="button"
                className={`btn btn-sm ${mode === 'institute' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setMode('institute')
                  setSelectedStudent(null)
                }}
              >
                Full institute
              </button>
              <button
                type="button"
                className={`btn btn-sm ${mode === 'student' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMode('student')}
              >
                One student
              </button>
            </div>
            <label className="reports-month-field">
              <span>Month</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="att-month-input"
                aria-label="Report month"
              />
            </label>
          </div>

          {mode === 'institute' ? (
            <p className="reports-institute-hint muted small">
              Institute PDF uses the same tabular report as the MSCE app (present / absent / hours / status per
              student) for <strong>{month}</strong>. Click <strong>Institute PDF</strong> in the header to download.
            </p>
          ) : null}

          {mode === 'student' ? (
            <>
              <div className="search-bar-row reports-search-row">
                <div className="search-bar">
                  <span className="search-icon">🔍</span>
                  <input
                    ref={studentSearchRef}
                    type="search"
                    placeholder="Search students — name, roll, class…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setStudentTablePage(0)
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
                <span className="search-count">
                  {studentsLoading ? '…' : `${filteredStudents.length} of ${students.length} shown`}
                </span>
              </div>
              {studentsError ? <p className="error">{studentsError}</p> : null}
              {studentsLoading ? (
                <div className="loading-row">
                  <div className="loading-spinner" />
                  <span>Loading students…</span>
                </div>
              ) : null}
              {!studentsLoading && students.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">👤</div>
                  <div className="empty-title">No students in this institute</div>
                  <div className="empty-sub">Add students first, then generate per-student reports.</div>
                </div>
              ) : null}
              {!studentsLoading && students.length > 0 ? (
                <>
                  <div className="table-wrap reports-table-wrap">
                    <table className="table-dash-compact reports-students-table">
                      <thead>
                        <tr>
                          <th aria-label="Photo" />
                          <th>Name</th>
                          <th>Roll</th>
                          <th>Class</th>
                          <th>Today</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="muted">
                              No students match “{search}”.
                            </td>
                          </tr>
                        ) : (
                          paginatedStudents.map((s) => {
                            const name = pick(s, 'name', 'student_name', 'full_name') ?? '—'
                            const roll = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') ?? '—'
                            const cls = pick(s, 'class_name', 'class', 'grade') ?? '—'
                            const sel = selectedStudent?.id === s.id
                            const attData = studentAttendance.get(s.id)
                            return (
                              <tr
                                key={s.id}
                                className={sel ? 'reports-row-selected' : undefined}
                                onClick={() => setSelectedStudent(s)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setSelectedStudent(s)
                                  }
                                }}
                                tabIndex={0}
                                role="button"
                              >
                                <td className="reports-photo-cell">
                                  <StudentDisplayPhoto student={s} displayName={name} size="sm" />
                                </td>
                                <td className="reports-name-cell">
                                  <strong>{name}</strong>
                                </td>
                                <td>{roll}</td>
                                <td>{cls}</td>
                                <td>{todayStatusBadge(attData?.status)}</td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <ReportsPager
                    page={safeStudentTablePage}
                    pageCount={studentTablePageCount}
                    pageSize={studentTablePageSize}
                    totalRows={filteredStudents.length}
                    onPageChange={setStudentTablePage}
                    onPageSizeChange={setStudentTablePageSize}
                  />
                  {selectedStudent ? (
                    <p className="muted small" style={{ marginTop: '0.75rem' }}>
                      Selected: <strong>{selectedStudentName}</strong> — use <strong>Student PDF</strong> in the header
                      to download the {month} report.
                    </p>
                  ) : (
                    <p className="muted small" style={{ marginTop: '0.75rem' }}>
                      Click a row to select a student, then download their monthly PDF from the header.
                    </p>
                  )}
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
