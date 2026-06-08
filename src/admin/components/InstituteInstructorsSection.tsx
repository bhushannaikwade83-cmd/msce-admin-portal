import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  canListPortalInstructors,
  fetchPortalSessionInfo,
  type PortalSessionInfo,
} from '../lib/adminOnboardingPortal'
import { compareInstituteId } from '../lib/instituteSort'
import {
  createPortalInstructor,
  deletePortalInstructor,
  isValidInstructorMobile,
  isValidInstructorPin,
  updatePortalInstructor,
} from '../lib/portalInstructorManage'
import { fetchAllPortalInstructors, type PortalInstructorRow } from '../lib/portalInstructors'
import { usePortalAccess, usePortalReadOnly } from '../context/portal-access-context'
import { getSupabase } from '../lib/supabase'
import { ModalPortal } from './ModalPortal'

const REALTIME_RELOAD_MS = 450
const LIST_PAGE_SIZE = 50
const MAX_INSTRUCTORS = 4

type InstituteRow = {
  id: string
  name: string | null
  institute_code: string | null
  is_active: boolean | null
}

type InstructorDisplayRow = PortalInstructorRow & {
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

function buildGroups(institutes: InstituteRow[], rows: PortalInstructorRow[]): InstituteGroup[] {
  const byInstitute = new Map<string, InstructorDisplayRow[]>()

  for (const row of rows) {
    const instituteUuid = (row.institute_uuid ?? row.institute_id ?? '').trim()
    if (!instituteUuid) continue
    const display: InstructorDisplayRow = {
      ...row,
      instituteUuid,
      instituteCode: (row.institute_code ?? instituteUuid).trim(),
      instituteName: row.institute_name?.trim() || '—',
      pinConfigured: row.has_pin === true,
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
      instituteName: inst.name?.trim() || code,
      active: inst.is_active,
      instructors: list,
    }
  })

  for (const [uuid, list] of byInstitute) {
    if (built.some((g) => g.instituteUuid === uuid)) continue
    const first = list[0]
    built.push({
      instituteUuid: uuid,
      instituteCode: first?.instituteCode ?? uuid,
      instituteName: first?.instituteName ?? 'Unknown institute',
      active: first?.institute_active ?? null,
      instructors: list,
    })
  }

  built.sort((a, b) => compareInstituteId(a.instituteCode, b.instituteCode))
  return built
}

function AddInstructorModal({
  group,
  saving,
  onClose,
  onSave,
}: {
  group: InstituteGroup
  saving: boolean
  onClose: () => void
  onSave: (values: {
    firstName: string
    middleName: string
    lastName: string
    mobile: string
    pin: string
  }) => void | Promise<void>
}) {
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobile, setMobile] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
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
    const fn = firstName.trim()
    const mn = middleName.trim()
    const ln = lastName.trim()
    const mob = mobile.trim()
    const p = pin.trim()
    const cp = confirmPin.trim()
    if (!fn || !mn || !ln) {
      setFormError('First name, middle name, and last name are all required.')
      return
    }
    if (!isValidInstructorMobile(mob)) {
      setFormError('Enter a valid mobile number (10–15 digits).')
      return
    }
    if (!isValidInstructorPin(p)) {
      setFormError('PIN must be exactly 4 digits.')
      return
    }
    if (p !== cp) {
      setFormError('PIN and confirm PIN must match.')
      return
    }
    await onSave({ firstName: fn, middleName: mn, lastName: ln, mobile: mob, pin: p })
  }

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal
        aria-labelledby="add-instructor-title"
        onClick={onClose}
      >
        <div className="modal-panel card-elevated" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 id="add-instructor-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              Add institute instructor
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
              ✕
            </button>
          </div>
          <p className="modal-subtitle">
            <strong>{group.instituteName}</strong>
            <br />
            Institute ID <code>{group.instituteCode}</code> — same login as in the mobile app (Institute ID + PIN).
          </p>
          {formError ? (
            <p className="error" style={{ marginTop: '0.75rem' }}>
              {formError}
            </p>
          ) : null}
          <form className="modal-form" onSubmit={(e) => void handleSubmit(e)} autoComplete="off">
            <div className="field">
              <label htmlFor="add-inst-first">
                First name <span className="req">*</span>
              </label>
              <input
                id="add-inst-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="add-inst-middle">
                Middle name <span className="req">*</span>
              </label>
              <input
                id="add-inst-middle"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                required
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="add-inst-last">
                Last name <span className="req">*</span>
              </label>
              <input
                id="add-inst-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="add-inst-mobile">
                Mobile <span className="req">*</span>
              </label>
              <input
                id="add-inst-mobile"
                type="tel"
                inputMode="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="add-inst-pin">
                PIN (4 digits) <span className="req">*</span>
              </label>
              <input
                id="add-inst-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                required
                disabled={saving}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="add-inst-pin2">
                Confirm PIN <span className="req">*</span>
              </label>
              <input
                id="add-inst-pin2"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                required
                disabled={saving}
                autoComplete="new-password"
              />
            </div>
            <div className="modal-form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create instructor'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  )
}

function EditInstructorModal({
  row,
  group,
  saving,
  onClose,
  onSave,
}: {
  row: InstructorDisplayRow
  group: InstituteGroup
  saving: boolean
  onClose: () => void
  onSave: (values: { fullName: string; mobile: string; pin: string }) => void | Promise<void>
}) {
  const [fullName, setFullName] = useState(row.name?.trim() ?? '')
  const [mobile, setMobile] = useState(row.phone_number?.trim() ?? '')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
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
    const mob = mobile.trim()
    const p = pin.trim()
    const cp = confirmPin.trim()
    if (name.length < 2) {
      setFormError('Full name is required.')
      return
    }
    if (!isValidInstructorMobile(mob)) {
      setFormError('Enter a valid mobile number (10–15 digits).')
      return
    }
    if (p || cp) {
      if (!isValidInstructorPin(p)) {
        setFormError('New PIN must be exactly 4 digits.')
        return
      }
      if (p !== cp) {
        setFormError('PIN and confirm PIN must match.')
        return
      }
    }
    await onSave({ fullName: name, mobile: mob, pin: p })
  }

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal
        aria-labelledby="edit-instructor-title"
        onClick={onClose}
      >
        <div className="modal-panel card-elevated" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 id="edit-instructor-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              Edit instructor
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
              ✕
            </button>
          </div>
          <p className="modal-subtitle">
            <strong>{group.instituteName}</strong> · ID <code>{group.instituteCode}</code>
          </p>
          {formError ? (
            <p className="error" style={{ marginTop: '0.75rem' }}>
              {formError}
            </p>
          ) : null}
          <form className="modal-form" onSubmit={(e) => void handleSubmit(e)} autoComplete="off">
            <div className="field">
              <label htmlFor="edit-inst-name">
                Full name <span className="req">*</span>
              </label>
              <input
                id="edit-inst-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-inst-mobile">
                Mobile <span className="req">*</span>
              </label>
              <input
                id="edit-inst-mobile"
                type="tel"
                inputMode="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-inst-pin">New PIN (optional, 4 digits)</label>
              <input
                id="edit-inst-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={saving}
                autoComplete="new-password"
                placeholder="Leave blank to keep current PIN"
              />
            </div>
            {pin ? (
              <div className="field">
                <label htmlFor="edit-inst-pin2">Confirm new PIN</label>
                <input
                  id="edit-inst-pin2"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  disabled={saving}
                  autoComplete="new-password"
                />
              </div>
            ) : null}
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

function DeleteInstructorModal({
  row,
  group,
  saving,
  onClose,
  onConfirm,
}: {
  row: InstructorDisplayRow
  group: InstituteGroup
  saving: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal
        aria-labelledby="delete-instructor-title"
        onClick={onClose}
      >
        <div className="modal-panel card-elevated" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 id="delete-instructor-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              Remove instructor?
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
              ✕
            </button>
          </div>
          <p className="modal-subtitle">
            Remove <strong>{row.name?.trim() || 'this instructor'}</strong> from{' '}
            <strong>{group.instituteName}</strong> (ID <code>{group.instituteCode}</code>)?
            <br />
            <span className="muted small">
              This deletes their login from Supabase Auth. They cannot sign in with their PIN until an admin adds them
              again (app or website).
            </span>
          </p>
          <div className="modal-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: 'var(--accent-red, #c62828)' }}
              disabled={saving}
              onClick={() => void onConfirm()}
            >
              {saving ? 'Removing…' : 'Remove instructor'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export function InstituteInstructorsSection({ embedded = false }: { embedded?: boolean }) {
  const portal = usePortalAccess()
  const readOnly = usePortalReadOnly()
  const [groups, setGroups] = useState<InstituteGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [liveSync, setLiveSync] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<PortalSessionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadSource, setLoadSource] = useState<'rpc' | 'direct' | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [showEmptyInstitutes, setShowEmptyInstitutes] = useState(true)
  const [success, setSuccess] = useState<string | null>(null)
  const [addGroup, setAddGroup] = useState<InstituteGroup | null>(null)
  const [editing, setEditing] = useState<{ row: InstructorDisplayRow; group: InstituteGroup } | null>(null)
  const [deleting, setDeleting] = useState<{ row: InstructorDisplayRow; group: InstituteGroup } | null>(null)
  const [saving, setSaving] = useState(false)
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const canManage =
    !readOnly && sessionInfo !== null && sessionInfo.can_list_onboarding !== false

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const info = await fetchPortalSessionInfo()
      setSessionInfo(info)

      if (info && !canListPortalInstructors(info)) {
        setGroups([])
        setLoadSource(null)
        if (!silent) setLoading(false)
        return
      }

      const {
        rows: instructorRows,
        institutes,
        source,
        districtRpcLikelyUnpatched,
      } = await fetchAllPortalInstructors({
        institutePrefixes: portal.institutePrefixes,
      })
      setLoadSource(source)

      if (districtRpcLikelyUnpatched) {
        setError(
          'Instructors list is empty for your district. In Supabase SQL Editor, run the full file sql/manual_portal_district_viewers.sql (especially list_portal_instructors_all and profiles_portal_district_attendance_select), then click Refresh.',
        )
      } else if (source === 'direct' && portal.mode === 'district_viewer') {
        setError(
          'Could not load instructors via portal RPC. Run sql/manual_portal_district_viewers.sql in Supabase, then Refresh.',
        )
      } else if (source === 'direct') {
        setError(
          'Run migration 075_list_portal_instructors_all.sql in Supabase SQL Editor for the most reliable all-institute list.',
        )
      } else {
        setError(null)
      }

      setGroups(buildGroups(institutes, instructorRows))
    } catch (e) {
      setGroups([])
      setLoadSource(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [portal.institutePrefixes, portal.mode])

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

  async function handleCreateInstructor(
    values: {
      firstName: string
      middleName: string
      lastName: string
      mobile: string
      pin: string
    },
    group: InstituteGroup,
  ) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await createPortalInstructor({
        instituteKey: group.instituteCode || group.instituteUuid,
        ...values,
      })
      if (!res.success) throw new Error(res.message ?? 'Could not create instructor')
      setAddGroup(null)
      setSuccess(`Instructor added for ${group.instituteCode}.`)
      await load({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateInstructor(
    values: { fullName: string; mobile: string; pin: string },
    row: InstructorDisplayRow,
  ) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await updatePortalInstructor({
        profileId: row.id,
        fullName: values.fullName,
        mobile: values.mobile,
        pin: values.pin || undefined,
      })
      if (!res.success) throw new Error(res.message ?? 'Could not update instructor')
      setEditing(null)
      setSuccess('Instructor updated.')
      await load({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteInstructor(row: InstructorDisplayRow) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await deletePortalInstructor(row.id)
      if (!res.success) throw new Error(res.message ?? 'Could not remove instructor')
      setDeleting(null)
      setSuccess('Instructor removed.')
      await load({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const shell = embedded ? 'dash-section card-elevated instructors-page' : 'card instructors-page'

  return (
    <div className={shell}>
      <div className="card-head">
        <div>
          {embedded ? (
            <span className="section-kicker">
              {portal.districtName
                ? `Instructors — ${portal.districtName}`
                : 'Instructors (all institutes)'}
            </span>
          ) : (
            <h2>Institute instructors</h2>
          )}
          <p className="muted small">
            {portal.mode === 'district_viewer' && portal.districtName ? (
              <>
                View-only list for <strong>{portal.districtName}</strong> institutes (by institute ID prefix). Editing
                is disabled for district logins.
              </>
            ) : (
              <>
                All institutes — staff / instructor accounts (<code>attendance_user</code>). Super admins can add,
                edit, or remove instructors here (same rules as the mobile app: max 4 per institute, Institute ID +
                PIN login).
              </>
            )}{' '}
            PIN column shows whether login PIN was saved (not the 4-digit number).
            {loadSource === 'rpc' ? (
              <>
                {' '}
                <span className="badge badge-present" style={{ fontSize: '0.65rem' }}>
                  Live RPC
                </span>
              </>
            ) : null}
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

      {sessionInfo && !canListPortalInstructors(sessionInfo) ? (
        <p className="error" role="alert">
          Portal access: {sessionInfo.message ?? 'super_admin or district viewer required'} — signed in
          as <strong>{sessionInfo.email ?? 'unknown'}</strong> (role:{' '}
          <code>{sessionInfo.profile_role ?? 'missing'}</code>). For super admin, sign in with{' '}
          <code>gcctbcsupport@gmail.com</code> or run migration <code>058</code> / <code>059</code> in
          Supabase. For district viewers, run <code>sql/manual_portal_district_viewers.sql</code> and ensure{' '}
          <code>portal_district_key</code> is set on your profile.
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {success ? (
        <p className="success" role="status">
          {success}
        </p>
      ) : null}
      {canManage ? (
        <p className="muted small" style={{ marginBottom: '0.75rem' }}>
          Deploy Edge Function <code>portal-manage-instructor</code> in Supabase if add/edit/delete returns a 404.
          Optional SQL: <code>sql/manual_portal_instructors.sql</code>.
        </p>
      ) : null}

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
            <strong>{stats.missingPin}</strong> missing PIN
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

      {loading ? (
        <p className="muted" role="status">
          Loading instructors{portal.districtName ? ` for ${portal.districtName}` : ''}…
        </p>
      ) : null}
      {!loading && filteredGroups.length === 0 ? (
        <p className="muted">
          {!canListPortalInstructors(sessionInfo)
            ? 'No data — fix portal login (see message above).'
            : canManage
              ? 'No instructors found. Use Add instructor on an institute below, or add from the mobile app.'
              : 'No instructors found. Add instructors in the mobile app (Institute → Add instructor).'}
        </p>
      ) : (
        <div className="instructors-groups">
          {pageGroups.map((group) => (
            <section key={group.instituteUuid} className="instructors-inst-block card-elevated">
              <header className="instructors-inst-head row" style={{ justifyContent: 'space-between', gap: '0.75rem' }}>
                <div>
                  <h3 className="instructors-inst-title">
                    <span className="mono">{group.instituteCode}</span>
                    <span className="instructors-inst-sep">·</span>
                    {group.instituteName}
                  </h3>
                  <p className="muted small">
                    {group.instructors.length} / {MAX_INSTRUCTORS} instructor slot
                    {group.instructors.length === 1 ? '' : 's'} used
                    {group.active === false ? ' · Institute inactive' : ''}
                  </p>
                </div>
                {canManage && group.instructors.length < MAX_INSTRUCTORS ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={saving}
                    onClick={() => {
                      setError(null)
                      setSuccess(null)
                      setAddGroup(group)
                    }}
                  >
                    Add instructor
                  </button>
                ) : null}
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
                        {canManage ? <th>Actions</th> : null}
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
                              <span className="badge badge-present">PIN set</span>
                            ) : (
                              <span className="badge badge-absent">Missing</span>
                            )}
                          </td>
                          <td className="small">{fmtWhen(row.pin_set_at)}</td>
                          <td className="small">{fmtWhen(row.created_at)}</td>
                          <td className="small">{fmtWhen(row.last_login)}</td>
                          {canManage ? (
                            <td>
                              <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={saving}
                                  onClick={() => {
                                    setError(null)
                                    setSuccess(null)
                                    setEditing({ row, group })
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={saving}
                                  onClick={() => {
                                    setError(null)
                                    setSuccess(null)
                                    setDeleting({ row, group })
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          ) : null}
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

      {addGroup ? (
        <AddInstructorModal
          group={addGroup}
          saving={saving}
          onClose={() => !saving && setAddGroup(null)}
          onSave={(values) => handleCreateInstructor(values, addGroup)}
        />
      ) : null}
      {editing ? (
        <EditInstructorModal
          row={editing.row}
          group={editing.group}
          saving={saving}
          onClose={() => !saving && setEditing(null)}
          onSave={(values) => handleUpdateInstructor(values, editing.row)}
        />
      ) : null}
      {deleting ? (
        <DeleteInstructorModal
          row={deleting.row}
          group={deleting.group}
          saving={saving}
          onClose={() => !saving && setDeleting(null)}
          onConfirm={() => handleDeleteInstructor(deleting.row)}
        />
      ) : null}
    </div>
  )
}
