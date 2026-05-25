import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  formatGpsPair,
  gpsLatitude,
  gpsLongitude,
  gpsUpdatedAt,
  type PortalGpsAdminLine,
  type PortalGpsSettingRow,
} from '../lib/instituteGpsPortal'
import { sortByInstituteId } from '../lib/instituteSort'
import { downloadCsv, instituteDirectoryCsvRows } from '../lib/reportCsv'
import { fetchAllPaged } from '../lib/supabasePaged'
import { getSupabase } from '../lib/supabase'
import { InstituteGpsDialog } from './InstituteGpsDialog'
import { InstituteReportModal } from './InstituteReportModal'
import { ModalPortal } from './ModalPortal'

const TABLE_PAGE_SIZE_DEFAULT = 50
const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const

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

type ProfileAdminRow = {
  id: string
  email: string | null
  name: string | null
  role: string | null
  institute_id: string | null
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
  gpsRows: PortalGpsSettingRow[],
): PortalGpsAdminLine[] {
  const admins = profiles.filter(
    (p) => p.institute_id === instituteId && isInstituteAdminRole(p.role),
  )
  const gpsForInst = gpsRows.filter((g) => g.institute_id === instituteId)
  const lines: PortalGpsAdminLine[] = []
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
      latitude: gpsLatitude(g),
      longitude: gpsLongitude(g),
      updated_at: gpsUpdatedAt(g),
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
      latitude: gpsLatitude(g),
      longitude: gpsLongitude(g),
      updated_at: gpsUpdatedAt(g),
    })
  }

  return lines.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

type Props = {
  reloadToken?: number
  embedded?: boolean
  readOnly?: boolean
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

function formFromInstituteRow(row: Record<string, unknown>): InstituteEditForm {
  const pickR = (...keys: string[]): string =>
    keys.map((k) => row[k]).find((v) => v !== null && v !== undefined && String(v) !== '')?.toString() ?? ''
  return {
    name: String(row.name ?? ''),
    institute_code: String(row.institute_code ?? ''),
    location: pickR('location'),
    address: pickR('address'),
    city: String(row.city ?? ''),
    district: pickR('district'),
    taluka: pickR('taluka'),
    pincode: String(row.pincode ?? ''),
    state: String(row.state ?? ''),
    country: pickR('country') || 'India',
    mobile_no: pickR('mobile_no'),
    is_active: row.is_active !== false,
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
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
  const [form, setForm] = useState<InstituteEditForm>(() =>
    formFromInstituteRow(institute as Record<string, unknown>),
  )
  const [busy, setBusy] = useState(false)
  const [loadingRow, setLoadingRow] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingRow(true)
    setErr(null)
    void (async () => {
      try {
        const sb = getSupabase()
        const { data, error: qErr } = await sb.from('institutes').select('*').eq('id', institute.id).single()
        if (qErr) throw qErr
        if (!cancelled && data) {
          setForm(formFromInstituteRow(data as Record<string, unknown>))
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e))
          setForm(formFromInstituteRow(institute as Record<string, unknown>))
        }
      } finally {
        if (!cancelled) setLoadingRow(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [institute.id])

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

  const inputDisabled = busy || loadingRow

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal
        aria-labelledby="inst-edit-title"
        onClick={onClose}
      >
        <div
          className="modal-panel modal-panel-institute-edit card-elevated"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="modal-head">
          <h2 id="inst-edit-title" style={{ margin: 0, fontSize: '1.05rem' }}>
            Edit institute
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <p className="modal-subtitle">
          Update institute details in the database. Changes apply immediately after you save.
        </p>
        <span className="modal-institute-id-badge">
          Institute ID <code>{institute.id}</code>
        </span>
        {err ? <p className="error" style={{ marginTop: '0.75rem' }}>{err}</p> : null}
        {loadingRow ? <p className="muted small" style={{ marginTop: '0.75rem' }}>Loading institute…</p> : null}
        <form className="modal-form modal-form-grid" onSubmit={(e) => void onSubmit(e)} autoComplete="off">
          <p className="form-section-label">Identity</p>
          <div className="field span-2">
            <label htmlFor="inst-edit-name">
              Name <span className="req">*</span>
            </label>
            <input
              id="inst-edit-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              disabled={inputDisabled}
              autoComplete="organization"
            />
          </div>
          <div className="field">
            <label htmlFor="inst-edit-code">Institute code</label>
            <input
              id="inst-edit-code"
              type="text"
              value={form.institute_code}
              onChange={(e) => setForm((f) => ({ ...f, institute_code: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="inst-edit-mobile">Mobile</label>
            <input
              id="inst-edit-mobile"
              type="tel"
              inputMode="tel"
              value={form.mobile_no}
              onChange={(e) => setForm((f) => ({ ...f, mobile_no: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="tel"
            />
          </div>

          <p className="form-section-label">Location</p>
          <div className="field span-2">
            <label htmlFor="inst-edit-address">Address</label>
            <input
              id="inst-edit-address"
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="street-address"
            />
          </div>
          <div className="field">
            <label htmlFor="inst-edit-city">City</label>
            <input
              id="inst-edit-city"
              type="text"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="address-level2"
            />
          </div>
          <div className="field">
            <label htmlFor="inst-edit-pincode">Pincode</label>
            <input
              id="inst-edit-pincode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={form.pincode}
              onChange={(e) =>
                setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))
              }
              disabled={inputDisabled}
              autoComplete="postal-code"
              placeholder="6 digits"
            />
          </div>
          <div className="field">
            <label htmlFor="inst-edit-district">District</label>
            <input
              id="inst-edit-district"
              type="text"
              value={form.district}
              onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="inst-edit-taluka">Taluka</label>
            <input
              id="inst-edit-taluka"
              type="text"
              value={form.taluka}
              onChange={(e) => setForm((f) => ({ ...f, taluka: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="inst-edit-state">State</label>
            <input
              id="inst-edit-state"
              type="text"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="address-level1"
            />
          </div>
          <div className="field">
            <label htmlFor="inst-edit-country">Country</label>
            <input
              id="inst-edit-country"
              type="text"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="country-name"
            />
          </div>
          <div className="field span-2">
            <label htmlFor="inst-edit-location">Location (short label)</label>
            <input
              id="inst-edit-location"
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              disabled={inputDisabled}
              autoComplete="off"
            />
          </div>

          <p className="form-section-label">Status</p>
          <div className="field span-2 field-checkbox">
            <input
              id="inst-edit-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              disabled={inputDisabled}
            />
            <label htmlFor="inst-edit-active">
              Institute is active (visible in app listings when your RLS allows)
            </label>
          </div>
          <p className="form-section-label span-2">GPS</p>
          <p className="muted small span-2" style={{ margin: 0, lineHeight: 1.45 }}>
            Per-admin GPS lock/unlock and history are managed from the institutes table GPS column. Use the Manage / Set
            GPS buttons there to unlock, save new coordinates, and review change history.
          </p>

          <div className="modal-form-actions span-2">
            <button type="button" className="btn btn-ghost" disabled={inputDisabled} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={inputDisabled}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </ModalPortal>
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
  readOnly = false,
  onAddInstitute,
}: Props) {
  const { user } = useAuth()
  const [rows, setRows] = useState<InstituteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [gpsColExists, setGpsColExists] = useState<boolean | null>(null) // null = unknown yet
  /** institute_id → each admin’s GPS row (profiles + gps_settings, RLS-scoped) */
  const [gpsAdminsByInstitute, setGpsAdminsByInstitute] = useState<Record<string, PortalGpsAdminLine[]>>({})
  const [adminInvitesByInstitute, setAdminInvitesByInstitute] = useState<Record<string, AdminInviteRow | null>>({})
  const [search, setSearch] = useState('')
  const [tablePage, setTablePage] = useState(0)
  const [tablePageSize, setTablePageSize] = useState(TABLE_PAGE_SIZE_DEFAULT)
  const [editing, setEditing] = useState<InstituteRow | null>(null)
  const [gpsEditing, setGpsEditing] = useState<{ institute: InstituteRow; line: PortalGpsAdminLine } | null>(null)
  const [reportInstitute, setReportInstitute] = useState<InstituteRow | null>(null)

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.name, r.institute_code, r.id, r.city, r.state, r.pincode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [rows, search])

  const tablePageCount = Math.max(1, Math.ceil(filteredRows.length / tablePageSize))
  const safeTablePage = Math.min(tablePage, tablePageCount - 1)

  const paginatedRows = useMemo(() => {
    const start = safeTablePage * tablePageSize
    return filteredRows.slice(start, start + tablePageSize)
  }, [filteredRows, safeTablePage, tablePageSize])

  useEffect(() => {
    setTablePage(0)
  }, [search, tablePageSize])

  useEffect(() => {
    if (tablePage > tablePageCount - 1) {
      setTablePage(Math.max(0, tablePageCount - 1))
    }
  }, [tablePage, tablePageCount])

  const stats = useMemo(() => {
    let active = 0
    let pendingAdmin = 0
    for (const r of rows) {
      if (r.is_active !== false) active += 1
      const inv = adminInvitesByInstitute[r.id]
      if (inv && !inv.claimed) pendingAdmin += 1
    }
    return {
      total: rows.length,
      active,
      inactive: rows.length - active,
      pendingAdmin,
    }
  }, [rows, adminInvitesByInstitute])

  function exportDirectoryCsv() {
    const { header, data } = instituteDirectoryCsvRows(rows)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`institutes_directory_${stamp}.csv`, header, data)
  }

  const load = useCallback(async () => {
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const sb = getSupabase()
      // select('*') avoids 400 when `pincode` column is missing (migration 011 not applied yet).
      const raw = await fetchAllPaged<InstituteRow>((rangeFrom, rangeTo) =>
        sb
          .from('institutes')
          .select('*')
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
      const fetched = sortByInstituteId(raw)
      setRows(fetched)
      const inviteData = await fetchAllPaged<AdminInviteRow>((rangeFrom, rangeTo) =>
        sb
          .from('admin_invites')
          .select('institute_id, full_name, phone, email, claimed')
          .order('institute_id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
      const inviteMap: Record<string, AdminInviteRow | null> = {}
      for (const row of inviteData) {
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
        let allGps: PortalGpsSettingRow[] = []
        let allProfiles: ProfileAdminRow[] = []
        let gpsErrMsg: string | null = null
        let profErrMsg: string | null = null

        const gpsResults = await Promise.all(
          chunks.map((ch) =>
            ch.length
              ? sb.from('gps_settings').select('*').in('institute_id', ch)
              : Promise.resolve({ data: [] as PortalGpsSettingRow[], error: null }),
          ),
        )
        for (const r of gpsResults) {
          if (r.error) {
            gpsErrMsg = r.error.message
            break
          }
          allGps = allGps.concat((r.data ?? []) as PortalGpsSettingRow[])
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
          const map: Record<string, PortalGpsAdminLine[]> = {}
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

  const shell = embedded ? 'dash-section institutes-page' : 'card institutes-page'

  return (
    <div className={shell}>
      <div className="card-head institutes-page-head">
        <div>
          {!embedded ? <h2>Institutes</h2> : <span className="section-kicker">Institute directory</span>}
          <p className="muted small institutes-page-lead">
            {readOnly
              ? 'View institutes in your district (filtered by institute code). Editing is disabled.'
              : 'Manage institutes in the database. New institutes are registered as active automatically.'}
          </p>
        </div>
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

      <div className="institutes-stat-grid">
        <div className="institutes-stat-card">
          <span className="institutes-stat-value">{loading ? '…' : stats.total.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Total institutes</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--active">
          <span className="institutes-stat-value">{loading ? '…' : stats.active.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Active</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--muted">
          <span className="institutes-stat-value">{loading ? '…' : stats.inactive.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Inactive</span>
        </div>
        <div className="institutes-stat-card institutes-stat-card--warn">
          <span className="institutes-stat-value">{loading ? '…' : stats.pendingAdmin.toLocaleString('en-IN')}</span>
          <span className="institutes-stat-label">Admin pending setup</span>
        </div>
      </div>

      <div className="search-bar-row institutes-search-row">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setTablePage(0)
            }}
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
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      <div className="table-wrap institutes-table-wrap">
        <table className="table-dash-compact institutes-directory-table">
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
              <th title={user ? 'GPS lock status per admin' : 'GPS lock status'}>GPS</th>
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
              paginatedRows.map((r) => {
                const lines = user ? (gpsAdminsByInstitute[r.id] ?? []) : []
                const isGpsLockedLegacy = r.gps_locked === true
                const invite = adminInvitesByInstitute[r.id]
                return (
                  <tr key={r.id} className={r.is_active === false ? 'inst-row-inactive' : undefined}>
                    <td className="inst-name-cell" title={r.name ?? undefined}>
                      <strong>{r.name ?? '—'}</strong>
                    </td>
                    <td title={r.institute_code ?? undefined}>{r.institute_code ?? '—'}</td>
                    <td title={r.id}>
                      <code className="tiny">{r.id}</code>
                    </td>
                    <td title={r.city ?? undefined}>{r.city ?? '—'}</td>
                    <td title={r.pincode ?? undefined}>{r.pincode ?? '—'}</td>
                    <td title={r.state ?? undefined}>{r.state ?? '—'}</td>
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
                    <td>
                      {r.is_active !== false ? (
                        <span className="badge badge-present">Active</span>
                      ) : (
                        <span className="badge badge-absent">Inactive</span>
                      )}
                    </td>
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
                              const locked = line.is_locked === true
                              const coords = formatGpsPair(line.latitude, line.longitude)
                              return (
                                <li key={line.adminId}>
                                  <div className="gps-admin-line">
                                    <span className="gps-admin-label" title={line.label}>
                                      {line.label}
                                    </span>
                                    {line.hasRow ? (
                                      <>
                                        <span
                                          className={`gps-badge ${locked ? 'gps-locked' : 'gps-unlocked'}`}
                                          title={locked ? 'GPS locked' : 'GPS open'}
                                        >
                                          {locked ? '🔒' : '🔓'}
                                        </span>
                                        {coords ? (
                                          <span className="gps-admin-coords" title={coords}>
                                            {coords}
                                          </span>
                                        ) : null}
                                        {line.updated_at ? (
                                          <span className="gps-admin-updated" title={fmtDateTime(line.updated_at)}>
                                            {fmtDateTime(line.updated_at)}
                                          </span>
                                        ) : null}
                                        {!readOnly ? (
                                          <button
                                            type="button"
                                            className={`btn btn-sm institutes-action-btn ${locked ? 'btn-gps-unlock' : 'btn-gps-lock'}`}
                                            onClick={() => setGpsEditing({ institute: r, line })}
                                          >
                                            Manage
                                          </button>
                                        ) : null}
                                      </>
                                    ) : (
                                      <>
                                        <span
                                          className="badge badge-muted"
                                          title="No gps_settings row yet — save location once in the MSCE Attendance app."
                                        >
                                          Not set
                                        </span>
                                        {!readOnly ? (
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-gps-unlock institutes-action-btn"
                                            onClick={() => setGpsEditing({ institute: r, line })}
                                          >
                                            Set GPS
                                          </button>
                                        ) : null}
                                      </>
                                    )}
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
                        <span
                          className={`gps-badge ${isGpsLockedLegacy ? 'gps-locked' : 'gps-unlocked'}`}
                          title={isGpsLockedLegacy ? 'GPS locked' : 'GPS open'}
                        >
                          {isGpsLockedLegacy ? '🔒' : '🔓'}
                        </span>
                      )}
                    </td>
                    {user ? (
                      <td className="actions-cell">
                        <div className="inst-actions-row">
                          {!readOnly ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm institutes-action-btn"
                              title="Edit institute in database"
                              onClick={() => setEditing(r)}
                            >
                              Edit
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-primary btn-sm institutes-action-btn"
                            title="Institute tabular attendance report"
                            onClick={() => setReportInstitute(r)}
                          >
                            Report
                          </button>
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
      {filteredRows.length > 0 ? (
        <div className="institutes-panel-pager">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safeTablePage <= 0}
            onClick={() => setTablePage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="muted small institutes-pager-meta">
            Page {safeTablePage + 1} of {tablePageCount} ({filteredRows.length.toLocaleString('en-IN')} rows)
          </span>
          <label className="institutes-page-size">
            <span className="muted small">Per page</span>
            <select
              value={tablePageSize}
              onChange={(e) => {
                setTablePageSize(Number(e.target.value))
                setTablePage(0)
              }}
              aria-label="Rows per page"
            >
              {TABLE_PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safeTablePage >= tablePageCount - 1}
            onClick={() => setTablePage((p) => Math.min(tablePageCount - 1, p + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
      {editing && !readOnly ? (
        <InstituteEditDialog
          institute={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      ) : null}
      {gpsEditing && !readOnly ? (
        <InstituteGpsDialog
          institute={gpsEditing.institute}
          line={gpsEditing.line}
          onClose={() => setGpsEditing(null)}
          onSaved={() => {
            setInfo('GPS settings updated.')
            void load()
          }}
        />
      ) : null}
      {reportInstitute ? (
        <InstituteReportModal institute={reportInstitute} onClose={() => setReportInstitute(null)} />
      ) : null}
    </div>
  )
}
