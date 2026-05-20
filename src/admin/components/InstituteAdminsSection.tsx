import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import {
  fetchPortalOnboardingRows,
  fetchPortalSessionInfo,
  isEditablePendingInvite,
  splitPortalOnboardingRows,
  updatePendingAdminInvite,
  type InviteDisplayRow,
  type PortalSessionInfo,
} from '../lib/adminOnboardingPortal'
import { compareInstituteId } from '../lib/instituteSort'
import { getSupabase } from '../lib/supabase'
import { ModalPortal } from './ModalPortal'

const REALTIME_RELOAD_MS = 450
const LIST_PAGE_SIZE = 100

type ActiveInvitePanel = 'pending' | 'completed' | null

function inviteMatchesSearch(inv: InviteDisplayRow, q: string): boolean {
  if (!q) return true
  const hay = [
    inv.institute_id,
    inv.instituteCode,
    inv.instituteLabel,
    inv.full_name,
    inv.email,
    inv.phone,
    inv.profileName,
    inv.profileEmail,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function statusTone(status: string): string {
  if (status === 'active' || status === 'approved') return 'badge-present'
  if (status === 'pending') return 'badge-half'
  if (status === 'inactive' || status === 'disabled') return 'badge-absent'
  return 'badge-unknown'
}

function normalizeStatus(status: string | null | undefined): string {
  const s = (status ?? '').trim().toLowerCase()
  return s || 'unknown'
}

function InviteSearchBar({
  value,
  onChange,
  onClear,
  onSearch,
  placeholder,
  matchCount,
  totalCount,
  sortHint = 'Institute ID ascending',
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onSearch: () => void
  placeholder: string
  matchCount: number
  totalCount?: number
  sortHint?: string
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  return (
    <div className="admins-search-toolbar">
      <div className="search-bar-row admins-search-row">
        <div className="search-bar admins-search-bar">
          <span className="search-icon" aria-hidden>
            🔍
          </span>
          <input
            ref={inputRef}
            type="search"
            className="search-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onSearch()
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          {value ? (
            <button type="button" className="search-clear" onClick={onClear} aria-label="Clear search">
              ✕
            </button>
          ) : null}
        </div>
        <button type="button" className="btn btn-primary admins-search-btn" onClick={onSearch}>
          Search
        </button>
      </div>
      <p className="admins-search-meta">
        <span className="search-count">
          <strong>{matchCount.toLocaleString('en-IN')}</strong>
          {totalCount != null ? ` of ${totalCount.toLocaleString('en-IN')}` : ''} shown
        </span>
        <span className="admins-search-meta-sep" aria-hidden>
          ·
        </span>
        <span>{sortHint}</span>
      </p>
    </div>
  )
}

function EditPendingInviteModal({
  invite,
  saving,
  onClose,
  onSave,
}: {
  invite: InviteDisplayRow
  saving: boolean
  onClose: () => void
  onSave: (values: { fullName: string; email: string; phone: string }) => void | Promise<void>
}) {
  const [fullName, setFullName] = useState(invite.full_name?.trim() ?? '')
  const [email, setEmail] = useState(invite.email?.trim() ?? '')
  const [phone, setPhone] = useState(invite.phone?.trim() ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const name = fullName.trim()
    const mail = email.trim().toLowerCase()
    const mobile = phone.trim()
    if (!name) {
      setFormError('Admin name is required.')
      return
    }
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setFormError('Enter a valid email address.')
      return
    }
    if (!mobile) {
      setFormError('Mobile number is required.')
      return
    }
    await onSave({ fullName: name, email: mail, phone: mobile })
  }

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal
        aria-labelledby="edit-invite-title"
        onClick={onClose}
      >
      <div className="modal-panel card-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="edit-invite-title" style={{ margin: 0, fontSize: '1.05rem' }}>
            Edit pending admin invite
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            ✕
          </button>
        </div>
        <p className="modal-subtitle">
          <strong>{invite.instituteLabel}</strong>
          <br />
          Institute ID <code>{invite.institute_id}</code>
          {invite.instituteCode ? (
            <>
              {' '}
              · Code <code>{invite.instituteCode}</code>
            </>
          ) : null}
        </p>
        {formError ? <p className="error" style={{ marginTop: '0.75rem' }}>{formError}</p> : null}
        <form className="modal-form" onSubmit={(e) => void handleSubmit(e)} autoComplete="off">
          <div className="field">
            <label htmlFor="edit-invite-name">
              Admin name <span className="req">*</span>
            </label>
            <input
              id="edit-invite-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoFocus
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="edit-invite-email">
              Email <span className="req">*</span>
            </label>
            <input
              id="edit-invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="edit-invite-phone">
              Mobile <span className="req">*</span>
            </label>
            <input
              id="edit-invite-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="modal-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}

function InviteTable({
  rows,
  loading,
  emptyMessage,
  variant,
  onEdit,
  editBusyId,
}: {
  rows: InviteDisplayRow[]
  loading: boolean
  emptyMessage: string
  variant: 'pending' | 'completed'
  onEdit?: (inv: InviteDisplayRow) => void
  editBusyId?: string | null
}) {
  const showClaimedAt = variant === 'completed'
  const showActions = variant === 'pending' && onEdit != null
  const colCount = showActions ? 5 : 4

  return (
    <div className="table-wrap">
      <table className="table-dash-compact">
        <thead>
          <tr>
            <th>Institute</th>
            <th>Admin</th>
            <th>Contact</th>
            <th>{showClaimedAt ? 'Password set' : 'Invited'}</th>
            {showActions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {!rows.length && !loading ? (
            <tr>
              <td colSpan={colCount} className="muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <div>
                    <strong>{inv.instituteLabel}</strong>
                  </div>
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
                  <div>
                    <strong>{inv.profileName?.trim() || inv.full_name?.trim() || '—'}</strong>
                  </div>
                  {showClaimedAt ? (
                    <span className="badge badge-present" style={{ marginTop: '0.35rem' }}>
                      Password set in app
                    </span>
                  ) : (
                    <span className="badge badge-half" style={{ marginTop: '0.35rem' }}>
                      Awaiting password setup
                    </span>
                  )}
                  {inv.profileEmail && inv.profileEmail !== inv.email ? (
                    <div className="muted small">Signed in as {inv.profileEmail}</div>
                  ) : null}
                </td>
                <td>
                  <div>{inv.email?.trim() || '—'}</div>
                  <div className="muted small">{inv.phone?.trim() || '—'}</div>
                </td>
                <td className="muted small">
                  <div>{showClaimedAt ? fmtWhen(inv.claimed_at) : fmtWhen(inv.created_at)}</div>
                  {showClaimedAt && inv.profileStatus ? (
                    <div style={{ marginTop: '0.35rem' }}>
                      <span className={`badge ${statusTone(normalizeStatus(inv.profileStatus))}`}>
                        Portal: {normalizeStatus(inv.profileStatus)}
                      </span>
                    </div>
                  ) : null}
                </td>
                {showActions ? (
                  <td>
                    {isEditablePendingInvite(inv) ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={editBusyId === inv.id}
                        onClick={() => onEdit?.(inv)}
                      >
                        {editBusyId === inv.id ? '…' : 'Edit'}
                      </button>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function InstituteAdminsSection({ embedded = false }: { embedded?: boolean }) {
  const [pendingInvites, setPendingInvites] = useState<InviteDisplayRow[]>([])
  const [completedInvites, setCompletedInvites] = useState<InviteDisplayRow[]>([])
  const [loading, setLoading] = useState(false)
  const [liveSync, setLiveSync] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<PortalSessionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editingInvite, setEditingInvite] = useState<InviteDisplayRow | null>(null)
  const [savingInviteId, setSavingInviteId] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<ActiveInvitePanel>(null)
  const [pendingSearch, setPendingSearch] = useState('')
  const [completedSearch, setCompletedSearch] = useState('')
  const [pendingPage, setPendingPage] = useState(0)
  const [completedPage, setCompletedPage] = useState(0)
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSearchRef = useRef<HTMLInputElement>(null)
  const completedSearchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
      setSuccess(null)
    }
    try {
      const info = await fetchPortalSessionInfo()
      setSessionInfo(info)
      const portalRows = await fetchPortalOnboardingRows()
      const split = splitPortalOnboardingRows(portalRows)
      setPendingInvites(split.pendingInvites)
      setCompletedInvites(split.completedInvites)
    } catch (e) {
      setPendingInvites([])
      setCompletedInvites([])
      const info = await fetchPortalSessionInfo()
      setSessionInfo(info)
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
      .channel('institute-admins-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_invites' },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'institutes' },
        scheduleReload,
      )
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

  const sortedFilteredPending = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase()
    return pendingInvites
      .filter((inv) => inviteMatchesSearch(inv, q))
      .sort((a, b) => compareInstituteId(a.institute_id, b.institute_id))
  }, [pendingInvites, pendingSearch])

  const sortedFilteredCompleted = useMemo(() => {
    const q = completedSearch.trim().toLowerCase()
    return completedInvites
      .filter((inv) => inviteMatchesSearch(inv, q))
      .sort((a, b) => compareInstituteId(a.institute_id, b.institute_id))
  }, [completedInvites, completedSearch])

  const pendingPageCount = Math.max(1, Math.ceil(sortedFilteredPending.length / LIST_PAGE_SIZE))
  const completedPageCount = Math.max(1, Math.ceil(sortedFilteredCompleted.length / LIST_PAGE_SIZE))

  const pendingPageRows = useMemo(() => {
    const page = Math.min(pendingPage, pendingPageCount - 1)
    const start = page * LIST_PAGE_SIZE
    return sortedFilteredPending.slice(start, start + LIST_PAGE_SIZE)
  }, [sortedFilteredPending, pendingPage, pendingPageCount])

  const completedPageRows = useMemo(() => {
    const page = Math.min(completedPage, completedPageCount - 1)
    const start = page * LIST_PAGE_SIZE
    return sortedFilteredCompleted.slice(start, start + LIST_PAGE_SIZE)
  }, [sortedFilteredCompleted, completedPage, completedPageCount])

  function togglePanel(panel: Exclude<ActiveInvitePanel, null>) {
    setActivePanel((current) => (current === panel ? null : panel))
  }

  async function handleSavePendingInvite(values: {
    fullName: string
    email: string
    phone: string
  }) {
    if (!editingInvite) return
    setSavingInviteId(editingInvite.id)
    setError(null)
    setSuccess(null)
    try {
      await updatePendingAdminInvite({
        inviteId: editingInvite.id,
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
      })
      setEditingInvite(null)
      setSuccess(
        `Updated invite for institute ${editingInvite.institute_id} (${values.fullName}, ${values.email}).`,
      )
      await load({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingInviteId(null)
    }
  }

  useEffect(() => {
    if (activePanel === 'pending') {
      window.setTimeout(() => pendingSearchRef.current?.focus(), 80)
    } else if (activePanel === 'completed') {
      window.setTimeout(() => completedSearchRef.current?.focus(), 80)
    }
  }, [activePanel])

  const shell = embedded ? 'dash-section card-elevated' : 'card'

  return (
    <div className={shell}>
      <div className="card-head">
        <div>
          {embedded ? <span className="section-kicker">Admins & Access</span> : <h2>Institute admins</h2>}
          <p className="muted small">
            Data from <code>admin_invites</code> + <code>profiles</code>. After an admin sets their password in
            the app they can sign in immediately — no manual approval on this portal.
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
          Portal access: {sessionInfo.message ?? 'super_admin required'} — you are signed in as{' '}
          <strong>{sessionInfo.email ?? 'unknown'}</strong> (profile role:{' '}
          <code>{sessionInfo.profile_role ?? 'missing'}</code>). Institute admins cannot use this
          console; use a website <code>super_admin</code> account.
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success">{success}</p> : null}

      {editingInvite ? (
        <EditPendingInviteModal
          invite={editingInvite}
          saving={savingInviteId === editingInvite.id}
          onClose={() => {
            if (savingInviteId) return
            setEditingInvite(null)
          }}
          onSave={handleSavePendingInvite}
        />
      ) : null}

      <div className="admins-stat-grid">
        <button
          type="button"
          className={`admins-stat-card admins-stat-card--pending${activePanel === 'pending' ? ' is-active' : ''}`}
          onClick={() => togglePanel('pending')}
          aria-expanded={activePanel === 'pending'}
        >
          <span className="admins-stat-count">{pendingInvites.length}</span>
          <span className="admins-stat-label">Pending password setup</span>
          <span className="admins-stat-hint">
            {activePanel === 'pending' ? 'Click to hide list' : 'Click to view all — sorted by institute ID'}
          </span>
        </button>

        <button
          type="button"
          className={`admins-stat-card admins-stat-card--completed${activePanel === 'completed' ? ' is-active' : ''}`}
          onClick={() => togglePanel('completed')}
          aria-expanded={activePanel === 'completed'}
        >
          <span className="admins-stat-count">{completedInvites.length}</span>
          <span className="admins-stat-label">Password set in app</span>
          <span className="admins-stat-hint">
            {activePanel === 'completed' ? 'Click to hide list' : 'Click to view completed sign-ups'}
          </span>
        </button>
      </div>

      {activePanel === 'pending' ? (
        <div className="admins-panel">
          <div className="admins-panel-head">
            <InviteSearchBar
              value={pendingSearch}
              onChange={(v) => {
                setPendingSearch(v)
                setPendingPage(0)
              }}
              onClear={() => {
                setPendingSearch('')
                setPendingPage(0)
                pendingSearchRef.current?.focus()
              }}
              onSearch={() => {
                setPendingPage(0)
                pendingSearchRef.current?.focus()
              }}
              placeholder="Filter pending — institute ID, name, email, phone…"
              matchCount={sortedFilteredPending.length}
              totalCount={pendingInvites.length}
              inputRef={pendingSearchRef}
            />
          </div>
          <div className="admins-panel-body">
            <InviteTable
              rows={pendingPageRows}
              loading={loading}
              variant="pending"
              emptyMessage="No pending invites match your search."
              onEdit={(inv) => setEditingInvite(inv)}
              editBusyId={savingInviteId}
            />
          </div>
          {sortedFilteredPending.length > LIST_PAGE_SIZE ? (
            <div className="admins-panel-pager">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pendingPage <= 0}
                onClick={() => setPendingPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className="muted small">
                Page {Math.min(pendingPage, pendingPageCount - 1) + 1} of {pendingPageCount} (
                {sortedFilteredPending.length} rows)
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pendingPage >= pendingPageCount - 1}
                onClick={() => setPendingPage((p) => Math.min(pendingPageCount - 1, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activePanel === 'completed' ? (
        <div className="admins-panel">
          <div className="admins-panel-head">
            <InviteSearchBar
              value={completedSearch}
              onChange={(v) => {
                setCompletedSearch(v)
                setCompletedPage(0)
              }}
              onClear={() => {
                setCompletedSearch('')
                setCompletedPage(0)
                completedSearchRef.current?.focus()
              }}
              onSearch={() => {
                setCompletedPage(0)
                completedSearchRef.current?.focus()
              }}
              placeholder="Filter completed — institute ID, name, email, phone…"
              matchCount={sortedFilteredCompleted.length}
              totalCount={completedInvites.length}
              inputRef={completedSearchRef}
            />
          </div>
          <div className="admins-panel-body">
            <InviteTable
              rows={completedPageRows}
              loading={loading}
              variant="completed"
              emptyMessage="No completed sign-ups match your search."
            />
          </div>
          {sortedFilteredCompleted.length > LIST_PAGE_SIZE ? (
            <div className="admins-panel-pager">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={completedPage <= 0}
                onClick={() => setCompletedPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className="muted small">
                Page {Math.min(completedPage, completedPageCount - 1) + 1} of {completedPageCount}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={completedPage >= completedPageCount - 1}
                onClick={() => setCompletedPage((p) => Math.min(completedPageCount - 1, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}