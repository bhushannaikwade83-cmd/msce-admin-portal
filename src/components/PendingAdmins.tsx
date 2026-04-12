import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'

type ProfileRow = {
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

type Props = { embedded?: boolean }

export function PendingAdmins({ embedded = false }: Props) {
  const { user } = useAuth()
  const [pending, setPending] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setPending([])
      return
    }
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const sb = getSupabase()
      const { data, error: qErr } = await sb
        .from('profiles')
        .select('id, email, name, role, status, institute_id, institute_name, phone_number, created_at')
        .eq('role', 'admin')
        .not('institute_id', 'is', null)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (qErr) throw qErr
      setPending((data ?? []) as ProfileRow[])
    } catch (e) {
      setPending([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  async function approve(id: string) {
    setError(null)
    setInfo(null)
    const sb = getSupabase()
    const { error: uErr } = await sb.from('profiles').update({ status: 'approved' }).eq('id', id)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setInfo('Approved — user can log in to the app for that institute.')
    await load()
  }

  async function approveAll() {
    setError(null)
    setInfo(null)
    const sb = getSupabase()
    let failed = 0
    for (const p of pending) {
      const { error: uErr } = await sb.from('profiles').update({ status: 'approved' }).eq('id', p.id)
      if (uErr) failed++
    }
    if (failed) setError(`${failed} update(s) failed (check RLS / role).`)
    else setInfo('All pending requests approved.')
    await load()
  }

  function formatWhen(iso: string | null) {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return iso
    }
  }

  if (!user) {
    return (
      <div className="card muted">
        <h2>Pending institute admins</h2>
        <p className="small">Sign in as coder or super_admin to approve registrations from the mobile app.</p>
      </div>
    )
  }

  const shell = embedded ? 'dash-section card-elevated' : 'card'

  return (
    <div className={shell}>
      <div className="card-head">
        {!embedded ? <h2>Approve institute admins</h2> : <span className="section-kicker">Approvals</span>}
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn-success" onClick={() => void approveAll()} disabled={loading || !pending.length}>
            Approve all
          </button>
        </div>
      </div>
      <p className="muted small">
        New institute admins register in the app with status <code>pending</code> and cannot log in until you set{' '}
        <code>profiles.status</code> to <code>approved</code> here. Columns show which institute each request belongs to.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="success">{info}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Institute ID</th>
              <th>Institute name</th>
              <th>Requested</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!pending.length && !loading ? (
              <tr>
                <td colSpan={7} className="muted">
                  No pending approval requests.
                </td>
              </tr>
            ) : (
              pending.map((p) => (
                <tr key={p.id}>
                  <td>{p.email ?? '—'}</td>
                  <td>{p.name ?? '—'}</td>
                  <td>{p.phone_number ?? '—'}</td>
                  <td>
                    <code className="tiny">{p.institute_id ?? '—'}</code>
                  </td>
                  <td>{p.institute_name ?? '—'}</td>
                  <td className="muted">{formatWhen(p.created_at)}</td>
                  <td>
                    <button type="button" className="btn btn-success btn-sm" onClick={() => void approve(p.id)}>
                      Approve
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
