import { jsPDF } from 'jspdf'
import { applyInstituteCodeFilter, type InstituteCodeSource } from './attendanceInOut'
import {
  autoDetectedHolidayDates,
  mergeAttendanceInOutRowsByDate,
  type MergedAttendanceDay,
} from './attendanceInOutMerge'
import { calculateWorkingDays, formatCreditedHoursHMS } from './instituteReport'
import { downloadJsPdf, pdfAutoTable, pdfLastAutoTableFinalY } from './pdfDownload'
import { getSupabase } from './supabase'
import { fetchAllPaged } from './supabasePaged'

export type StudentReportResult = {
  instituteId: string
  instituteName: string | null
  studentId: string
  studentName: string
  srNo: string
  startDate: Date
  endDate: Date
  periodText: string
  totalDaysInRange: number
  presentCount: number
  absentCount: number
  attendancePercent: number
  periodCreditedHours: number
  dailyDetails: MergedAttendanceDay[]
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

function formatPdfDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(dt)
}

function formatPdfTime(dt: Date | null): string {
  if (!dt) return '-'
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(dt)
}

function formatHoursDuration(hours: number): string {
  const totalSeconds = Math.round(hours * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h}h ${m}m ${s}s`
}

function studentRollKey(s: Record<string, unknown>): string {
  const userId = String(s.user_id ?? '').trim()
  if (userId) return userId
  return String(s.sr_no ?? '').trim()
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

function capEndAtYesterday(endDate: Date): Date {
  const yesterday = dateOnly(new Date())
  yesterday.setDate(yesterday.getDate() - 1)
  const endDay = dateOnly(endDate)
  return endDay.getTime() > yesterday.getTime() ? yesterday : endDay
}

export function studentReportPdfFileName(
  studentName: string,
  srNo: string,
  startDate: Date,
  endDate: Date,
): string {
  const from = toYmd(dateOnly(startDate)).replace(/-/g, '')
  const to = toYmd(dateOnly(endDate)).replace(/-/g, '')
  const safe = (studentName || srNo).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48)
  return `Student_Report_${safe}_${from}_${to}.pdf`
}

export async function fetchStudentReport(
  institute: InstituteCodeSource & { name?: string | null },
  student: Record<string, unknown> & { id: string },
  startDate: Date,
  endDate: Date,
): Promise<StudentReportResult> {
  const sb = getSupabase()
  const start = dateOnly(startDate)
  let cappedEnd = capEndAtYesterday(endDate)
  if (cappedEnd.getTime() < start.getTime()) cappedEnd = start

  const startStr = toYmd(start)
  const endStr = toYmd(cappedEnd)
  const studentId = String(student.id)
  const studentName = String(student.name ?? 'Unknown')
  const srNo = studentRollKey(student) || studentId

  const { data: allStudentsRaw, error: stErr } = await sb
    .from('students')
    .select('id')
    .eq('institute_id', institute.id)
  if (stErr) throw stErr
  const allStudentIds = ((allStudentsRaw ?? []) as { id: string }[]).map((s) => String(s.id))

  let instituteRows: Record<string, unknown>[] = []
  if (allStudentIds.length > 0) {
    for (const chunk of chunkIds(allStudentIds, 100)) {
      const part = await fetchAllPaged((rangeFrom, rangeTo) =>
        applyInstituteCodeFilter(
          sb.from('attendance_in_out').select('student_id, attendance_date').in('student_id', chunk),
          institute,
        )
          .gte('attendance_date', startStr)
          .lte('attendance_date', endStr)
          .range(rangeFrom, rangeTo),
      )
      instituteRows = instituteRows.concat(part)
    }
  }

  const holidays = autoDetectedHolidayDates(instituteRows, allStudentIds.length)

  const studentRows = await fetchAllPaged((rangeFrom, rangeTo) =>
    applyInstituteCodeFilter(
      sb.from('attendance_in_out').select('*').eq('student_id', studentId),
      institute,
    )
      .gte('attendance_date', startStr)
      .lte('attendance_date', endStr)
      .order('attendance_date')
      .range(rangeFrom, rangeTo),
  )

  const merged = mergeAttendanceInOutRowsByDate(studentRows)
  const attendanceDates = new Set(merged.map((m) => m.date))

  const dailyDetails: MergedAttendanceDay[] = []
  let curr = new Date(start)
  while (curr.getTime() <= cappedEnd.getTime()) {
    const dateKey = toYmd(curr)
    if (attendanceDates.has(dateKey)) {
      for (const rec of merged.filter((m) => m.date === dateKey)) {
        dailyDetails.push(rec)
      }
    } else if (holidays.has(dateKey)) {
      dailyDetails.push({
        date: dateKey,
        status: 'holiday',
        subject: '—',
        entryTime: null,
        exitTime: null,
        hours: null,
        autoClosedMissingExit: false,
        autoClosedNote: null,
        attendanceReason: null,
        creditedHoursNote: null,
        reason: 'Auto-detected (< 10% attendance)',
      })
    } else {
      dailyDetails.push({
        date: dateKey,
        status: 'absent',
        subject: '-',
        entryTime: null,
        exitTime: null,
        hours: null,
        autoClosedMissingExit: false,
        autoClosedNote: null,
        attendanceReason: null,
        creditedHoursNote: null,
      })
    }
    curr = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() + 1)
  }

  dailyDetails.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    if (a.status === 'holiday' && b.status !== 'holiday') return 1
    if (a.status !== 'holiday' && b.status === 'holiday') return -1
    return a.subject.localeCompare(b.subject)
  })

  const totalDaysInRange = calculateWorkingDays(start, cappedEnd)
  let presentCount = 0
  for (const d of dailyDetails) {
    if (d.status === 'present') presentCount++
  }
  const absentCount = Math.max(0, totalDaysInRange - presentCount)
  const attendancePercent = totalDaysInRange > 0 ? (presentCount / totalDaysInRange) * 100 : 0

  let periodCreditedTotal = 0
  for (const rec of merged) {
    const h = rec.hours ?? 0
    if (h > 0) periodCreditedTotal += h
  }

  return {
    instituteId: institute.id,
    instituteName: institute.name ?? null,
    studentId,
    studentName,
    srNo,
    startDate: start,
    endDate: cappedEnd,
    periodText: formatPeriod(start, cappedEnd),
    totalDaysInRange,
    presentCount,
    absentCount,
    attendancePercent,
    periodCreditedHours: periodCreditedTotal,
    dailyDetails,
  }
}

function creditedCell(rec: MergedAttendanceDay): string {
  if (rec.status === 'holiday') return '—'
  if (rec.autoClosedMissingExit) {
    const h = rec.hours ?? 0
    const tail = h > 0 ? ` (${formatHoursDuration(h)} credited)` : ''
    const reason = rec.creditedHoursNote ?? rec.autoClosedNote ?? 'Student did not exit'
    return `${reason}${tail}`
  }
  const hc = rec.hours ?? 0
  if (hc > 0) {
    const hoursFormatted = formatHoursDuration(hc)
    const reason = rec.creditedHoursNote ?? ''
    return reason ? `${hoursFormatted} - ${reason}` : hoursFormatted
  }
  return '—'
}

function statusCell(rec: MergedAttendanceDay): string {
  if (rec.status === 'holiday') return 'Holiday'
  if (rec.status === 'absent') return 'Absent'
  if (rec.autoClosedMissingExit && rec.status === 'present') return 'Present (policy)'
  return rec.status === 'present' ? 'Present' : rec.status
}

/** PDF layout aligned with Flutter `PdfExportService.generateStudentReport`. */
export function downloadStudentReportPdf(report: StudentReportResult): void {
  const doc = new jsPDF()
  const margin = 12
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.text('Student Attendance Report', margin, 15)
  doc.setFontSize(10)
  doc.text(`Institute: ${report.instituteName ?? report.instituteId}`, margin, 24)
  doc.text(`Institute ID: ${report.instituteId}`, margin, 30)
  doc.text(`Student: ${report.studentName}`, margin, 36)
  doc.text(`Sr No: ${report.srNo}`, margin, 42)
  doc.text(`Period: ${report.periodText}`, margin, 48)
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 54)

  const statsY = 62
  const boxW = (pageWidth - margin * 2) / 5
  const stats = [
    ['Total days', String(report.totalDaysInRange)],
    ['Present', String(report.presentCount)],
    ['Absent', String(report.absentCount)],
    ['Attendance %', `${report.attendancePercent.toFixed(1)}%`],
    ['Credited hours', formatCreditedHoursHMS(report.periodCreditedHours)],
  ]
  stats.forEach(([label, val], i) => {
    const x = margin + i * boxW
    doc.setFontSize(14)
    doc.text(val, x + 2, statsY + 8)
    doc.setFontSize(8)
    doc.text(label, x + 2, statsY + 14)
  })

  const tableBody = report.dailyDetails.map((rec) => {
    let exitStr = '-'
    if (rec.exitTime) exitStr = formatPdfTime(rec.exitTime)
    else if (rec.autoClosedMissingExit) exitStr = 'No Exit'
    else if (rec.status === 'absent') exitStr = 'No Exit'
    else if (rec.status === 'holiday') exitStr = rec.reason ?? 'Holiday'

    return [
      formatPdfDateKey(rec.date),
      rec.status === 'holiday' ? '—' : rec.subject,
      rec.entryTime ? formatPdfTime(rec.entryTime) : '-',
      exitStr,
      creditedCell(rec),
      statusCell(rec),
    ]
  })

  pdfAutoTable(doc, {
    startY: 78,
    margin,
    head: [['Date', 'Subject', 'Entry Time', 'Exit Time', 'Credited Hours', 'Status']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [0, 48, 135], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  })

  const finalY = pdfLastAutoTableFinalY(doc) ?? 78
  pdfAutoTable(doc, {
    startY: finalY + 4,
    margin,
    body: [
      [
        'Total (period)',
        '—',
        '—',
        '—',
        formatCreditedHoursHMS(report.periodCreditedHours),
        `${report.presentCount} / ${report.dailyDetails.filter((d) => d.status === 'present').length} sessions`,
      ],
    ],
    theme: 'plain',
    bodyStyles: { fontStyle: 'bold', fontSize: 8 },
  })

  downloadJsPdf(
    doc,
    studentReportPdfFileName(report.studentName, report.srNo, report.startDate, report.endDate),
  )
}
