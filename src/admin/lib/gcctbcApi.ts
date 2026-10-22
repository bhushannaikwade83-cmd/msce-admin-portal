/**
 * Client for the GCC TBC / MSCE Exam Attendance App's own PHP + MySQL backend
 * (separate from Supabase — this is the new database the Flutter app writes to).
 *
 * Base URL: set VITE_GCCTBC_API_BASE in .env.local to override; defaults to
 * the production API so this works out of the box with no setup.
 */

const DEFAULT_API_BASE = 'https://digitrixmedia.com/MSCE_EXAM_APP/api'

function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_GCCTBC_API_BASE as string | undefined)?.trim()
  return (fromEnv || DEFAULT_API_BASE).replace(/\/$/, '')
}

async function getJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${apiBase()}/${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value)
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`${path} failed: HTTP ${res.status}`)
  }
  const data = await res.json()
  if (data?.ok !== true) {
    throw new Error(data?.message || `${path} failed`)
  }
  return data as T
}

export interface GccTbcCentre {
  id: string
  centre_code: string
  district_code: string | null
  centre_name: string | null
  district_name: string | null
  taluka_name: string | null
  address_line1: string | null
  pc_count: number | null
  capacity: number | null
  spare_capacity: number | null
  batch_capacity: number | null
  batch_change: number | null
  username: string | null
  login_latitude: number | null
  login_longitude: number | null
  login_at: string | null
  created_at: string
  updated_at: string
}

export interface GccTbcStudentRow {
  id: string
  student_id: string | null
  mscecd: string | null
  centre_id: string | null
  centre_code: string | null
  course: string | null
  seat_number: string | null
  exam_date: string | null
  start_time: string | null
  end_time: string | null
  batch_name: string | null
  student_name: string | null
  photo: string | null
  encrypted_id: string | null
  entry_photo_url: string | null
  entry_at: string | null
  entry_latitude: number | null
  entry_longitude: number | null
  is_marked: boolean
  is_enabled: boolean
}

export interface GccTbcDevice {
  device_id: string
  device_name: string | null
  latitude: number | null
  longitude: number | null
  first_login_at: string
  last_login_at: string
  login_count: number
}

export async function fetchGccTbcCentres(search = ''): Promise<GccTbcCentre[]> {
  const data = await getJson<{ centres: GccTbcCentre[] }>('list_centres.php', { search })
  return data.centres
}

export async function fetchGccTbcStudents(centreCode: string, search = ''): Promise<GccTbcStudentRow[]> {
  const data = await getJson<{ rows: GccTbcStudentRow[] }>('get_exam_students.php', {
    centre_code: centreCode,
    search,
  })
  return data.rows
}

export async function fetchGccTbcCentreDevices(centreCode: string): Promise<GccTbcDevice[]> {
  const data = await getJson<{ devices: GccTbcDevice[] }>('list_centre_devices.php', {
    centre_code: centreCode,
  })
  return data.devices
}
