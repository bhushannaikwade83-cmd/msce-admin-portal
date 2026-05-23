import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchPortalSessionInfo, type PortalSessionInfo } from '../lib/adminOnboardingPortal'
import { compareInstituteId } from '../lib/instituteSort'
import { getSupabase } from '../lib/supabase'

const REALTIME_RELOAD_MS = 450
const LIST_PAGE_SIZE = 50

type InstituteRow = {
  id: string
  institute_name: string
  institute_code: string | null
  active: boolean | null
}

type InstructorRow = {
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

export type InstructorDisplayRow = InstructorRow & {
  instituteUuid: string
  instituteCode: string
  instituteName: string
  pinConfigured: boolean
}

type InstituteGroup = {
  instituteUuid: string
  instituteCode: string
  instituteName: string
  active: boolean | null
  instructors: InstructorDisplayRow[]
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function pinConfigured(row: InstructorRow): boolean {
  if (row.has_pin === true) return true
  const h = (row.pin_hash ?? '').trim()
  return h.length > 0
}

function statusTone(status: string): string {
  const s = status.trim().toLowerCase()
  if (s === 'active' || s === 'approved') return 'badge-present'
  if (s === 'pending') return 'badge-half'
  if (s === 'inactive' || s === 'disabled') return 'badge-absent'
  return 'badge-unknown'
}

function normalizeStatus(status: string | null | undefined): string {
  const s = (status ?? '').trim().toLowerCase()
  return s || 'unknown'
}

function buildInstituteLookup(institutes: InstituteRow[]) {
  const byId = new Map<string, InstituteRow>()
  const byCode = new Map<string, InstituteRow>()
  for (const inst of institutes) {
    byId.set(inst.id, inst)
    const code = (inst.institute_code ?? '').trim()
    if (code) byCode.set(code, inst)
  }
  return { byId, byCode }
}

function resolveInstitute(
  profileInstituteId: string | null,
  lookup: ReturnType<typeof buildInstituteLookup>,
): InstituteRow | null {
  const key = (profileInstituteId ?? '').trim()
  if (!key) return null
  return lookup.byId.get(key) ?? lookup.byCode.get(key) ?? null
}

function groupMatchesSearch(group: InstituteGroup, q: string): boolean {
  if (!q) return true
  const hay = [
    group.instituteCode,
    group.instituteName,
    group.instituteUuid,
    ...group.instructors.flatMap((i) => [i.name, i.email, i.phone_number, i.status]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

export function InstituteInstructorsSection({ embedded = false }: { embedded?: boolean }) {
  const [groups, setGroups] = useState<InstituteGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [liveSync, setLiveSync] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<PortalSessionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [showEmptyInstitutes, setShowEmptyInstitutes] = useState(true)
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const info = await fetchPortalSessionInfo()
      setSessionInfo(info)
      if (info && info.can_list_onboarding === false) {
        setGroups([])
        return
      }

      const sb = getSupabase()
      const [instRes, profRes] = await Promise.all([
        sb
          .from('institutes')
          .select('id,institute_name,institute_code,active')
          .order('institute_code', { ascending: true }),
        sb
          .from('profiles')
          .select(
            'id,name,email,phone_number,status,institute_id,created_at,last_login,pin_hash,has_pin,pin_set_at',
          )
          .eq('role', 'attendance_user')
          .order('created_at', { ascending: false }),
      ])

      if (instRes.error) throw new Error(instRes.error.message)
      if (profRes.error) throw new Error(profRes.error.message)

      const institutes = (instRes.data ?? []) as InstituteRow[]
      const instructors = (profRes.data ?? []) as InstructorRow[]
      const lookup = buildInstituteLookup(institutes)

      const byInstitute = new Map<string, InstructorDisplayRow[]>()
      for (const row of instructors) {
        const inst = resolveInstitute(row.institute_id, lookup)
        const instituteUuid = inst?.id ?? (row.institute_id ?? '').trim()
        if (!instituteUuid) continue
        const display: InstructorDisplayRow = {
          ...row,
          instituteUuid,
          instituteCode: (inst?.institute_code ?? instituteUuid).trim(),
          instituteName: inst?.institute_name ?? '—',
          pinConfigured: pinConfigured(row),
        }
        const list = byInstitute.get(instituteUuid) ?? []
        list.push(display)
        byInstitute.set(instituteUuid, list)
      }

      const built: InstituteGroup[] = institutes.map((inst) => {
        const code = (inst.institute_code ?? inst.id).trim()
        const list = byInstitute.get(inst.id) ?? []
        list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
        return {
          instituteUuid: inst.id,
          instituteCode: code,
          instituteName: inst.institute_name,
          active: inst.active,
          instructors: list,
        }
      })

      // Orphan instructors (institute row missing but profile exists)
      for (const [uuid, list] of byInstitute) {
        if (built.some((g) => g.instituteUuid === uuid)) continue
        const first = list[0]
        built.push({
          instituteUuid: uuid,
          instituteCode: first?.instituteCode ?? uuid,
          instituteName: first?.instituteName ?? 'Unknown institute',
          active: null,
          instructors: list,
        })
      }

      built.sort((a, b) => compareInstituteId(a.instituteCode, b.instituteCode))
      setGroups(built)
    } catch (e) {
      setGroups([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()

    const sb = getSupabase()
    const scheduleReload = () => {
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current)
      reloadDebounceRef.current = setTimeout(() => {
        reloadDebounceRef.current = null
        void load({ silent: true })
      }, REALTIME_RELOAD_MS)
    }

    const channel = sb
      .channel('institute-instructors-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'institutes' }, scheduleReload)
      .subscribe((status) => {
        setLiveSync(status === 'SUBSCRIBED')
      })

    return () => {
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current)
      reloadDebounceRef.current = null
      setLiveSync(false)
      void sb.removeChannel(channel)
    }
  }, [load])

  const stats = useMemo(() => {
    let instructorCount = 0
    let withPin = 0
    let missingPin = 0
    let institutesWithInstructors = 0
    for (const g of groups) {
      if (g.instructors.length > 0) institutesWithInstructors += 1
      for (const i of g.instructors) {
        instructorCount += 1
        if (i.pinConfigured) withPin += 1
        else missingPin += 1
      }
    }
    return {
      instituteCount: groups.length,
      instructorCount,
      withPin,
      missingPin,
      institutesWithInstructors,
    }
  }, [groups])

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups
      .filter((g) => (showEmptyInstitutes ? true : g.instructors.length > 0))
      .filter((g) => groupMatchesSearch(g, q))
      .sort((a, b) => compareInstituteId(a.instituteCode, b.instituteCode))
  }, [groups, search, showEmptyInstitutes])

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / LIST_PAGE_SIZE))
  const pageGroups = useMemo(() => {
    const p = Math.min(page, pageCount - 1)
    const start = p * LIST_PAGE_SIZE
    return filteredGroups.slice(start, start + LIST_PAGE_SIZE)
  }, [filteredGroups, page, pageCount])

  useEffect(() => {
    setPage(0)
  }, [search, showEmptyInstitutes])

  const shell = embedded ? 'dash-section card-elevated instructors-page' : 'card instructors-page'

  return (
    <div className={shell}>
      <div className="card-head">
        <div>
          {embedded ? (
            <span className="section-kicker">Instructors (all institutes)</span>
          ) : (
            <h2>Institute instructors</h2>
          )}
          <p className="muted small">
            Every institute and up to 4 staff / instructor accounts from the mobile app. PINs are stored
            as a secure hash — this portal shows whether a PIN was set, not the 4-digit number (share that
            only when creating the user in the app).
          </p>
        </div>
        <div className="row" style={{ gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
          {liveSync ? (
            <span className="live-sync-badge" title="Listening for database changes">
              <span className="live-sync-dot" aria-hidden />
              Live
            </span>
          ) : (
            <span className="muted small">Connecting…</span>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {sessionInfo && !sessionInfo.can_list_onboarding ? (
        <p className="error" role="alert">
          Portal access: {sessionInfo.message ?? 'super_admin required'} — signed in as{' '}
          <strong>{sessionInfo.email ?? 'unknown'}</strong> (role:{' '}
          <code>{sessionInfo.profile_role ?? 'missing'}</code>).
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="instructors-summary row" style={{ flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <span className="stat-pill">
          <strong>{stats.instituteCount}</strong> institutes
        </span>
        <span className="stat-pill">
          <strong>{stats.instructorCount}</strong> instructor accounts
        </span>
        <span className="stat-pill badge-present" style={{ padding: '0.35rem 0.65rem' }}>
          <strong>{stats.withPin}</strong> PIN set
        </span>
        {stats.missingPin > 0 ? (
          <span className="stat-pill badge-absent" style={{ padding: '0.35rem 0.65rem' }}>
            <strong>{stats.missingPin}</strong> missing PIN (cannot log in)
          </span>
        ) : null}
        <span className="muted small">
          {stats.institutesWithInstructors} institutes have at least one instructor
        </span>
      </div>

      <div className="admins-search-toolbar">
        <div className="search-bar-row admins-search-row">
          <div className="search-bar admins-search-bar">
            <span className="search-icon" aria-hidden>
              🔍
            </span>
            <input
              ref={searchRef}
              type="search"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search institute ID, name, instructor name, mobile, email…"
              aria-label="Search instructors"
            />
            {search ? (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
        <label className="row muted small" style={{ gap: '0.4rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showEmptyInstitutes}
            onChange={(e) => setShowEmptyInstitutes(e.target.checked)}
          />
          Show institutes with no instructors
        </label>
        <p className="admins-search-meta">
          Showing {filteredGroups.length} institute{filteredGroups.length === 1 ? '' : 's'}
          {search ? ` matching “${search.trim()}”` : ''}
        </p>
      </div>

      {loading && groups.length === 0 ? (
        <p className="muted">Loading instructors…</p>
      ) : filteredGroups.length === 0 ? (
        <p className="muted">No institutes match your filters.</p>
      ) : (
        <div className="instructors-groups">
          {pageGroups.map((group) => (
            <section key={group.instituteUuid} className="instructors-inst-block card-elevated">
              <header className="instructors-inst-head">
                <div>
                  <h3 className="instructors-inst-title">
                    <span className="mono">{group.instituteCode}</span>
                    <span className="instructors-inst-sep">·</span>
                    {group.instituteName}
                  </h3>
                  <p className="muted small">
                    {group.instructors.length} / 4 instructor slot
                    {group.instructors.length === 1 ? '' : 's'} used
                    {group.active === false ? ' · Institute inactive' : ''}
                  </p>
                </div>
              </header>
              {group.instructors.length === 0 ? (
                <p className="muted small instructors-none">No instructors registered for this institute.</p>
              ) : (
                <div className="table-wrap institutes-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>PIN</th>
                        <th>PIN set at</th>
                        <th>Created</th>
                        <th>Last login</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.instructors.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name?.trim() || '—'}</td>
                          <td className="mono">{row.phone_number?.trim() || '—'}</td>
                          <td>{row.email?.trim() || '—'}</td>
                          <td>
                            <span className={`badge ${statusTone(normalizeStatus(row.status))}`}>
                              {normalizeStatus(row.status)}
                            </span>
                          </td>
                          <td>
                            {row.pinConfigured ? (
                              <span className="badge badge-present" title="PIN hash present — login allowed">
                                PIN set
                              </span>
                            ) : (
                              <span className="badge badge-absent" title="No PIN hash — staff cannot sign in">
                                Missing
                              </span>
                            )}
                          </td>
                          <td className="small">{fmtWhen(row.pin_set_at)}</td>
                          <td className="small">{fmtWhen(row.created_at)}</td>
                          <td className="small">{fmtWhen(row.last_login)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {filteredGroups.length > LIST_PAGE_SIZE ? (
        <div className="pagination-row" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="muted small">
            Page {Math.min(page, pageCount - 1) + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
