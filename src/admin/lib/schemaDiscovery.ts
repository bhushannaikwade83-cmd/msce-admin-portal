/**
 * Probe Supabase for subject / attendance table names (same logic as Students section).
 *
 * Note: the browser Network tab may show HTTP 404 for candidate tables that are not in your
 * database. That is expected; probes stop at “table missing” and do not break the app.
 */
import { getSupabase } from './supabase'

export const SUBJECT_CANDIDATES = [
  'institute_subjects',
  'subjects',
  'subject',
  'courses',
  'course',
  'classes',
  'student_subjects',
  'timetable',
  'modules',
]
export const ATTENDANCE_CANDIDATES = [
  'teacher_attendance',
  'attendance_in_out',
  'attendance_records',
  'attendance',
  'attendances',
  'student_attendance',
  'daily_attendance',
  'attendance_logs',
  'attendance_data',
]

export type SchemaConfig = {
  subjectTable: string | null
  /** First matching table (compatibility) — same as `attendanceTables[0]` */
  attendanceTable: string | null
  /** Every attendance table that exists, in probe order */
  attendanceTables: string[]
  discovered: boolean
}

/** PostgREST / Postgres signals that the relation is not exposed or does not exist. */
function isMissingTableError(error: {
  code?: string
  message?: string
}): boolean {
  const code = error.code ?? ''
  // PGRST205: table not in schema cache (unknown / typo table name).
  // PGRST200: invalid parameters referencing unknown relation (legacy clients).
  if (code === 'PGRST205' || code === 'PGRST200') return true
  const msg = (error.message ?? '').toLowerCase()
  if (msg.includes('does not exist')) return true
  if (msg.includes('could not find the table')) return true
  if (/relation\s+["']?[\w.]+\s+does\s+not\s+exist/.test(msg)) return true
  return false
}

async function tableExists(name: string): Promise<boolean> {
  try {
    const sb = getSupabase()
    const { error } = await sb.from(name).select('id').limit(1)
    if (error) {
      if (isMissingTableError(error)) return false
      // Other errors (RLS, network, wrong column): relation may still exist; avoid false negatives.
      return true
    }
    return true
  } catch {
    return false
  }
}

export async function discoverSchema(): Promise<SchemaConfig> {
  let subjectTable: string | null = null
  const attendanceTables: string[] = []

  for (const name of SUBJECT_CANDIDATES) {
    if (await tableExists(name)) {
      subjectTable = name
      break
    }
  }

  for (const name of ATTENDANCE_CANDIDATES) {
    if (await tableExists(name)) {
      attendanceTables.push(name)
    }
  }

  return {
    subjectTable,
    attendanceTable: attendanceTables[0] ?? null,
    attendanceTables,
    discovered: true,
  }
}
