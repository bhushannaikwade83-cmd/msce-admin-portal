import { getSupabase } from './supabase'
import { fetchAllPaged } from './supabasePaged'

export type PortalInstituteAdminInviteRow = {
  institute_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  claimed: boolean | null
}

function parseRpcRows(raw: unknown): PortalInstituteAdminInviteRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r) => {
    const row = r as Record<string, unknown>
    return {
      institute_id: String(row.institute_id ?? ''),
      full_name: row.full_name != null ? String(row.full_name) : null,
      phone: row.phone != null ? String(row.phone) : null,
      email: row.email != null ? String(row.email) : null,
      claimed: row.claimed === true,
    }
  })
}

function rowsToMap(rows: PortalInstituteAdminInviteRow[]): Record<string, PortalInstituteAdminInviteRow> {
  const map: Record<string, PortalInstituteAdminInviteRow> = {}
  for (const row of rows) {
    if (!row.institute_id) continue
    map[row.institute_id] = row
  }
  return map
}

/** Preferred: security-definer RPC (super admin + district viewers, scoped). */
export async function fetchPortalInstituteAdminInvitesRpc(): Promise<
  Record<string, PortalInstituteAdminInviteRow>
> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('list_portal_institute_admin_invites')
  if (error) throw error
  return rowsToMap(parseRpcRows(data))
}

/** Fallback when RPC not deployed (super admin only — RLS blocks district viewers). */
async function fetchPortalInstituteAdminInvitesDirect(): Promise<
  Record<string, PortalInstituteAdminInviteRow>
> {
  const sb = getSupabase()
  const rows = await fetchAllPaged<PortalInstituteAdminInviteRow>((rangeFrom, rangeTo) =>
    sb
      .from('admin_invites')
      .select('institute_id, full_name, phone, email, claimed')
      .order('institute_id', { ascending: true })
      .range(rangeFrom, rangeTo),
  )
  return rowsToMap(rows)
}

function isMissingRpcError(msg: string): boolean {
  return (
    msg.includes('list_portal_institute_admin_invites') ||
    msg.includes('Could not find the function') ||
    msg.includes('schema cache')
  )
}

export async function fetchPortalInstituteAdminInvites(): Promise<
  Record<string, PortalInstituteAdminInviteRow>
> {
  try {
    return await fetchPortalInstituteAdminInvitesRpc()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // On 500 / timeout / broken RPC, fall back to admin_invites table (RLS for district viewers).
    if (!isMissingRpcError(msg)) {
      try {
        return await fetchPortalInstituteAdminInvitesDirect()
      } catch {
        throw e
      }
    }
    return fetchPortalInstituteAdminInvitesDirect()
  }
}
