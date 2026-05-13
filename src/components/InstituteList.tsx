import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'
import {
  downloadCsv,
  instituteDirectoryCsvRows,
  instituteStudentRosterRows,
} from '../lib/reportCsv'

function safeFilePart(s: string | null | undefined): string {
  const t = (s ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64)
  return t || 'export'
}

export type InstituteRow = {
  id: string
  institute_code: string | null
  name: string | null
  city: string | null
  /** Present after migration 011; omitted from API if column does not exist */
  pincode?: string | null
  state: string | null
  is_active: boolean | null
  /** GPS restriction — true = locked (app enforces geo-fence), false/null = unlocked */
  gps_locked?: boolean | null
}

/** One row in `gps_settings` (Flutter app source of truth). */
type GpsSettingsRow = {
  institute_id: string
  admin_id: string
  is_locked: boolean | null
}

type ProfileAdminRow = {
  id: string
  email: string | null
  name: string | null
  role: string | null
  institute_id: string | null
}

/** Merged view: each institute admin + optional gps_settings row */
type AdminGpsLine = {
  adminId: string
  label: string
  hasRow: boolean
  is_locked: boolean | null
}

function isInstituteAdminRole(role: string | null | undefined): boolean {
  const r = (role ?? '').toLowerCase()
  return r === 'admin' || r === 'super_admin'
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

function buildAdminGpsLines(
  instituteId: string,
  profiles: ProfileAdminRow[],
  gpsRows: GpsSettingsRow[],
): AdminGpsLine[] {
  const admins = profiles.filter(
    (p) => p.institute_id === instituteId && isInstituteAdminRole(p.role),
  )
  const gpsForInst = gpsRows.filter((g) => g.institute_id === instituteId)
  const lines: AdminGpsLine[] = []
  const coveredGps = new Set<string>()

  for (const p of admins) {
    const aid = String(p.id)
    const g = gpsForInst.find((x) => String(x.admin_id) === aid)
    if (g) coveredGps.add(String(g.admin_id))
    const label = (p.email?.trim() || p.name?.trim() || aid.slice(0, 8) + '…') as string
    lines.push({
      adminId: aid,
      label,
      hasRow: !!g,
      is_locked: g?.is_locked ?? null,
    })
  }

  for (const g of gpsForInst) {
    const aid = String(g.admin_id)
    if (coveredGps.has(aid)) continue
    lines.push({
      adminId: aid,
      label: aid.length > 12 ? `${aid.slice(0, 8)}…` : aid,
      hasRow: true,
      is_locked: g.is_locked,
    })
  }

  return lines.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

type Props = { reloadToken?: number; embedded?: boolean }

type AdminInviteRow = {
  institute_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  claimed: boolean | null
}

export function InstituteList({ reloadToken = 0, embedded = false }: Props) {
  const { user } = useAuth()
  const [rows, setRows] = useState<InstituteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [gpsColExists, setGpsColExists] = useState<boolean | null>(null) // null = unknown yet
  /** institute_id → each admin’s GPS row (profiles + gps_settings, RLS-scoped) */
  const [gpsAdminsByInstitute, setGpsAdminsByInstitute] = useState<Record<string, AdminGpsLine[]>>({})
  const [adminInvitesByInstitute, setAdminInvitesByInstitute] = useState<Record<string, AdminInviteRow | null>>({})
  const [reportBusyId, setReportBusyId] = useState<string | null>(null)

  function exportDirectoryCsv() {
    const { header, data } = instituteDirectoryCsvRows(rows)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`institutes_directory_${stamp}.csv`, header, data)
  }

  async function exportInstituteRosterCsv(inst: InstituteRow) {
    setError(null)
    setInfo(null)
    setReportBusyId(inst.id)
    try {
      const sb = getSupabase()
      const { data, error: qErr } = await sb
        .from('students')
        .select('*')
        .eq('institute_id', inst.id)
        .order('name')
      if (qErr) throw qErr
      const list = (data ?? []) as Record<string, unknown>[]
      const { header, data: csvRows } = instituteStudentRosterRows(inst, list)
      const code = safeFilePart(inst.institute_code ?? inst.id.slice(0, 8))
      const stamp = new Date().toISOString().slice(0, 10)
      downloadCsv(`institute_${code}_students_${stamp}.csv`, header, csvRows)
      setInfo(`Downloaded roster for ${list.length} student(s): ${inst.name ?? inst.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReportBusyId(null)
    }
  }

  const load = useCallback(async () => {
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const sb = getSupabase()
      // select('*') avoids 400 when `pincode` column is missing (migration 011 not applied yet).
      const { data, error: qErr } = await sb.from('institutes').select('*').order('name').limit(5000)
      if (qErr) throw qErr
      const fetched = (data ?? []) as InstituteRow[]
      setRows(fetched)
      const { data: inviteData } = await sb
        .from('admin_invites')
        .select('institute_id, full_name, phone, email, claimed')
      const inviteMap: Record<string, AdminInviteRow | null> = {}
      for (const row of (inviteData ?? []) as AdminInviteRow[]) {
        inviteMap[row.institute_id] = row
      }
      setAdminInvitesByInstitute(inviteMap)
      // Detect whether gps_locked column exists in this schema
      if (fetched.length > 0) {
        setGpsColExists('gps_locked' in fetched[0])
      }

      if (user?.id) {
        const instituteIds = fetched.map((r) => r.id)
        const chunks = chunkIds(instituteIds, 100)
        let allGps: GpsSettingsRow[] = []
        let allProfiles: ProfileAdminRow[] = []
        let gpsErrMsg: string | null = null
        let profErrMsg: string | null = null

        const gpsResults = await Promise.all(
          chunks.map((ch) =>
            ch.length
              ? sb.from('gps_settings').select('institute_id,admin_id,is_locked').in('institute_id', ch)
              : Promise.resolve({ data: [] as GpsSettingsRow[], error: null }),
          ),
        )
        for (const r of gpsResults) {
          if (r.error) {
            gpsErrMsg = r.error.message
            break
          }
          allGps = allGps.concat((r.data ?? []) as GpsSettingsRow[])
        }

        const profResults = await Promise.all(
          chunks.map((ch) =>
            ch.length
              ? sb
                  .from('profiles')
                  .select('id,email,name,role,institute_id')
                  .in('institute_id', ch)
              : Promise.resolve({ data: [] as ProfileAdminRow[], error: null }),
          ),
        )
        for (const r of profResults) {
          if (r.error) {
            profErrMsg = r.error.message
            break
          }
          allProfiles = allProfiles.concat((r.data ?? []) as ProfileAdminRow[])
        }

        if (gpsErrMsg) {
          setGpsAdminsByInstitute({})
          setError(gpsErrMsg)
        } else {
          if (profErrMsg) setError(profErrMsg)
          const map: Record<string, AdminGpsLine[]> = {}
          for (const inst of fetched) {
            map[inst.id] = buildAdminGpsLines(inst.id, allProfiles, allGps)
          }
          setGpsAdminsByInstitute(map)
        }
      } else {
        setGpsAdminsByInstitute({})
      }
    } catch (e) {
      setRows([])
      setGpsAdminsByInstitute({})
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    try {
      getSupabase()
    } catch {
      return
    }
    void load()
  }, [load, user, reloadToken])

  /** `gps_settings` row for (institute_id, admin_id); audit fields use the signed-in user. */
  async function toggleGpsForAdmin(instituteId: string, adminId: string, currentLocked: boolean) {
    if (!user?.id) return
    setError(null)
    setInfo(null)
    setBusyId(`gps_${instituteId}_${adminId}`)
    try {
      const sb = getSupabase()
      const now = new Date().toISOString()
      if (currentLocked) {
        const { error: uErr } = await sb
          .from('gps_settings')
          .update({
            is_locked: false,
            unlocked_at: now,
            unlocked_by: user.id,
            unlocked_by_email: user.email ?? null,
          })
          .eq('institute_id', instituteId)
          .eq('admin_id', adminId)
        if (uErr) throw uErr
        setInfo(`GPS unlocked 🔓 for admin at this institute.`)
      } else {
        const { error: uErr } = await sb
          .from('gps_settings')
          .update({
            is_locked: true,
            locked_at: now,
            locked_by: user.id,
          })
          .eq('institute_id', instituteId)
          .eq('admin_id', adminId)
        if (uErr) throw uErr
        setInfo(`GPS locked 🔒 for admin at this institute.`)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const shell = embedded ? 'dash-section card-elevated' : 'card'

  return (
    <div className={shell}>
      <div className="card-head">
        {!embedded ? <h2>Institutes</h2> : <span className="section-kicker">Directory</span>}
        <div className="card-head-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={exportDirectoryCsv}
            disabled={loading || rows.length === 0}
            title="Download all institutes as CSV"
          >
            📥 Directory CSV
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>
      <p className="muted small">
        Same <code>institutes</code> table as the Flutter app. If you still see fewer rows than in the Supabase
        table editor, apply the latest SQL migrations (see <code>supabase/migrations/010_...</code>) so RLS allows
        listing inactive institutes. <strong>{rows.length}</strong> row{rows.length === 1 ? '' : 's'} loaded.
        {user ? (
          <>
            {' '}
            While signed in, <strong>GPS</strong> lists each institute admin (from <code>profiles</code>) with their
            row in <code>gps_settings</code> (lock state), matching the Flutter app — not{' '}
            <code>institutes.gps_locked</code>. Rows you see follow RLS (e.g. peers in your institute, or all if you
            have elevated access).
          </>
        ) : null}
      </p>
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {!embedded ? <h3 className="h3">Directory</h3> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>ID</th>
              <th>City</th>
              <th>Pincode</th>
              <th>State</th>
              <th>Admin setup</th>
              <th>Active</th>
              <th>GPS{user ? ' (per admin)' : ''}</th>
              {user ? (
                <>
                  <th>Report</th>
                  <th>Actions</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={user ? 11 : 9} className="muted">
                  No rows (or configure Supabase env first).
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const lines = user ? (gpsAdminsByInstitute[r.id] ?? []) : []
                const isGpsLockedLegacy = r.gps_locked === true
                const invite = adminInvitesByInstitute[r.id]
                return (
                  <tr key={r.id}>
                    <td>{r.name ?? '—'}</td>
                    <td>{r.institute_code ?? '—'}</td>
                    <td>
                      <code className="tiny">{r.id}</code>
                    </td>
                    <td>{r.city ?? '—'}</td>
                    <td>{r.pincode ?? '—'}</td>
                    <td>{r.state ?? '—'}</td>
                    <td>
                      {invite ? (
                        <div className="small">
                          <div><strong>{invite.full_name ?? '—'}</strong></div>
                          <div>{invite.phone ?? '—'}</div>
                          <div>{invite.email ?? '—'}</div>
                          <div className="muted">{invite.claimed ? 'Password created' : 'Waiting in app'}</div>
                        </div>
                      ) : (
                        <span className="badge badge-muted">Not added</span>
                      )}
                    </td>
                    <td>{r.is_active !== false ? <span className="badge ok">Yes</span> : <span className="badge">No</span>}</td>
                    <td>
                      {user ? (
                        lines.length === 0 ? (
                          <span
                            className="badge badge-muted"
                            title="No admin profiles or GPS rows visible for this institute (RLS or none registered)."
                          >
                            —
                          </span>
                        ) : (
                          <ul className="gps-admin-stack">
                            {lines.map((line) => {
                              const gpsBusy = busyId === `gps_${r.id}_${line.adminId}`
                              const locked = line.is_locked === true
                              return (
                                <li key={line.adminId}>
                                  <div className="gps-admin-line">
                                    <span className="gps-admin-label" title={line.label}>
                                      {line.label}
                                    </span>
                                    {line.hasRow ? (
                                      <span className={`gps-badge ${locked ? 'gps-locked' : 'gps-unlocked'}`}>
                                        {locked ? '🔒 Locked' : '🔓 Open'}
                                      </span>
                                    ) : (
                                      <span
                                        className="badge badge-muted"
                                        title="No gps_settings row yet — save location once in the MSCE Attendance app."
                                      >
                                        Not set
                                      </span>
                                    )}
                                    {line.hasRow ? (
                                      <button
                                        type="button"
                                        className={`btn btn-sm ${locked ? 'btn-gps-unlock' : 'btn-gps-lock'}`}
                                        disabled={busyId !== null}
                                        title={
                                          locked
                                            ? 'Unlock GPS for this admin (same row as the mobile app)'
                                            : 'Lock GPS for this admin'
                                        }
                                        onClick={() => void toggleGpsForAdmin(r.id, line.adminId, locked)}
                                      >
                                        {gpsBusy ? '…' : locked ? 'Unlock' : 'Lock'}
                                      </button>
                                    ) : null}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        )
                      ) : gpsColExists === false ? (
                        <span className="badge badge-muted" title="Column gps_locked not in DB yet">
                          —
                        </span>
                      ) : (
                        <span className={`gps-badge ${isGpsLockedLegacy ? 'gps-locked' : 'gps-unlocked'}`}>
                          {isGpsLockedLegacy ? '🔒 Locked' : '🔓 Open'}
                        </span>
                      )}
                    </td>
                    {user ? (
                      <>
                        <td className="actions-cell">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={reportBusyId !== null}
                            title="Download student roster CSV for this institute"
                            onClick={() => void exportInstituteRosterCsv(r)}
                          >
                            {reportBusyId === r.id ? '…' : '📄 Roster'}
                          </button>
                        </td>
                        <td className="actions-cell" />
                      </>
                    ) : null}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
