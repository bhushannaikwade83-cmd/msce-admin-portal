import { getSupabase } from './supabase'
import { fetchAllPaged } from './supabasePaged'

export type PortalInstructorRow = {
  id: string
  name: string | null
  email: string | null
  phone_number: string | null
  status: string | null
  institute_id: string | null
  created_at: string | null
  last_login: string | null
  has_pin: boolean
  pin_set_at: string | null
  institute_uuid: string | null
  institute_code: string | null
  institute_name: string | null
  institute_active: boolean | null
}

type InstituteRow = {
  id: string
  name: string | null
  institute_code: string | null
  is_active: boolean | null
}

function parseRpcRows(raw: unknown): PortalInstructorRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: String(row.id ?? ''),
      name: row.name != null ? String(row.name) : null,
      email: row.email != null ? String(row.email) : null,
      phone_number: row.phone_number != null ? String(row.phone_number) : null,
      status: row.status != null ? String(row.status) : null,
      institute_id: row.institute_id != null ? String(row.institute_id) : null,
      created_at: row.created_at != null ? String(row.created_at) : null,
      last_login: row.last_login != null ? String(row.last_login) : null,
      has_pin: row.has_pin === true,
      pin_set_at: row.pin_set_at != null ? String(row.pin_set_at) : null,
      institute_uuid: row.institute_uuid != null ? String(row.institute_uuid) : null,
      institute_code: row.institute_code != null ? String(row.institute_code) : null,
      institute_name: row.institute_name != null ? String(row.institute_name) : null,
      institute_active:
        row.institute_active === true || row.institute_active === false
          ? (row.institute_active as boolean)
          : null,
    }
  })
}

/** Preferred: single RPC (migration 075). */
export async function fetchPortalInstructorsRpc(): Promise<PortalInstructorRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('list_portal_instructors_all')
  if (error) throw error
  return parseRpcRows(data)
}

/** Fallback when RPC not deployed yet. */
export async function fetchPortalInstructorsDirect(): Promise<{
  institutes: InstituteRow[]
  instructors: PortalInstructorRow[]
}> {
  const sb = getSupabase()
  const institutes = await fetchAllPaged<InstituteRow>((from, to) =>
    sb
      .from('institutes')
      .select('id,name,institute_code,is_active')
      .order('institute_code', { ascending: true })
      .range(from, to),
  )

  type ProfileRow = {
    id: string
    name: string | null
    email: string | null
    phone_number: string | null
    status: string | null
    institute_id: string | null
    created_at: string | null
    last_login: string | null
    pin_hash: string | null
    has_pin: boolean | null
    pin_set_at: string | null
  }

  const profiles = await fetchAllPaged<ProfileRow>((from, to) =>
    sb
      .from('profiles')
      .select(
        'id,name,email,phone_number,status,institute_id,created_at,last_login,pin_hash,has_pin,pin_set_at',
      )
      .eq('role', 'attendance_user')
      .order('created_at', { ascending: false })
      .range(from, to),
  )

  const byId = new Map(institutes.map((i) => [i.id, i]))
  const byCode = new Map(
    institutes
      .filter((i) => (i.institute_code ?? '').trim() !== '')
      .map((i) => [String(i.institute_code).trim(), i]),
  )

  const instructors: PortalInstructorRow[] = []
  for (const p of profiles) {
    const key = (p.institute_id ?? '').trim()
    const inst = byId.get(key) ?? byCode.get(key)
    const pinOk =
      p.has_pin === true || (p.pin_hash != null && String(p.pin_hash).trim().length > 0)
    instructors.push({
      id: p.id,
      name: p.name,
      email: p.email,
      phone_number: p.phone_number,
      status: p.status,
      institute_id: p.institute_id,
      created_at: p.created_at,
      last_login: p.last_login,
      has_pin: pinOk,
      pin_set_at: p.pin_set_at,
      institute_uuid: inst?.id ?? (key || null),
      institute_code: (inst?.institute_code ?? key) || null,
      institute_name: inst?.name ?? null,
      institute_active: inst?.is_active ?? null,
    })
  }

  return { institutes, instructors }
}

export async function fetchAllPortalInstructors(): Promise<{
  rows: PortalInstructorRow[]
  institutes: InstituteRow[]
  source: 'rpc' | 'direct'
}> {
  try {
    const rows = await fetchPortalInstructorsRpc()
    const institutes = await fetchAllPaged<InstituteRow>((from, to) =>
      getSupabase()
        .from('institutes')
        .select('id,name,institute_code,is_active')
        .order('institute_code', { ascending: true })
        .range(from, to),
    )
    return { rows, institutes, source: 'rpc' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      !msg.includes('list_portal_instructors_all') &&
      !msg.includes('Could not find the function') &&
      !msg.includes('schema cache')
    ) {
      throw e
    }
    const { instructors, institutes } = await fetchPortalInstructorsDirect()
    return { rows: instructors, institutes, source: 'direct' }
  }
}
