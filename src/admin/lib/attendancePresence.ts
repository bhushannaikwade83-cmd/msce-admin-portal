/**
 * Port of Flutter `attendance_presence_rules.dart` — day-level present from `attendance_in_out` rows.
 */

function additional(row: Record<string, unknown>): Record<string, unknown> {
  const a = row.additional
  if (a !== null && typeof a === 'object' && !Array.isArray(a)) {
    return a as Record<string, unknown>
  }
  return {}
}

function isoHasTimezone(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  const up = t.toUpperCase()
  if (up.endsWith('Z')) return true
  if (/[+-]\d{2}:\d{2}$/.test(t)) return true
  if (/[+-]\d{4}$/.test(t)) return true
  return false
}

function looksDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

/** Parse timestamps from Supabase ISO strings (naive datetimes treated as UTC). */
export function parseAnyTimestamp(v: unknown): Date | null {
  if (v == null) return null
  if (v instanceof Date) return v
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null

  if (isoHasTimezone(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (looksDateOnly(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const norm = s.includes('T') ? s : s.replace(' ', 'T')
  const withZ = norm.endsWith('Z') || norm.endsWith('z') ? norm : `${norm}Z`
  const utc = new Date(withZ)
  if (!Number.isNaN(utc.getTime())) return utc

  const fallback = new Date(s)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

export function attendanceInOutRowHasEntry(row: Record<string, unknown>): boolean {
  const type = String(row.type ?? '')
    .toLowerCase()
    .trim()
  if (type === 'entry') return true
  const add = additional(row)
  return parseAnyTimestamp(add.entryTime) != null
}

export function attendanceInOutRowHasPresentCredit(row: Record<string, unknown>): boolean {
  const type = String(row.type ?? '')
    .toLowerCase()
    .trim()
  const add = additional(row)
  const st = String(add.status ?? '').toLowerCase()
  if (st === 'present') return true
  if (add.autoClosedMissingExit === true) return true
  const h = add.hours
  if (typeof h === 'number' && h > 0) return true
  if (
    type === 'exit' &&
    (parseAnyTimestamp(add.exitTime) != null || parseAnyTimestamp(add.entryTime) != null)
  ) {
    return st !== 'absent'
  }
  return false
}

/** Present if any row that day shows entry or credited time (any subject). */
export function studentDayPresentFromInOutRows(rowsForStudentOnDate: Record<string, unknown>[]): boolean {
  for (const row of rowsForStudentOnDate) {
    if (attendanceInOutRowHasEntry(row)) return true
    if (attendanceInOutRowHasPresentCredit(row)) return true
  }
  return false
}
