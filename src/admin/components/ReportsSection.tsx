/**
 * Reports — pick institute, then institute-wide or per-student attendance PDF.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { getSupabase } from '../lib/supabase'
import { fetchAllPaged } from '../lib/supabasePaged'
import { applyInstituteCodeFilter, flattenAttendanceInOutRow } from '../lib/attendanceInOut'
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

function getPhotoIn(r: AttendanceRecord): string {
  return String(r.in_photo_url ?? r['entry_photo'] ?? r['photo_in'] ?? '')
}

function getPhotoOut(r: AttendanceRecord): string {
  return String(r.out_photo_url ?? r['exit_photo'] ?? r['photo_out'] ?? '')
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
      } else if (attTable === 'attendance_in_out') {
        const ids = students.map((s) => s.id)
        if (ids.length === 0) {
          setError('No students in this institute — cannot load attendance by student id.')
          return
        }
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100)
          const part = await fetchAllPaged((rangeFrom, rangeTo) =>
            applyInstituteCodeFilter(
              sb.from(attTable).select('*').in('student_id', chunk),
              institute,
            )
              .gte('attendance_date', from)
              .lte('attendance_date', to)
              .order('attendance_date', { ascending: false })
              .range(rangeFrom, rangeTo),
          )
          raw = raw.concat(part)
        }
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
              .eq('institute_id', institute.id)
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
      const detailRows: string[][] = []
      const summary = new Map<
        string,
        { name: string; roll: string; present: number; absent: number; other: number }
      >()

      for (const row of raw) {
        const rec =
          attTable === 'teacher_attendance'
            ? flattenTeacherAttendanceRow(row)
            : attTable === 'attendance_in_out'
              ? (flattenAttendanceInOutRow(row) as AttendanceRecord)
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

      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 12

      // Header
      doc.setFontSize(16)
      doc.text('Institute Attendance Report', margin, 15)

      // Info section
      doc.setFontSize(10)
      doc.text(`Institute: ${instName}`, margin, 25)
      doc.text(`Institute Code: ${institute.institute_code || 'N/A'}`, margin, 31)
      doc.text(`Month: ${month}`, margin, 37)
      doc.text(`Total Students: ${summary.size}`, margin, 43)
      doc.text(`Total Records: ${detailRows.length}`, margin, 49)
      doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 55)

      // Summary Table
      doc.setFontSize(12)
      doc.text('Summary (Per Student)', margin, 65)

      const summaryTableData = summaryRows.map((row) => [
        row[3], // student_name
        row[4], // roll
        row[5], // present
        row[6], // absent
        row[8], // total
      ])

      ;(doc as any).autoTable({
        startY: 72,
        margin: margin,
        head: [['Student Name', 'Roll No', 'Present', 'Absent', 'Total']],
        body: summaryTableData,
        theme: 'grid',
        headStyles: {
          fillColor: [0, 48, 135],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 8,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
        },
        pageBreak: 'always',
      })

      // Detail Table (on new page)
      doc.setFontSize(12)
      doc.text('Detail Records', margin, 20)

      const detailTableData = detailRows.map((row) => [
        row[2], // date
        row[4], // student_name
        row[5], // status
        row[6], // in_time
        row[7], // out_time
      ])

      ;(doc as any).autoTable({
        startY: 28,
        margin: margin,
        head: [['Date', 'Student', 'Status', 'In Time', 'Out Time']],
        body: detailTableData,
        theme: 'grid',
        headStyles: {
          fillColor: [0, 48, 135],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 8,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles: {
          0: { halign: 'center' },
          1: { halign: 'left' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
        },
        didDrawPage: () => {
          // Footer
          const pageCount = (doc as any).internal.pages.length - 1
          const currentPage = doc.getCurrentPageInfo().pageNumber
          doc.setFontSize(8)
          doc.text(`Page ${currentPage} of ${pageCount}`, pageWidth - margin - 20, pageHeight - 8)
        },
      })

      // Download PDF
      doc.save(`report_institute_${safeFilePart(institute.institute_code ?? institute.id)}_${month}.pdf`)
      setInfo(`Downloaded ${detailRows.length} attendance record(s); ${summary.size} student(s) in summary.`)
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
      } else if (attTable === 'attendance_in_out') {
        raw = await fetchAllPaged((rangeFrom, rangeTo) =>
          applyInstituteCodeFilter(
            sb.from(attTable).select('*').eq('student_id', selectedStudent.id),
            institute,
          )
            .gte('attendance_date', from)
            .lte('attendance_date', to)
            .order('attendance_date', { ascending: false })
            .range(rangeFrom, rangeTo),
        )
      } else {
        raw = await fetchAllPaged((rangeFrom, rangeTo) =>
          sb
            .from(attTable)
            .select('*')
            .eq('student_id', selectedStudent.id)
            .eq('institute_id', institute.id)
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: false })
            .range(rangeFrom, rangeTo),
        )
      }

      const flat = raw.map((row) =>
        attTable === 'teacher_attendance'
          ? flattenTeacherAttendanceRow(row)
          : attTable === 'attendance_in_out'
            ? (flattenAttendanceInOutRow(row) as AttendanceRecord)
            : (row as AttendanceRecord),
      )
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

      // \ud83d\udcc4 Generate PDF Report
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 12

      // Header
      doc.setFontSize(16)
      doc.text('Attendance Report', margin, 15)

      // Info section
      doc.setFontSize(10)
      doc.text(`Institute: ${institute.name ?? institute.id}`, margin, 25)
      doc.text(`Institute ID: ${institute.id}`, margin, 31)
      doc.text(`Student: ${studentName}`, margin, 37)
      doc.text(`Student ID: ${selectedStudent.id}`, margin, 43)
      doc.text(`Month: ${month}`, margin, 49)
      doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 55)

      // Table
      const tableData = rows.map((row) => [
        row[0], // date
        row[1], // status
        row[2], // in_time
        row[3], // out_time
        row[4], // subject_id
      ])

      ;(doc as any).autoTable({
        startY: 62,
        margin: margin,
        head: [['Date', 'Status', 'In Time', 'Out Time', 'Subject']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [0, 48, 135],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10,
        },
        bodyStyles: {
          fontSize: 9,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'left' },
        },
        didDrawPage: () => {
          // Footer
          const pageCount = (doc as any).internal.pages.length - 1
          const currentPage = doc.getCurrentPageInfo().pageNumber
          doc.setFontSize(8)
          doc.text(`Page ${currentPage} of ${pageCount}`, pageWidth - margin - 20, pageHeight - 8)
        },
      })

      // Download PDF
      doc.save(`report_student_${safeFilePart(studentName)}_${month}.pdf`)
      setInfo(`Downloaded ${rows.length} attendance record(s) for ${studentName}.`)
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
            Choose an institute, set the report month, then download an institute-wide PDF (summary + detail) or a
            single-student monthly PDF. Data is read live from Supabase
            {schema.attendanceTable ? (
              <>
                {' '}
                (<code>{schema.attendanceTable}</code>)
              </>
            ) : null}
            . Open from <strong>Institutes → Report</strong> to pre-select an institute.
          </p>
        </div>
        <div className="card-head-actions">
          {institute && mode === 'institute' ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || studentsLoading || !schema.attendanceTable}
              onClick={() => void downloadInstituteReport()}
            >
              {busy ? 'Working…' : '📄 Institute PDF'}
            </button>
          ) : null}
          {institute && mode === 'student' && selectedStudent ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !schema.attendanceTable}
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
              Institute PDF includes a <strong>per-student summary</strong> (present / absent / other) and a{' '}
              <strong>detail</strong> section with every attendance row for <strong>{month}</strong>. Use{' '}
              <strong>Institute PDF</strong> in the header to download.
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
