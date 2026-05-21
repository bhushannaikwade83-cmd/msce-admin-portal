/**
 * Merge `attendance_in_out` rows for reports — aligned with Flutter `PdfExportService.mergeAttendanceInOutRowsByDate`.
 */
import { parseAnyTimestamp } from './attendancePresence'
import { parseDbJsonObject } from './parseDbJson'

function additional(row: Record<string, unknown>): Record<string, unknown> {
  return parseDbJsonObject(row.additional)
}

function statusFromRow(row: Record<string, unknown>): string {
  const st = additional(row).status
  if (st != null && String(st).trim() !== '') return String(st)
  return 'present'
}

function subjectFromRow(row: Record<string, unknown>): string | null {
  const s = additional(row).subject
  if (s == null) return null
  const t = String(s).trim()
  return t || null
}

function subjectMergeKey(row: Record<string, unknown>): string {
  const s = subjectFromRow(row)?.trim() ?? ''
  return s ? s.toLowerCase() : '__general__'
}

function subjectDisplayFromGroup(list: Record<string, unknown>[]): string {
  for (const r of list) {
    const s = subjectFromRow(r)?.trim() ?? ''
    if (s) return s
  }
  return 'General'
}

export type MergedAttendanceDay = {
  date: string
  status: string
  subject: string
  entryTime: Date | null
  exitTime: Date | null
  hours: number | null
  autoClosedMissingExit: boolean
  autoClosedNote: string | null
  attendanceReason: string | null
  creditedHoursNote: string | null
  reason?: string
}

function mergeInOutRowsForDateSubject(
  date: string,
  list: Record<string, unknown>[],
  subjectDisplay: string,
): MergedAttendanceDay {
  let entryTime: Date | null = null
  let exitTime: Date | null = null
  let status = 'absent'
  let hours: number | null = null
  let creditedHours: number | null = null
  let creditedHoursNote: string | null = null
  let autoClosedMissingExit = false
  let autoClosedNote: string | null = null
  let attendanceReason: string | null = null

  for (const data of list) {
    const add = additional(data)
    const et = parseAnyTimestamp(add.entryTime)
    const xt = parseAnyTimestamp(add.exitTime)
    if (et && (!entryTime || et < entryTime)) entryTime = et
    if (xt && (!exitTime || xt > exitTime)) exitTime = xt
  }

  for (const data of list) {
    const add = additional(data)
    const typ = String(data.type ?? '').toLowerCase()
    const st = statusFromRow(data)
    if (st === 'present') status = 'present'

    if (typ === 'exit' && data.credited_hours != null) {
      const db = Number(data.credited_hours) || 0
      if (db > 0) creditedHours = db
    }
    if (creditedHours == null && add.hours != null) {
      hours = Number(add.hours) || 0
    }
    if (creditedHoursNote == null && typ === 'exit' && data.hours_calculation_note != null) {
      const note = String(data.hours_calculation_note).trim()
      if (note) creditedHoursNote = note
    }
    if (add.autoClosedMissingExit === true) {
      autoClosedMissingExit = true
      const n = add.autoClosedNote != null ? String(add.autoClosedNote).trim() : ''
      if (n) autoClosedNote = n
    }
    const reasonText = add.attendanceReason != null ? String(add.attendanceReason).trim() : ''
    if (reasonText) attendanceReason = reasonText
  }

  for (const data of list) {
    const add = additional(data)
    const typ = String(data.type ?? '').toLowerCase()
    const created = parseAnyTimestamp(data.created_at)
    const etAdd = parseAnyTimestamp(add.entryTime)
    const xtAdd = parseAnyTimestamp(add.exitTime)

    if (typ === 'exit') {
      if (created && (!exitTime || created > exitTime)) exitTime = created
      if (xtAdd && (!exitTime || xtAdd > exitTime)) exitTime = xtAdd
    } else {
      if (created && (!entryTime || created < entryTime)) entryTime = created
      if (etAdd && (!entryTime || etAdd < entryTime)) entryTime = etAdd
    }
  }

  const typeEntry = list.some((d) => String(d.type ?? '').toLowerCase().trim() === 'entry')
  const hasEntrySignal = entryTime != null || typeEntry
  const credited = (creditedHours != null && creditedHours > 0) || (hours != null && hours > 0)
  if (hasEntrySignal || autoClosedMissingExit || credited || (exitTime != null && status === 'present')) {
    status = 'present'
  } else {
    status = 'absent'
  }

  return {
    date,
    status,
    subject: subjectDisplay,
    entryTime,
    exitTime,
    hours: creditedHours ?? hours,
    autoClosedMissingExit,
    autoClosedNote,
    attendanceReason,
    creditedHoursNote,
  }
}

/** One row per calendar day per subject bucket. */
export function mergeAttendanceInOutRowsByDate(rows: Record<string, unknown>[]): MergedAttendanceDay[] {
  if (rows.length === 0) return []
  const sep = '|'
  const byComposite = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const d = String(r.attendance_date ?? '').slice(0, 10)
    if (!d) continue
    const mk = subjectMergeKey(r)
    const key = `${d}${sep}${mk}`
    if (!byComposite.has(key)) byComposite.set(key, [])
    byComposite.get(key)!.push(r)
  }

  const sortedKeys = [...byComposite.keys()].sort((a, b) => {
    const ia = a.indexOf(sep)
    const ib = b.indexOf(sep)
    const da = a.substring(0, ia)
    const db = b.substring(0, ib)
    const byDate = da.localeCompare(db)
    if (byDate !== 0) return byDate
    const ka = a.substring(ia + sep.length)
    const kb = b.substring(ib + sep.length)
    if (ka === '__general__' && kb !== '__general__') return 1
    if (ka !== '__general__' && kb === '__general__') return -1
    return ka.localeCompare(kb)
  })

  const out: MergedAttendanceDay[] = []
  for (const key of sortedKeys) {
    const i = key.indexOf(sep)
    const date = key.substring(0, i)
    const list = byComposite.get(key)!
    out.push(mergeInOutRowsForDateSubject(date, list, subjectDisplayFromGroup(list)))
  }
  return out
}

/** Days where &lt;10% of students logged attendance (Flutter auto-holiday). */
export function autoDetectedHolidayDates(
  rows: Record<string, unknown>[],
  studentCount: number,
): Set<string> {
  const byDate = new Map<string, Set<string>>()
  for (const row of rows) {
    const date = String(row.attendance_date ?? '').slice(0, 10)
    const sid = String(row.student_id ?? '')
    if (!date || !sid) continue
    if (!byDate.has(date)) byDate.set(date, new Set())
    byDate.get(date)!.add(sid)
  }
  const holidays = new Set<string>()
  const denom = studentCount > 0 ? studentCount : 1
  for (const [date, sids] of byDate) {
    if ((sids.size / denom) * 100 < 10) holidays.add(date)
  }
  return holidays
}
