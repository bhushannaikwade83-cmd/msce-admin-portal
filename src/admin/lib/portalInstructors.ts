import { getSupabase } from './supabase'
import { instituteRowMatchesPrefixes } from './portalDistricts'
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
  if (raw == null) return []
  if (typeof raw === 'string') {
    try {
      return parseRpcRows(JSON.parse(raw) as unknown)
    } catch {
      return []
    }
  }
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

function scopePortalInstructorRows(
  rows: PortalInstructorRow[],
  institutes: InstituteRow[],
  institutePrefixes: readonly string[],
): { rows: PortalInstructorRow[]; institutes: InstituteRow[] } {
  if (!institutePrefixes.length) return { rows, institutes }
  const scopedInstitutes = institutes.filter((i) =>
    instituteRowMatchesPrefixes(i, institutePrefixes),
  )
  const allowedIds = new Set(scopedInstitutes.map((i) => i.id))
  const allowedCodes = new Set(
    scopedInstitutes.map((i) => (i.institute_code ?? '').trim()).filter(Boolean),
  )
  const scopedRows = rows.filter((r) => {
    const uuid = (r.institute_uuid ?? '').trim()
    const code = (r.institute_code ?? r.institute_id ?? '').trim()
    if (uuid && allowedIds.has(uuid)) return true
    if (code && allowedCodes.has(code)) return true
    if (uuid && instituteRowMatchesPrefixes({ id: uuid, institute_code: code }, institutePrefixes)) {
      return true
    }
    return instituteRowMatchesPrefixes({ id: code || uuid, institute_code: code }, institutePrefixes)
  })
  return { rows: scopedRows, institutes: scopedInstitutes }
}

function institutesFromInstructorRows(rows: PortalInstructorRow[]): InstituteRow[] {
  const byId = new Map<string, InstituteRow>()
  for (const r of rows) {
    const id = (r.institute_uuid ?? r.institute_id ?? '').trim()
    if (!id || byId.has(id)) continue
    byId.set(id, {
      id,
      name: r.institute_name,
      institute_code: r.institute_code,
      is_active: r.institute_active,
    })
  }
  return [...byId.values()]
}

function mergeInstituteLists(a: InstituteRow[], b: InstituteRow[]): InstituteRow[] {
  const byId = new Map<string, InstituteRow>()
  for (const row of [...a, ...b]) {
    if (!row.id) continue
    byId.set(row.id, row)
  }
  return [...byId.values()]
}

export async function fetchAllPortalInstructors(options?: {
  institutePrefixes?: readonly string[]
}): Promise<{
  rows: PortalInstructorRow[]
  institutes: InstituteRow[]
  source: 'rpc' | 'direct'
  districtRpcLikelyUnpatched: boolean
}> {
  const prefixes = options?.institutePrefixes ?? []
  const isDistrictScope = prefixes.length > 0

  try {
    const rows = await fetchPortalInstructorsRpc()
    const institutesFromDb = await fetchAllPaged<InstituteRow>((from, to) =>
      getSupabase()
        .from('institutes')
        .select('id,name,institute_code,is_active')
        .order('institute_code', { ascending: true })
        .range(from, to),
    )
    const institutes = mergeInstituteLists(institutesFromDb, institutesFromInstructorRows(rows))
    const scoped = scopePortalInstructorRows(rows, institutes, prefixes)
    const districtRpcLikelyUnpatched =
      isDistrictScope && scoped.rows.length === 0 && scoped.institutes.length > 0
    return { ...scoped, source: 'rpc', districtRpcLikelyUnpatched }
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
    const scoped = scopePortalInstructorRows(instructors, institutes, prefixes)
    return {
      ...scoped,
      source: 'direct',
      districtRpcLikelyUnpatched: isDistrictScope && scoped.rows.length === 0,
    }
  }
}
