import { useCallback, useEffect, useState } from 'react'
import { applyInstituteCodeFilter, flattenAttendanceInOutRow } from '../lib/attendanceInOut'
import type { DayInOutMerge } from '../lib/photoCompare'
import { fetchAllPaged } from '../lib/supabasePaged'
import { getSupabase } from '../lib/supabase'
import { flattenTeacherAttendanceRow } from '../lib/teacherAttendancePayload'
import type { InstituteRow } from './InstituteList'
import { InstituteIntegrityPanel } from './InstituteIntegrityPanel'

type Student = Record<string, unknown> & { id: string }

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
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

type FlatAtt = {
  date?: string | null
  in_time?: string | null
  out_time?: string | null
  in_photo_url?: string | null
  out_photo_url?: string | null
}

function rowTimeKeyForInOut(
  dateYmd: string,
  flat: FlatAtt,
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

function mergeAttendanceInOutDayForStudent(dateYmd: string, rawRows: Record<string, unknown>[]): DayInOutMerge {
  let entryBest: { k: number; at: string | null; photo: string | null } | null = null
  let exitBest: { k: number; at: string | null; photo: string | null } | null = null

  for (const raw of rawRows) {
    const flat = flattenAttendanceInOutRow(raw) as FlatAtt
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

export function IntegrityInstituteLoader({
  institute,
  attendanceTables,
  onSelectStudent,
}: {
  institute: InstituteRow
  attendanceTables: string[]
  onSelectStudent?: (s: Student) => void
}) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dayAtt, setDayAtt] = useState<Record<string, DayInOutMerge>>({})
  const [attLoading, setAttLoading] = useState(false)
  const [attError, setAttError] = useState<string | null>(null)

  const showDayAttendance =
    attendanceTables.includes('attendance_in_out') || attendanceTables.includes('teacher_attendance')

  const loadStudents = useCallback(async () => {
    setLoading(true)
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
      setStudents(raw)
    } catch {
      setStudents([])
    } finally {
      setLoading(false)
    }
  }, [institute.id])

  useEffect(() => {
    void loadStudents()
  }, [loadStudents])

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
      onSelectStudent={onSelectStudent ?? (() => {})}
    />
  )
}
