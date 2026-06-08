import { getSupabase } from './supabase'

/** Row from `list_institute_admin_onboarding_portal()` (migration 057). */
export type PortalOnboardingRow = {
  institute_id: string
  institute_name: string
  institute_code: string | null
  institute_active: boolean
  invite_id: string | null
  invite_full_name: string | null
  invite_phone: string | null
  invite_email: string | null
  invite_claimed: boolean
  invite_claimed_at: string | null
  invite_created_at: string | null
  profile_id: string | null
  profile_name: string | null
  profile_email: string | null
  profile_phone: string | null
  profile_status: string | null
  profile_created_at: string | null
  setup_complete: boolean
}

export type InviteDisplayRow = {
  id: string
  institute_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  claimed: boolean | null
  claimed_at: string | null
  created_at: string | null
  instituteLabel: string
  instituteCode: string | null
  profileName: string | null
  profileEmail: string | null
  profileStatus: string | null
  studentCount: number
}

export type AdminAccessRow = {
  id: string
  instituteId: string
  instituteName: string
  instituteCode: string | null
  profileName: string | null
  profileEmail: string | null
  phoneNumber: string | null
  status: string
  profileCreatedAt: string | null
  inviteName: string | null
  inviteEmail: string | null
  invitePhone: string | null
  inviteClaimed: boolean
  inviteClaimedAt: string | null
  inviteCreatedAt: string | null
  instituteActive: boolean | null
  setupComplete: boolean
}

function normalizeStatus(status: string | null | undefined): string {
  const s = (status ?? '').trim().toLowerCase()
  return s || 'unknown'
}

function portalToInviteDisplay(r: PortalOnboardingRow, studentCount: number = 0): InviteDisplayRow {
  return {
    id: r.invite_id ?? `profile:${r.profile_id ?? r.institute_id}`,
    institute_id: r.institute_id,
    full_name: r.invite_full_name ?? r.profile_name,
    phone: r.invite_phone ?? r.profile_phone,
    email: r.invite_email ?? r.profile_email,
    claimed: r.invite_claimed || r.setup_complete,
    claimed_at: r.invite_claimed_at,
    created_at: r.invite_created_at,
    instituteLabel: r.institute_name,
    instituteCode: r.institute_code,
    profileName: r.profile_name,
    profileEmail: r.profile_email,
    profileStatus: r.profile_status,
    studentCount,
  }
}

export async function splitPortalOnboardingRows(rows: PortalOnboardingRow[]): Promise<{
  pendingInvites: InviteDisplayRow[]
  completedInvites: InviteDisplayRow[]
  accessRows: AdminAccessRow[]
}> {
  // Fetch student counts from admin_invites table (auto-updated by triggers)
  const studentCountMap = new Map<string, number>()

  try {
    const sb = getSupabase()
    const { data: invites } = await sb
      .from('admin_invites')
      .select('institute_id, total_students')

    if (invites) {
      for (const inv of invites) {
        const record = inv as unknown as Record<string, unknown>
        const instId = record.institute_id as string | undefined
        const count = record.total_students as number | undefined
        if (instId && count !== undefined) {
          studentCountMap.set(instId, count)
        }
      }
    }
  } catch {
    // Silently fail — if fetch fails, just use 0
  }

  const pendingInvites: InviteDisplayRow[] = []
  const completedInvites: InviteDisplayRow[] = []
  const accessRows: AdminAccessRow[] = []

  for (const r of rows) {
    const completed = r.setup_complete || r.invite_claimed
    const hasInvite = r.invite_id != null
    const studentCount = studentCountMap.get(r.institute_id) ?? 0

    if (hasInvite && !completed) {
      pendingInvites.push(portalToInviteDisplay(r, studentCount))
    }
    if (completed && (hasInvite || r.profile_id)) {
      completedInvites.push(portalToInviteDisplay(r, studentCount))
    }

    if (r.profile_id) {
      accessRows.push({
        id: r.profile_id,
        instituteId: r.institute_id,
        instituteName: r.institute_name,
        instituteCode: r.institute_code,
        profileName: r.profile_name,
        profileEmail: r.profile_email,
        phoneNumber: r.profile_phone,
        status: normalizeStatus(r.profile_status),
        profileCreatedAt: r.profile_created_at,
        inviteName: r.invite_full_name,
        inviteEmail: r.invite_email,
        invitePhone: r.invite_phone,
        inviteClaimed: r.invite_claimed || r.setup_complete,
        inviteClaimedAt: r.invite_claimed_at,
        inviteCreatedAt: r.invite_created_at,
        instituteActive: r.institute_active,
        setupComplete: r.setup_complete,
      })
    }
  }

  const sortByInstitute = <T extends { instituteLabel?: string; instituteName?: string }>(
    a: T,
    b: T,
  ) => {
    const la = ('instituteLabel' in a ? a.instituteLabel : a.instituteName) ?? ''
    const lb = ('instituteLabel' in b ? b.instituteLabel : b.instituteName) ?? ''
    return String(la).localeCompare(String(lb), undefined, { sensitivity: 'base' })
  }

  pendingInvites.sort(sortByInstitute)
  completedInvites.sort(sortByInstitute)
  accessRows.sort((a, b) => a.instituteName.localeCompare(b.instituteName, undefined, { sensitivity: 'base' }))

  return { pendingInvites, completedInvites, accessRows }
}

export type PortalSessionInfo = {
  authenticated?: boolean
  user_id?: string
  email?: string | null
  profile_role?: string | null
  profile_status?: string | null
  institute_id?: string | null
  is_super_admin_fn?: boolean
  is_portal_district_viewer?: boolean
  portal_district_key?: string | null
  district_name?: string | null
  institute_prefixes?: string[] | null
  portal_mode?: 'super_admin' | 'district_viewer' | 'other' | 'anonymous' | null
  read_only?: boolean
  allowed_tabs?: string[] | null
  can_list_onboarding?: boolean
  message?: string
}

/** For gcctbcsupport@gmail.com / admin@gmail.com — fixes profiles.role in DB after portal login. */
export async function syncAllowlistedPortalSuperAdmin(): Promise<void> {
  const sb = getSupabase()
  const timeoutMs = 8_000
  await Promise.race([
    sb.rpc('sync_allowlisted_portal_super_admin'),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('sync timeout')), timeoutMs)
    }),
  ])
}

export async function fetchPortalSessionInfo(): Promise<PortalSessionInfo | null> {
  const sb = getSupabase()
  try {
    // Add 8-second timeout for RPC call
    const result = await Promise.race([
      sb.rpc('portal_session_info'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RPC timeout')), 8000),
      ),
    ])
    const { data, error } = result as any
    if (error) {
      console.warn('portal_session_info RPC failed, falling back to auth user:', error)
      return null
    }
    return (data ?? null) as PortalSessionInfo | null
  } catch (err) {
    console.warn('fetchPortalSessionInfo failed:', err)
    // Fallback: just return null and let context use cached data
    return null
  }
}

export type UpdatePendingInviteResult = {
  success: boolean
  message?: string
  institute_id?: string
  invite_id?: string
}

export async function updatePendingAdminInvite(params: {
  inviteId: string
  fullName: string
  email: string
  phone: string
}): Promise<UpdatePendingInviteResult> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('update_pending_admin_invite_portal', {
    p_invite_id: params.inviteId,
    p_full_name: params.fullName.trim(),
    p_email: params.email.trim().toLowerCase(),
    p_phone: params.phone.trim(),
  })
  if (error) throw new Error(error.message)
  const result = (data ?? {}) as UpdatePendingInviteResult
  if (!result.success) {
    throw new Error(result.message ?? 'Could not update invite')
  }
  return result
}

/** Super admin onboarding list, or district viewer instructors directory (read-only). */
export function canListPortalInstructors(info: PortalSessionInfo | null): boolean {
  if (!info?.authenticated) return false
  if (info.is_super_admin_fn || info.can_list_onboarding) return true
  return info.is_portal_district_viewer === true || info.portal_mode === 'district_viewer'
}

export function isEditablePendingInvite(inv: InviteDisplayRow): boolean {
  if (inv.claimed) return false
  if (inv.id.startsWith('profile:')) return false
  return /^[0-9a-f-]{36}$/i.test(inv.id)
}

export async function fetchPortalOnboardingRows(): Promise<PortalOnboardingRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('list_institute_admin_onboarding_portal')
  if (error) {
    const session = await fetchPortalSessionInfo()
    const detail = session?.message
      ? ` ${session.message}`
      : ''
    const who = session?.email
      ? ` Signed in as ${session.email} (role: ${session.profile_role ?? 'none'}).`
      : ''
    throw new Error(
      `${error.message}${detail}${who} Run migration 058_portal_onboarding_access_fix.sql in Supabase, then sign in with a portal super_admin account (not an institute admin).`,
    )
  }
  if (!Array.isArray(data)) return []
  return data.map((row) => row as PortalOnboardingRow)
}
