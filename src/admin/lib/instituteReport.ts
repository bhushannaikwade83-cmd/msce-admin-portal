import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { applyInstituteCodeFilter, type InstituteCodeSource } from './attendanceInOut'
import { studentDayPresentFromInOutRows } from './attendancePresence'
import { getSupabase } from './supabase'
import { fetchAllPaged } from './supabasePaged'

export type InstituteReportStudentRecord = {
  roll: string
  srNo: string
  name: string
  subjects: number
  present: number
  absent: number
  totalDays: number
  totalHours: string
  attendancePercent: number
  statusText: string
  statusEmoji: string
}

export type InstituteReportResult = {
  instituteId: string
  instituteName: string | null
  startDate: Date
  endDate: Date
  totalWorkingDays: number
  studentRecords: InstituteReportStudentRecord[]
  totals: {
    totalDays: number
    totalSubjects: number
    totalPresent: number
    totalAbsent: number
    totalHours: string
    totalAttendancePercent: number
  }
  averages: {
    avgPresent: number
    avgAbsent: number
    avgHours: string
    avgAttendancePercent: number
  }
  periodText: string
}

export function formatCreditedHoursHMS(hours: number): string {
  if (hours < 0) return '—'
  if (hours === 0) return '0h 0m 0s'
  const totalSeconds = Math.round(hours * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function compareSrNo(a: string, b: string): number {
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatPeriod(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

/** Count calendar days in range; end date capped at yesterday (matches Flutter app). */
export function calculateWorkingDays(startDate: Date, endDate: Date): number {
  let curr = dateOnly(startDate)
  let end = dateOnly(endDate)
  const yesterday = dateOnly(new Date())
  yesterday.setDate(yesterday.getDate() - 1)
  if (end.getTime() > yesterday.getTime()) end = yesterday

  let days = 0
  while (curr.getTime() <= end.getTime()) {
    days++
    curr = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() + 1)
  }
  return days
}

function studentRollKey(s: Record<string, unknown>): string {
  const userId = String(s.user_id ?? '').trim()
  if (userId) return userId
  return String(s.sr_no ?? '').trim()
}

function subjectCount(s: Record<string, unknown>): number {
  const subjects = s.subjects
  if (Array.isArray(subjects)) return Math.min(Math.max(subjects.length, 1), 4)
  return 1
}

function statusFromPercent(pct: number): { text: string; emoji: string } {
  if (pct >= 100) return { text: 'Perfect', emoji: '✅' }
  if (pct >= 80) return { text: 'Good', emoji: '✅' }
  if (pct >= 70) return { text: 'Average', emoji: '⚠️' }
  return { text: 'Poor', emoji: '❌' }
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

export async function fetchInstituteReport(
  institute: InstituteCodeSource & { name?: string | null },
  startDate: Date,
  endDate: Date,
): Promise<InstituteReportResult> {
  const sb = getSupabase()
  const startStr = toYmd(dateOnly(startDate))
  const endStr = toYmd(dateOnly(endDate))

  const { data: studentsRaw, error: stErr } = await sb
    .from('students')
    .select('id, user_id, sr_no, name, subjects')
    .eq('institute_id', institute.id)
  if (stErr) throw stErr

  const allStudents = (studentsRaw ?? []) as Record<string, unknown>[]
  const studentIds = allStudents.map((s) => String(s.id))

  const rollByStudentId = new Map<string, string>()
  const nameByRoll = new Map<string, string>()
  const srNoByRoll = new Map<string, string>()
  const subjectCountByRoll = new Map<string, number>()

  for (const s of allStudents) {
    const sid = String(s.id)
    const roll = studentRollKey(s)
    if (!roll) continue
    rollByStudentId.set(sid, roll)
    nameByRoll.set(roll, String(s.name ?? 'Unknown'))
    srNoByRoll.set(roll, String(s.sr_no ?? roll))
    subjectCountByRoll.set(roll, subjectCount(s))
  }

  const presenceSelect = 'student_id, attendance_date, additional, type'
  const hoursSelect = 'student_id, credited_hours, type, attendance_date'

  let presenceRows: Record<string, unknown>[] = []
  let hoursRows: Record<string, unknown>[] = []

  if (studentIds.length > 0) {
    for (const chunk of chunkIds(studentIds, 100)) {
      const partPresence = await fetchAllPaged((rangeFrom, rangeTo) =>
        applyInstituteCodeFilter(
          sb.from('attendance_in_out').select(presenceSelect).in('student_id', chunk),
          institute,
        )
          .gte('attendance_date', startStr)
          .lte('attendance_date', endStr)
          .order('attendance_date')
          .range(rangeFrom, rangeTo),
      )
      presenceRows = presenceRows.concat(partPresence)

      const partHours = await fetchAllPaged((rangeFrom, rangeTo) =>
        applyInstituteCodeFilter(
          sb.from('attendance_in_out').select(hoursSelect).in('student_id', chunk).eq('type', 'exit'),
          institute,
        )
          .gte('attendance_date', startStr)
          .lte('attendance_date', endStr)
          .range(rangeFrom, rangeTo),
      )
      hoursRows = hoursRows.concat(partHours)
    }
  }

  const studentDateRows = new Map<string, Map<string, Record<string, unknown>[]>>()
  for (const row of presenceRows) {
    const sid = String(row.student_id ?? '')
    const roll = rollByStudentId.get(sid) ?? sid
    const date = String(row.attendance_date ?? '').slice(0, 10)
    if (!date) continue
    if (!studentDateRows.has(roll)) studentDateRows.set(roll, new Map())
    const byDate = studentDateRows.get(roll)!
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(row)
  }

  const presentCount = new Map<string, number>()
  for (const [roll, byDate] of studentDateRows) {
    let count = 0
    for (const dayRows of byDate.values()) {
      if (studentDayPresentFromInOutRows(dayRows)) count++
    }
    presentCount.set(roll, count)
  }

  const creditedHoursByRoll = new Map<string, number>()
  for (const row of hoursRows) {
    const sid = String(row.student_id ?? '')
    const roll = rollByStudentId.get(sid)
    if (!roll) continue
    const hrs = Number(row.credited_hours ?? 0) || 0
    creditedHoursByRoll.set(roll, (creditedHoursByRoll.get(roll) ?? 0) + hrs)
  }

  const totalWorkingDays = calculateWorkingDays(startDate, endDate)

  const sortedRolls = [...nameByRoll.keys()].sort((a, b) =>
    compareSrNo(srNoByRoll.get(a) ?? a, srNoByRoll.get(b) ?? b),
  )

  const studentRecords: InstituteReportStudentRecord[] = []
  let totalAllHours = 0
  let totalAllPresent = 0
  let totalAllAbsent = 0
  let totalAllSubjects = 0

  for (const roll of sortedRolls) {
    const name = nameByRoll.get(roll) ?? 'Unknown'
    const present = presentCount.get(roll) ?? 0
    const hours = creditedHoursByRoll.get(roll) ?? 0
    const subjects = subjectCountByRoll.get(roll) ?? 1
    const absent = Math.max(0, Math.min(totalWorkingDays - present, totalWorkingDays))
    const totalDaysForStudent = present + absent
    const percent = totalDaysForStudent > 0 ? (present / totalDaysForStudent) * 100 : 0
    const { text, emoji } = statusFromPercent(percent)

    studentRecords.push({
      roll,
      srNo: srNoByRoll.get(roll) ?? roll,
      name,
      subjects,
      present,
      absent,
      totalDays: totalDaysForStudent,
      totalHours: formatCreditedHoursHMS(hours),
      attendancePercent: percent,
      statusText: text,
      statusEmoji: emoji,
    })

    totalAllHours += hours
    totalAllPresent += present
    totalAllAbsent += absent
    totalAllSubjects += subjects
  }

  const totalDays = totalAllPresent + totalAllAbsent
  const totals = {
    totalDays,
    totalSubjects: totalAllSubjects,
    totalPresent: totalAllPresent,
    totalAbsent: totalAllAbsent,
    totalHours: formatCreditedHoursHMS(totalAllHours),
    totalAttendancePercent:
      totalAllPresent + totalAllAbsent > 0
        ? (totalAllPresent / (totalAllPresent + totalAllAbsent)) * 100
        : 0,
  }

  const averages = {
    avgPresent: studentRecords.length > 0 ? totalAllPresent / studentRecords.length : 0,
    avgAbsent: studentRecords.length > 0 ? totalAllAbsent / studentRecords.length : 0,
    avgHours: formatCreditedHoursHMS(
      studentRecords.length > 0 ? totalAllHours / studentRecords.length : 0,
    ),
    avgAttendancePercent: totals.totalAttendancePercent,
  }

  return {
    instituteId: institute.id,
    instituteName: institute.name ?? null,
    startDate: dateOnly(startDate),
    endDate: dateOnly(endDate),
    totalWorkingDays,
    studentRecords,
    totals,
    averages,
    periodText: formatPeriod(dateOnly(startDate), dateOnly(endDate)),
  }
}

export function instituteReportPdfFileName(
  instituteName: string | null,
  instituteId: string,
  startDate: Date,
  endDate: Date,
): string {
  const from = toYmd(dateOnly(startDate)).replace(/-/g, '')
  const to = toYmd(dateOnly(endDate)).replace(/-/g, '')
  const safeName = (instituteName ?? instituteId).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48)
  return `Institute_Report_${safeName}_${from}_${to}.pdf`
}

/** PDF tabular report — columns aligned with Flutter `InstituteReportTable`. */
export function downloadInstituteReportPdf(report: InstituteReportResult): void {
  const doc = new jsPDF({ orientation: 'landscape' })
  const margin = 12
  const title = report.instituteName ?? 'Institute Attendance Report'

  doc.setFontSize(16)
  doc.text('INSTITUTE ATTENDANCE REPORT', margin, 14)
  doc.setFontSize(10)
  doc.text(title, margin, 22)
  doc.text(`Institute ID: ${report.instituteId}`, margin, 28)
  doc.text(`Period: ${report.periodText}`, margin, 34)
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 40)

  const body = report.studentRecords.map((s, i) => [
    String(i + 1),
    s.name,
    String(s.subjects),
    String(s.present),
    String(s.absent),
    String(s.totalDays),
    s.totalHours,
    `${s.attendancePercent.toFixed(0)}% ${s.statusEmoji}`,
    s.statusText,
  ])

  body.push([
    '',
    'TOTAL',
    String(report.totals.totalSubjects),
    String(report.totals.totalPresent),
    String(report.totals.totalAbsent),
    String(report.totals.totalDays),
    report.totals.totalHours,
    `${report.totals.totalAttendancePercent.toFixed(1)}%`,
    '',
  ])

  body.push([
    '',
    'AVERAGE',
    '',
    report.averages.avgPresent.toFixed(2),
    report.averages.avgAbsent.toFixed(2),
    '',
    report.averages.avgHours,
    `${report.averages.avgAttendancePercent.toFixed(1)}%`,
    '',
  ])

  ;(doc as unknown as { autoTable: (opts: Record<string, unknown>) => void }).autoTable({
    startY: 46,
    margin,
    head: [
      [
        'Sr No',
        'Student Name',
        'Subjects',
        'Present',
        'Absent',
        'Total Days',
        'Total Hours',
        'Attendance %',
        'Status',
      ],
    ],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 48, 135],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { overflow: 'linebreak', cellWidth: 'wrap' },
  })

  doc.save(instituteReportPdfFileName(report.instituteName, report.instituteId, report.startDate, report.endDate))
}
