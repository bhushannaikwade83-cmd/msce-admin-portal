import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'
import { lookupMaharashtraFromPincode } from '../lib/indiaPincode'

const MH_STATE = 'Maharashtra' as const

function formatSupabaseInsertError(err: {
  message: string
  details?: string
  hint?: string
  code?: string
}): string {
  const parts = [err.message, err.details, err.hint].filter(Boolean)
  return parts.join(' — ') + (err.code ? ` [${err.code}]` : '')
}

const empty = {
  id: '',
  name: '',
  address: '',
  city: '',
  district: '',
  taluka: '',
  pincode: '',
  country: 'India',
  mobile_no: '',
  admin_full_name: '',
  admin_mobile: '',
  admin_email: '',
}

type Props = { onCreated: () => void; embedded?: boolean }

export function AddInstituteForm({ onCreated, embedded = false }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState(empty)
  const [startInactive, setStartInactive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [pinHint, setPinHint] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!user) {
    return (
      <div className="card muted">
        <h2>Add institute</h2>
        <p className="small">Sign in as the website <strong>super_admin</strong> account to save institute and admin setup data.</p>
      </div>
    )
  }

  function set<K extends keyof typeof empty>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  useEffect(() => {
    const pin = form.pincode.replace(/\D/g, '')
    setPinHint(null)
    if (pin.length !== 6) {
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null
      setPinBusy(true)
      try {
        const r = await lookupMaharashtraFromPincode(pin)
        setForm((f) => ({
          ...f,
          district: r.district,
          taluka: r.taluka,
        }))
        setPinHint(`${r.district} — filled from pincode`)
      } catch (e) {
        setPinHint(e instanceof Error ? e.message : String(e))
      } finally {
        setPinBusy(false)
      }
    }, 450)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [form.pincode])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    const id = form.id.trim()
    const name = form.name.trim()
    if (!id || !name) {
      setErr('Institute ID and name are required.')
      return
    }

    setBusy(true)
    try {
      const sb = getSupabase()
      const dupId = await sb.from('institutes').select('id').eq('id', id).maybeSingle()
      if (dupId.data) {
        setErr(`Institute id "${id}" already exists.`)
        setBusy(false)
        return
      }
      const pincode = form.pincode.replace(/\D/g, '').slice(0, 6)
      const adminName = form.admin_full_name.trim()
      const adminMobile = form.admin_mobile.trim()
      const adminEmail = form.admin_email.trim().toLowerCase()
      if (!adminName || !adminMobile || !adminEmail) {
        setErr('Admin full name, mobile number, and email are required.')
        setBusy(false)
        return
      }

      const { data, error: rpcErr } = await sb.rpc('create_institute_admin_setup', {
        p_institute_id: id,
        p_institute_name: name,
        p_institute_address: form.address.trim(),
        p_institute_city: form.city.trim(),
        p_institute_mobile: form.mobile_no.trim(),
        p_admin_full_name: adminName,
        p_admin_mobile: adminMobile,
        p_admin_email: adminEmail,
      })
      if (rpcErr) {
        throw new Error(formatSupabaseInsertError(rpcErr))
      }
      if (!data?.success) {
        throw new Error(data?.message ?? 'Could not save institute admin setup.')
      }

      let pincodeNote = ''
      if (pincode.length === 6) {
        const { error: pinErr } = await sb
          .from('institutes')
          .update({
            pincode,
            district: form.district.trim(),
            taluka: form.taluka.trim(),
            state: MH_STATE,
            country: form.country.trim() || 'India',
            is_active: !startInactive,
          })
          .eq('id', id)
        if (pinErr) {
          pincodeNote = ` Pincode not stored — run migration 011_institutes_pincode.sql. (${pinErr.message})`
        }
      }

      setMsg('Institute and admin setup saved for the app.' + pincodeNote)

      setForm(empty)
      setStartInactive(true)
      setPinHint(null)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const shell = embedded ? 'dash-section card-elevated' : 'card'

  return (
    <div className={shell}>
      {!embedded ? <h2>Add institute</h2> : <p className="section-kicker">New tenant</p>}
      <p className="muted small">
        Saves institute details plus admin full name, mobile number, and email for the app onboarding flow. Enter a 6-digit pincode to load district and taluka.
      </p>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Institute ID <span className="req">*</span>
          <input value={form.id} onChange={(e) => set('id', e.target.value.replace(/\D/g, ''))} placeholder="e.g. 3333" required />
        </label>
        <label className="span-2">
          Name <span className="req">*</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </label>
        <label>
          City
          <input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </label>
        <label>
          Pincode
          <input
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            value={form.pincode}
            onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 digits"
          />
          {pinBusy ? <span className="field-hint">Looking up pincode…</span> : null}
          {!pinBusy && pinHint ? <span className="field-hint">{pinHint}</span> : null}
        </label>
        <label>
          District
          <input value={form.district} onChange={(e) => set('district', e.target.value)} placeholder="Auto-filled from pincode" />
        </label>
        <label>
          Taluka
          <input value={form.taluka} onChange={(e) => set('taluka', e.target.value)} placeholder="Auto-filled from pincode" />
        </label>
        <label>
          State
          <input className="readonly-locked" readOnly tabIndex={-1} value={MH_STATE} aria-readonly="true" />
          <span className="field-hint">Fixed for this product region</span>
        </label>
        <label>
          Country
          <input value={form.country} onChange={(e) => set('country', e.target.value)} />
        </label>
        <label className="span-2">
          Address
          <input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </label>
        <label>
          Mobile
          <input value={form.mobile_no} onChange={(e) => set('mobile_no', e.target.value)} />
        </label>
        <label className="span-2">
          Admin full name <span className="req">*</span>
          <input value={form.admin_full_name} onChange={(e) => set('admin_full_name', e.target.value)} required />
        </label>
        <label>
          Admin mobile number <span className="req">*</span>
          <input value={form.admin_mobile} onChange={(e) => set('admin_mobile', e.target.value)} required />
        </label>
        <label>
          Admin email <span className="req">*</span>
          <input value={form.admin_email} onChange={(e) => set('admin_email', e.target.value)} type="email" required />
        </label>
        <label className="checkbox span-2">
          <input type="checkbox" checked={startInactive} onChange={(e) => setStartInactive(e.target.checked)} />
          Start as <strong>inactive</strong> in institute list
        </label>
        <div className="span-2 row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save institute + admin'}
          </button>
        </div>
      </form>
      {err ? <p className="error">{err}</p> : null}
      {msg ? <p className="success">{msg}</p> : null}
    </div>
  )
}
