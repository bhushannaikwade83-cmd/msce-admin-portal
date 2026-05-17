import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '../lib/supabase'

type AdminProfileRow = {
  id: string
  email: string | null
  name: string | null
  role: string | null
  status: string | null
  institute_id: string | null
  institute_name: string | null
  phone_number: string | null
  created_at: string | null
}

type InstituteInviteRow = {
  id: string
  institute_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  claimed: boolean | null
  claimed_at: string | null
  created_at: string | null
}

type InstituteRow = {
  id: string
  name: string | null
  institute_code: string | null
  is_active: boolean | null
}

type RemainingInviteRow = InstituteInviteRow & {
  instituteLabel: string
  instituteCode: string | null
}

type AdminRow = {
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
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function normalizeStatus(status: string | null | undefined): string {
  const s = (status ?? '').trim().toLowerCase()
  return s || 'unknown'
}

function statusTone(status: string): string {
  if (status === 'active' || status === 'approved') return 'badge-present'
  if (status === 'pending') return 'badge-half'
  if (status === 'inactive' || status === 'disabled') return 'badge-absent'
  return 'badge-unknown'
}

function inviteTone(row: AdminRow): { label: string; className: string } {
  if (row.inviteClaimed) return { label: 'Password created', className: 'badge-present' }
  if (row.inviteEmail || row.inviteName || row.invitePhone) {
    return { label: 'Waiting in app', className: 'badge-half' }
  }
  return { label: 'No invite data', className: 'badge-unknown' }
}

function buildRows(
  profiles: AdminProfileRow[],
  invites: InstituteInviteRow[],
  institutes: InstituteRow[],
): AdminRow[] {
  const institutesById = new Map(institutes.map((r) => [r.id, r]))
  const profileByInstitute = new Map<string, AdminProfileRow[]>()
  for (const p of profiles) {
    const key = String(p.institute_id ?? '')
    if (!key) continue
    const list = profileByInstitute.get(key) ?? []
    list.push(p)
    profileByInstitute.set(key, list)
  }

  const out: AdminRow[] = []
  const inviteInstitutesCovered = new Set<string>()

  for (const [instituteId, list] of profileByInstitute.entries()) {
    const inst = institutesById.get(instituteId)
    const invite = invites.find((x) => x.institute_id === instituteId) ?? null
    if (invite) inviteInstitutesCovered.add(instituteId)
    for (const p of list) {
      out.push({
        id: p.id,
        instituteId,
        instituteName: p.institute_name?.trim() || inst?.name?.trim() || instituteId,
        instituteCode: inst?.institute_code ?? null,
        profileName: p.name ?? null,
        profileEmail: p.email ?? null,
        phoneNumber: p.phone_number ?? null,
        status: normalizeStatus(p.status),
        profileCreatedAt: p.created_at ?? null,
        inviteName: invite?.full_name ?? null,
        inviteEmail: invite?.email ?? null,
        invitePhone: invite?.phone ?? null,
        inviteClaimed: invite?.claimed === true,
        inviteClaimedAt: invite?.claimed_at ?? null,
        inviteCreatedAt: invite?.created_at ?? null,
        instituteActive: inst?.is_active ?? null,
      })
    }
  }

  for (const invite of invites) {
    if (inviteInstitutesCovered.has(invite.institute_id)) continue
    const inst = institutesById.get(invite.institute_id)
    out.push({
      id: `invite:${invite.id}`,
      instituteId: invite.institute_id,
      instituteName: inst?.name?.trim() || invite.institute_id,
      instituteCode: inst?.institute_code ?? null,
      profileName: null,
      profileEmail: null,
      phoneNumber: null,
      status: 'invite-only',
      profileCreatedAt: null,
      inviteName: invite.full_name ?? null,
      inviteEmail: invite.email ?? null,
      invitePhone: invite.phone ?? null,
      inviteClaimed: invite.claimed === true,
      inviteClaimedAt: invite.claimed_at ?? null,
      inviteCreatedAt: invite.created_at ?? null,
      instituteActive: inst?.is_active ?? null,
    })
  }

  return out.sort((a, b) => {
    const instCmp = a.instituteName.localeCompare(b.instituteName, undefined, { sensitivity: 'base' })
    if (instCmp !== 0) return instCmp
    return (a.profileEmail ?? a.inviteEmail ?? '').localeCompare(
      b.profileEmail ?? b.inviteEmail ?? '',
      undefined,
      { sensitivity: 'base' },
    )
  })
}

export function InstituteAdminsSection({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<AdminRow[]>([])
  const [remainingInvites, setRemainingInvites] = useState<RemainingInviteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'inactive'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const sb = getSupabase()
      const [profilesRes, invitesRes, institutesRes] = await Promise.all([
        sb
          .from('profiles')
          .select('id,email,name,role,status,institute_id,institute_name,phone_number,created_at')
          .eq('role', 'admin')
          .not('institute_id', 'is', null)
          .order('created_at', { ascending: false }),
        sb
          .from('admin_invites')
          .select('id,institute_id,full_name,phone,email,claimed,claimed_at,created_at')
          .order('created_at', { ascending: false }),
        sb
          .from('institutes')
          .select('id,name,institute_code,is_active')
          .order('name'),
      ])

      if (profilesRes.error) throw profilesRes.error
      if (invitesRes.error) throw invitesRes.error
      if (institutesRes.error) throw institutesRes.error

      const institutes = (institutesRes.data ?? []) as InstituteRow[]
      const institutesById = new Map(institutes.map((r) => [r.id, r]))
      const rawInvites = (invitesRes.data ?? []) as InstituteInviteRow[]

      const remaining: RemainingInviteRow[] = rawInvites
        .filter((inv) => inv.claimed !== true)
        .map((inv) => {
          const inst = institutesById.get(inv.institute_id)
          return {
            ...inv,
            instituteLabel: inst?.name?.trim() || inv.institute_id,
            instituteCode: inst?.institute_code ?? null,
          }
        })
        .sort((a, b) =>
          a.instituteLabel.localeCompare(b.instituteLabel, undefined, { sensitivity: 'base' }),
        )

      setRemainingInvites(remaining)

      const built = buildRows(
        (profilesRes.data ?? []) as AdminProfileRow[],
        rawInvites,
        institutes,
      )
      setRows(built)
    } catch (e) {
      setRows([])
      setRemainingInvites([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setAdminStatus(profileId: string, nextStatus: 'approved' | 'active' | 'inactive') {
    setBusyId(profileId)
    setError(null)
    setInfo(null)
    try {
      const sb = getSupabase()
      const patch: Record<string, string> = { status: nextStatus }
      const { error: updErr } = await sb.from('profiles').update(patch).eq('id', profileId)
      if (updErr) throw updErr
      setInfo(
        nextStatus === 'inactive'
          ? 'Institute admin access disabled. They cannot sign in until reactivated.'
          : 'Institute admin access updated successfully.',
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      const statusOk =
        statusFilter === 'all' ||
        (statusFilter === 'approved' && (row.status === 'approved' || row.status === 'active')) ||
        (statusFilter === 'pending' && row.status === 'pending') ||
        (statusFilter === 'inactive' && row.status === 'inactive')
      if (!statusOk) return false
      if (!q) return true
      return [
        row.instituteId,
        row.instituteName,
        row.instituteCode,
        row.profileName,
        row.profileEmail,
        row.phoneNumber,
        row.inviteName,
        row.inviteEmail,
        row.invitePhone,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [rows, query, statusFilter])

  const shell = embedded ? 'dash-section card-elevated' : 'card'

  return (
    <div className={shell}>
      <div className="card-head">
        <div>
          {embedded ? <span className="section-kicker">Admins & Access</span> : <h2>Institute admins</h2>}
          <p className="muted small">
            Real portal control for institute admin accounts. Passwords are never displayed here; use status control and onboarding state instead.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="card card-elevated" style={{ marginTop: '1rem' }}>
        <div className="card-head" style={{ paddingBottom: '0.5rem' }}>
          <div>
            <span className="section-kicker">Admin invites</span>
            <p className="muted small" style={{ marginTop: '0.35rem' }}>
              Institutes where an admin was invited in the app but has not finished creating their password yet (
              <code>admin_invites.claimed</code> is false). When they complete sign-up, they move to the table below.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Institute</th>
                <th>Invited admin</th>
                <th>Contact</th>
                <th>Invited</th>
              </tr>
            </thead>
            <tbody>
              {!remainingInvites.length && !loading ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No outstanding admin invites — every invite has been claimed in the app, or no invites exist yet.
                  </td>
                </tr>
              ) : (
                remainingInvites.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <div><strong>{inv.instituteLabel}</strong></div>
                      <div className="muted small">
                        ID <code>{inv.institute_id}</code>
                        {inv.instituteCode ? (
                          <>
                            {' '}
                            · Code <code>{inv.instituteCode}</code>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <strong>{inv.full_name?.trim() || '—'}</strong>
                    </td>
                    <td>
                      <div>{inv.email?.trim() || '—'}</div>
                      <div className="muted small">{inv.phone?.trim() || '—'}</div>
                    </td>
                    <td className="muted small">{fmtWhen(inv.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-elevated" style={{ marginTop: '1rem' }}>
        <div className="row" style={{ gap: '0.75rem', alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ minWidth: 260, flex: '1 1 260px' }}>
            <span className="small muted">Search institute / admin</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Institute ID, institute name, admin name, email..."
            />
          </label>
          <label style={{ minWidth: 180 }}>
            <span className="small muted">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="all">All statuses</option>
              <option value="approved">Approved / Active</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="success">{info}</p> : null}

        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>Institute</th>
                <th>Admin</th>
                <th>Access</th>
                <th>Onboarding</th>
                <th>Timeline</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filteredRows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="muted">No institute admins matched this filter.</td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const invite = inviteTone(row)
                  const canChange = !row.id.startsWith('invite:')
                  const isBusy = busyId === row.id
                  return (
                    <tr key={row.id}>
                      <td>
                        <div><strong>{row.instituteName}</strong></div>
                        <div className="muted small">
                          ID <code>{row.instituteId}</code>
                          {row.instituteCode ? <> · Code <code>{row.instituteCode}</code></> : null}
                        </div>
                        <div className="muted small">
                          Institute {row.instituteActive === false ? 'inactive' : 'active'}
                        </div>
                      </td>
                      <td>
                        <div><strong>{row.profileName ?? row.inviteName ?? '—'}</strong></div>
                        <div>{row.profileEmail ?? row.inviteEmail ?? '—'}</div>
                        <div className="muted small">{row.phoneNumber ?? row.invitePhone ?? '—'}</div>
                      </td>
                      <td>
                        <span className={`badge ${statusTone(row.status)}`}>
                          {row.status === 'invite-only' ? 'Invite only' : row.status}
                        </span>
                      </td>
                      <td>
                        <div className={`badge ${invite.className}`}>{invite.label}</div>
                        <div className="muted small">
                          Password is not shown in portal
                        </div>
                      </td>
                      <td>
                        <div className="small">Profile: {fmtWhen(row.profileCreatedAt)}</div>
                        <div className="small">Invite: {fmtWhen(row.inviteCreatedAt)}</div>
                        <div className="small">Claimed: {fmtWhen(row.inviteClaimedAt)}</div>
                      </td>
                      <td>
                        {canChange ? (
                          <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              disabled={isBusy || row.status === 'approved' || row.status === 'active'}
                              onClick={() => void setAdminStatus(row.id, 'approved')}
                            >
                              {isBusy ? 'Saving…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={isBusy || row.status === 'active'}
                              onClick={() => void setAdminStatus(row.id, 'active')}
                            >
                              Set Active
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={isBusy || row.status === 'inactive'}
                              onClick={() => void setAdminStatus(row.id, 'inactive')}
                            >
                              Disable
                            </button>
                          </div>
                        ) : (
                          <span className="muted small">Waiting for profile creation in app</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
