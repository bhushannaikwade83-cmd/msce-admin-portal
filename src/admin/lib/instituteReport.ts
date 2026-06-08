import { jsPDF } from 'jspdf'
import { downloadJsPdf, pdfAutoTable } from './pdfDownload'
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
  faceRegistered: boolean
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
    .select('id, user_id, sr_no, name, subjects, face_photo_url')
    .eq('institute_id', institute.id)
  if (stErr) throw stErr

  const allStudents = (studentsRaw ?? []) as Record<string, unknown>[]
  const studentIds = allStudents.map((s) => String(s.id))

  const rollByStudentId = new Map<string, string>()
  const nameByRoll = new Map<string, string>()
  const srNoByRoll = new Map<string, string>()
  const subjectCountByRoll = new Map<string, number>()
  const faceRegisteredByRoll = new Map<string, boolean>()

  for (const s of allStudents) {
    const sid = String(s.id)
    const roll = studentRollKey(s)
    if (!roll) continue
    rollByStudentId.set(sid, roll)
    nameByRoll.set(roll, String(s.name ?? 'Unknown'))
    srNoByRoll.set(roll, String(s.sr_no ?? roll))
    subjectCountByRoll.set(roll, subjectCount(s))
    const facePhotoUrl = String(s.face_photo_url ?? '').trim()
    faceRegisteredByRoll.set(roll, facePhotoUrl.length > 0)
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
  let totalFaceRegistered = 0

  for (const roll of sortedRolls) {
    const name = nameByRoll.get(roll) ?? 'Unknown'
    const present = presentCount.get(roll) ?? 0
    const hours = creditedHoursByRoll.get(roll) ?? 0
    const subjects = subjectCountByRoll.get(roll) ?? 1
    const absent = Math.max(0, Math.min(totalWorkingDays - present, totalWorkingDays))
    const totalDaysForStudent = present + absent
    const percent = totalDaysForStudent > 0 ? (present / totalDaysForStudent) * 100 : 0
    const { text, emoji } = statusFromPercent(percent)
    const faceRegistered = faceRegisteredByRoll.get(roll) ?? false

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
      faceRegistered,
    })

    totalAllHours += hours
    totalAllPresent += present
    totalAllAbsent += absent
    totalAllSubjects += subjects
    if (faceRegistered) totalFaceRegistered++
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
  const pageWidth = doc.internal.pageSize.getWidth()
  const centerX = pageWidth / 2
  const title = report.instituteName ?? 'Institute Attendance Report'

  // Add professional header with background
  doc.setFillColor(0, 48, 135)
  doc.rect(0, 0, pageWidth, 28, 'F')

  // Header text - white
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('MSCE', margin, 10)

  // Center heading
  doc.setFontSize(16)
  doc.text('MSCE INSTITUTE REPORT', centerX, 10, { align: 'center' })

  // Right side text
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('GOVERNMENT OF MAHARASHTRA', pageWidth - margin - 30, 8, { align: 'right', maxWidth: 30 })

  // Reset to black text
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('ATTENDANCE APP REPORT OF INSTITUTES', margin, 35)

  // Institute details
  doc.setFontSize(10)
  doc.text(`Institute: ${title}`, margin, 42)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Institute ID: ${report.instituteId}`, margin, 48)
  doc.text(`Date & Time: ${new Date().toLocaleString('en-IN')}`, margin, 53)
  doc.text(`Period: ${report.periodText}`, margin, 58)

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
    s.faceRegistered ? '✓ Yes' : '✗ No',
  ])

  const totalFaceReg = report.studentRecords.filter((s) => s.faceRegistered).length
  const totalNotReg = report.studentRecords.length - totalFaceReg

  body.push([
    '',
    'TOTAL',
    String(report.totals.totalSubjects),
    String(report.totals.totalPresent),
    String(report.totals.totalAbsent),
    String(report.totals.totalDays),
    report.totals.totalHours,
    `${report.totals.totalAttendancePercent.toFixed(1)}%`,
    `${totalFaceReg}/${report.studentRecords.length}`,
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

  pdfAutoTable(doc, {
    startY: 62,
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
        'Face Reg',
      ],
    ],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 48, 135],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [50, 50, 50],
    },
    alternateRowStyles: { fillColor: [237, 245, 255] },
    styles: {
      overflow: 'linebreak',
      cellWidth: 'wrap',
      cellPadding: 2,
    },
    columnStyles: {
      0: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
    },
  })

  downloadJsPdf(
    doc,
    instituteReportPdfFileName(report.instituteName, report.instituteId, report.startDate, report.endDate),
  )
}

/** District-wise report grouping institutes by their prefix */
export type DistrictInstituteGroup = {
  districtPrefix: string
  districtName: string
  institutes: Array<{
    instituteId: string
    instituteName: string | null
    students: InstituteReportStudentRecord[]
  }>
}

export type DistrictWiseReportResult = {
  startDate: Date
  endDate: Date
  periodText: string
  districtGroups: DistrictInstituteGroup[]
}

function getDistrictName(prefix: string): string {
  const districtMap: Record<string, string> = {
    '11': 'Mumbai', '14': 'Mumbai', '15': 'Mumbai',
    '21': 'Pune', '22': 'Pune', '23': 'Pune',
    '31': 'Nashik', '32': 'Nashik', '33': 'Nashik', '34': 'Nashik',
    '41': 'Kolhapur', '42': 'Kolhapur', '43': 'Kolhapur', '44': 'Kolhapur', '45': 'Kolhapur',
    '51': 'Sangli', '52': 'Sangli', '53': 'Sangli', '54': 'Sangli', '55': 'Sangli',
    '61': 'Amrawati', '62': 'Amrawati', '63': 'Amrawati', '64': 'Amrawati', '65': 'Amrawati',
    '71': 'Nagpur', '72': 'Nagpur', '73': 'Nagpur', '74': 'Nagpur', '75': 'Nagpur', '76': 'Nagpur',
    '81': 'Latur', '82': 'Latur', '83': 'Latur',
  }
  return districtMap[prefix] || `District ${prefix}`
}

export async function fetchDistrictWiseReport(
  institutes: Array<{ id: string; name?: string | null }>,
  startDate: Date,
  endDate: Date,
): Promise<DistrictWiseReportResult> {
  const groupMap = new Map<string, DistrictInstituteGroup>()

  for (const institute of institutes) {
    const prefix = institute.id.substring(0, 2)
    const districtName = getDistrictName(prefix)

    const report = await fetchInstituteReport(institute, startDate, endDate)

    if (!groupMap.has(prefix)) {
      groupMap.set(prefix, {
        districtPrefix: prefix,
        districtName,
        institutes: [],
      })
    }

    groupMap.get(prefix)!.institutes.push({
      instituteId: report.instituteId,
      instituteName: report.instituteName,
      students: report.studentRecords,
    })
  }

  const districtGroups = Array.from(groupMap.values()).sort(
    (a, b) => a.districtPrefix.localeCompare(b.districtPrefix),
  )

  for (const group of districtGroups) {
    group.institutes.sort((a, b) => a.instituteId.localeCompare(b.instituteId))
  }

  return {
    startDate: dateOnly(startDate),
    endDate: dateOnly(endDate),
    periodText: formatPeriod(dateOnly(startDate), dateOnly(endDate)),
    districtGroups,
  }
}

export function districtWiseReportPdfFileName(startDate: Date, endDate: Date): string {
  const from = toYmd(dateOnly(startDate)).replace(/-/g, '')
  const to = toYmd(dateOnly(endDate)).replace(/-/g, '')
  return `District_Wise_Report_${from}_${to}.pdf`
}

export function downloadDistrictWiseReportPdf(report: DistrictWiseReportResult): void {
  const doc = new jsPDF({ orientation: 'landscape' })
  const margin = 12
  const pageHeight = 190
  const pageWidth = doc.internal.pageSize.getWidth()
  const centerX = pageWidth / 2
  let currentY = 14

  // Add professional header with background
  doc.setFillColor(0, 48, 135)
  doc.rect(0, 0, pageWidth, 28, 'F')

  // Header text - white
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('MSCE', margin, 10)

  // Center heading
  doc.setFontSize(16)
  doc.text('MSCE INSTITUTE REPORT', centerX, 10, { align: 'center' })

  // Right side text
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('GOVERNMENT OF MAHARASHTRA', pageWidth - margin - 30, 8, { align: 'right', maxWidth: 30 })

  // Reset to black text
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('ATTENDANCE APP REPORT OF INSTITUTES', margin, 35)

  // Date and time on left
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Date & Time: ${new Date().toLocaleString('en-IN')}`, margin, 42)
  doc.text(`Period: ${report.periodText}`, margin, 48)
  currentY = 52

  for (const district of report.districtGroups) {
    if (currentY > pageHeight) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(11)
    doc.setTextColor(0, 48, 135)
    doc.text(`DISTRICT: ${district.districtName} (Prefix: ${district.districtPrefix})`, margin, currentY)
    doc.setTextColor(0, 0, 0)
    currentY += 6

    for (const institute of district.institutes) {
      if (currentY > pageHeight) {
        doc.addPage()
        currentY = 20
      }

      doc.setFontSize(9)
      doc.text(
        `Institute ${institute.instituteId}: ${institute.instituteName || 'Unknown'}`,
        margin + 4,
        currentY,
      )
      currentY += 5

      const body = institute.students.map((s, i) => [
        String(i + 1),
        s.name,
        String(s.subjects),
        String(s.present),
        String(s.absent),
        String(s.totalDays),
        s.totalHours,
        `${s.attendancePercent.toFixed(0)}%`,
        s.statusText,
        s.faceRegistered ? '✓' : '✗',
      ])

      if (body.length === 0) {
        doc.setFontSize(8)
        doc.text('No students', margin + 8, currentY)
        currentY += 4
        continue
      }

      const tableStartY = currentY
      pdfAutoTable(doc, {
        startY: tableStartY,
        margin: margin + 4,
        head: [
          ['Sr', 'Name', 'Subj', 'Pres', 'Abs', 'Days', 'Hrs', 'Att %', 'Status', 'Face'],
        ],
        body,
        theme: 'grid',
        headStyles: {
          fillColor: [0, 48, 135],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 7,
          textColor: [50, 50, 50],
        },
        alternateRowStyles: { fillColor: [237, 245, 255] },
        styles: {
          overflow: 'linebreak',
          cellWidth: 'wrap',
          cellPadding: 1.5,
        },
        columnStyles: {
          0: { halign: 'center' },
        },
      })

      currentY = (doc as any).lastAutoTable?.finalY + 6 || tableStartY + 30
    }

    currentY += 3
  }

  downloadJsPdf(doc, districtWiseReportPdfFileName(report.startDate, report.endDate))
}
