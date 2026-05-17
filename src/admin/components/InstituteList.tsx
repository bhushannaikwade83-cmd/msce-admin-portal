import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
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

type Props = {
  reloadToken?: number
  embedded?: boolean
  onOpenStudents?: (inst: InstituteRow) => void
  onOpenReports?: (inst: InstituteRow) => void
  onAddInstitute?: () => void
}

type InstituteEditForm = {
  name: string
  institute_code: string
  location: string
  address: string
  city: string
  district: string
  taluka: string
  pincode: string
  state: string
  country: string
  mobile_no: string
  is_active: boolean
}

function InstituteEditDialog({
  institute,
  onClose,
  onSaved,
}: {
  institute: InstituteRow
  onClose: () => void
  onSaved: () => void
}) {
  const row = institute as Record<string, unknown>
  const pickR = (...keys: string[]): string =>
    keys.map((k) => row[k]).find((v) => v !== null && v !== undefined && String(v) !== '')?.toString() ?? ''

  const [form, setForm] = useState<InstituteEditForm>(() => ({
    name: institute.name ?? '',
    institute_code: institute.institute_code ?? '',
    location: pickR('location'),
    address: pickR('address'),
    city: institute.city ?? '',
    district: pickR('district'),
    taluka: pickR('taluka'),
    pincode: (institute.pincode ?? '').toString(),
    state: institute.state ?? '',
    country: pickR('country') || 'India',
    mobile_no: pickR('mobile_no'),
    is_active: institute.is_active !== false,
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setForm({
      name: institute.name ?? '',
      institute_code: institute.institute_code ?? '',
      location: pickR('location'),
      address: pickR('address'),
      city: institute.city ?? '',
      district: pickR('district'),
      taluka: pickR('taluka'),
      pincode: (institute.pincode ?? '').toString(),
      state: institute.state ?? '',
      country: pickR('country') || 'India',
      mobile_no: pickR('mobile_no'),
      is_active: institute.is_active !== false,
    })
  }, [institute])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    const name = form.name.trim()
    if (!name) {
      setErr('Name is required.')
      return
    }
    setBusy(true)
    try {
      const sb = getSupabase()
      const pin = form.pincode.replace(/\D/g, '').slice(0, 6)
      const { error: uErr } = await sb
        .from('institutes')
        .update({
          name,
          institute_code: form.institute_code.trim() || null,
          location: form.location.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          district: form.district.trim() || null,
          taluka: form.taluka.trim() || null,
          state: form.state.trim() || null,
          country: form.country.trim() || 'India',
          mobile_no: form.mobile_no.trim() || null,
          pincode: pin.length === 6 ? pin : null,
          is_active: form.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', institute.id)
      if (uErr) throw uErr
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal aria-labelledby="inst-edit-title">
      <div className="modal-panel card-elevated">
        <div className="modal-head">
          <h2 id="inst-edit-title" style={{ margin: 0, fontSize: '1.05rem' }}>
            Edit institute
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted small" style={{ margin: '0.5rem 0 1rem' }}>
          Institute ID <code>{institute.id}</code> — updates are saved to the database immediately.
        </p>
        {err ? <p className="error">{err}</p> : null}
        <form className="form-grid" onSubmit={(e) => void onSubmit(e)}>
          <label className="span-2">
            Name <span className="req">*</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <label>
            Institute code
            <input
              value={form.institute_code}
              onChange={(e) => setForm((f) => ({ ...f, institute_code: e.target.value }))}
            />
          </label>
          <label>
            Mobile
            <input
              value={form.mobile_no}
              onChange={(e) => setForm((f) => ({ ...f, mobile_no: e.target.value }))}
            />
          </label>
          <label className="span-2">
            Address
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </label>
          <label>
            City
            <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </label>
          <label>
            Pincode
            <input
              inputMode="numeric"
              maxLength={6}
              value={form.pincode}
              onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
            />
          </label>
          <label>
            District
            <input value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} />
          </label>
          <label>
            Taluka
            <input value={form.taluka} onChange={(e) => setForm((f) => ({ ...f, taluka: e.target.value }))} />
          </label>
          <label>
            State
            <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
          </label>
          <label>
            Country
            <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
          </label>
          <label className="span-2">
            Location (short)
            <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          </label>
          <label className="inline span-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Institute is active (visible in app listings when your RLS allows)
          </label>
          <div className="span-2" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save to database'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type AdminInviteRow = {
  institute_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  claimed: boolean | null
}

export function InstituteList({
  reloadToken = 0,
  embedded = false,
  onOpenStudents,
  onOpenReports,
  onAddInstitute,
}: Props) {
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
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<InstituteRow | null>(null)

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.name, r.institute_code, r.id, r.city, r.state, r.pincode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [rows, search])

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
          {onAddInstitute ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onAddInstitute} title="Open add institute form">
              ➕ New institute
            </button>
          ) : null}
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
      <div className="search-bar-row" style={{ marginBottom: '0.75rem' }}>
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search institutes — name, code, city, state, id…"
            className="search-input"
            aria-label="Filter institutes"
          />
          {search ? (
            <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              ✕
            </button>
          ) : null}
        </div>
        <span className="search-count">
          {loading ? '…' : `${filteredRows.length} of ${rows.length} shown`}
        </span>
      </div>
      <p className="muted small">
        Listing is live from Supabase <code>institutes</code>. Use <strong>Edit</strong> to update a row; use{' '}
        <strong>Students</strong> / <strong>Reports</strong> for the same tools as those tabs, pre-selected for that
        institute.
        <strong> {rows.length}</strong> institute{rows.length === 1 ? '' : 's'} loaded from the database.
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
              {user ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={user ? 10 : 9} className="muted">
                  No rows (or configure Supabase env first).
                </td>
              </tr>
            ) : filteredRows.length === 0 && !loading ? (
              <tr>
                <td colSpan={user ? 10 : 9} className="muted">
                  No institutes match “{search}”. Clear the search box to see all {rows.length} row(s).
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => {
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
                      <td className="actions-cell">
                        <div className="inst-actions-row">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={reportBusyId !== null}
                            title="Download student roster CSV"
                            onClick={() => void exportInstituteRosterCsv(r)}
                          >
                            {reportBusyId === r.id ? '…' : '📄 Roster'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Edit institute in database"
                            onClick={() => setEditing(r)}
                          >
                            ✏️ Edit
                          </button>
                          {onOpenStudents ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="Open Students tab with this institute"
                              onClick={() => onOpenStudents(r)}
                            >
                              👨‍🎓 Students
                            </button>
                          ) : null}
                          {onOpenReports ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="Open Reports tab with this institute"
                              onClick={() => onOpenReports(r)}
                            >
                              📑 Reports
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {editing ? (
        <InstituteEditDialog
          institute={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  )
}
