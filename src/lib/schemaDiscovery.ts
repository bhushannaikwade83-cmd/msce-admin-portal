/**
 * Probe Supabase for subject / attendance table names (same logic as Students section).
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
  attendanceTable: string | null
  discovered: boolean
}

async function tableExists(name: string): Promise<boolean> {
  try {
    const sb = getSupabase()
    const { error } = await sb.from(name).select('id').limit(1)
    if (error) {
      const code = (error as { code?: string }).code ?? ''
      if (code === 'PGRST200' || error.message?.includes('does not exist')) return false
    }
    return true
  } catch {
    return false
  }
}

export async function discoverSchema(): Promise<SchemaConfig> {
  let subjectTable: string | null = null
  let attendanceTable: string | null = null

  for (const name of SUBJECT_CANDIDATES) {
    if (await tableExists(name)) {
      subjectTable = name
      break
    }
  }

  for (const name of ATTENDANCE_CANDIDATES) {
    if (await tableExists(name)) {
      attendanceTable = name
      break
    }
  }

  return { subjectTable, attendanceTable, discovered: true }
}
