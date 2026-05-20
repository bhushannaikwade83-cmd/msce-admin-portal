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

      const { error: activeErr } = await sb
        .from('institutes')
        .update({
          is_active: true,
          state: MH_STATE,
          country: form.country.trim() || 'India',
          ...(pincode.length === 6
            ? {
                pincode,
                district: form.district.trim() || null,
                taluka: form.taluka.trim() || null,
              }
            : {}),
        })
        .eq('id', id)

      let pincodeNote = ''
      if (activeErr) {
        pincodeNote = ` (${activeErr.message})`
      } else if (pincode.length === 6) {
        pincodeNote = ' Institute is active and ready in the app.'
      }

      setMsg('Institute and admin invite saved.' + pincodeNote)

      setForm(empty)
      setPinHint(null)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const shell = embedded ? 'dash-section institutes-page' : 'card institutes-page'
  const inputDisabled = busy

  return (
    <div className={shell}>
      <div className="institutes-page-head">
        {!embedded ? <h2>Add institute</h2> : <span className="section-kicker">Register institute</span>}
        <p className="muted small institutes-page-lead">
          New institutes are saved as <strong>active</strong> in the database automatically. The admin completes
          password setup in the mobile app.
        </p>
      </div>
      <form className="modal-form modal-form-grid institutes-add-form" onSubmit={onSubmit} autoComplete="off">
        <p className="form-section-label">Institute details</p>
        <div className="field">
          <label htmlFor="add-inst-id">
            Institute ID <span className="req">*</span>
          </label>
          <input
            id="add-inst-id"
            type="text"
            inputMode="numeric"
            value={form.id}
            onChange={(e) => set('id', e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 3333"
            required
            disabled={inputDisabled}
            autoComplete="off"
          />
        </div>
        <div className="field span-2">
          <label htmlFor="add-inst-name">
            Name <span className="req">*</span>
          </label>
          <input
            id="add-inst-name"
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            disabled={inputDisabled}
            autoComplete="organization"
          />
        </div>
        <div className="field">
          <label htmlFor="add-inst-city">City</label>
          <input
            id="add-inst-city"
            type="text"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            disabled={inputDisabled}
            autoComplete="address-level2"
          />
        </div>
        <div className="field">
          <label htmlFor="add-inst-pincode">Pincode</label>
          <input
            id="add-inst-pincode"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            value={form.pincode}
            onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 digits"
            disabled={inputDisabled}
          />
          {pinBusy ? <span className="field-hint">Looking up pincode…</span> : null}
          {!pinBusy && pinHint ? <span className="field-hint">{pinHint}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="add-inst-district">District</label>
          <input
            id="add-inst-district"
            type="text"
            value={form.district}
            onChange={(e) => set('district', e.target.value)}
            placeholder="Auto-filled from pincode"
            disabled={inputDisabled}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="add-inst-taluka">Taluka</label>
          <input
            id="add-inst-taluka"
            type="text"
            value={form.taluka}
            onChange={(e) => set('taluka', e.target.value)}
            placeholder="Auto-filled from pincode"
            disabled={inputDisabled}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="add-inst-state">State</label>
          <input
            id="add-inst-state"
            type="text"
            className="readonly-locked"
            readOnly
            tabIndex={-1}
            value={MH_STATE}
            aria-readonly="true"
            disabled={inputDisabled}
          />
          <span className="field-hint">Fixed for this product region</span>
        </div>
        <div className="field">
          <label htmlFor="add-inst-country">Country</label>
          <input
            id="add-inst-country"
            type="text"
            value={form.country}
            onChange={(e) => set('country', e.target.value)}
            disabled={inputDisabled}
            autoComplete="country-name"
          />
        </div>
        <div className="field span-2">
          <label htmlFor="add-inst-address">Address</label>
          <input
            id="add-inst-address"
            type="text"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            disabled={inputDisabled}
            autoComplete="street-address"
          />
        </div>
        <div className="field">
          <label htmlFor="add-inst-mobile">Mobile</label>
          <input
            id="add-inst-mobile"
            type="tel"
            inputMode="tel"
            value={form.mobile_no}
            onChange={(e) => set('mobile_no', e.target.value)}
            disabled={inputDisabled}
            autoComplete="tel"
          />
        </div>

        <p className="form-section-label">Institute admin (invite)</p>
        <div className="field span-2">
          <label htmlFor="add-admin-name">
            Admin full name <span className="req">*</span>
          </label>
          <input
            id="add-admin-name"
            type="text"
            value={form.admin_full_name}
            onChange={(e) => set('admin_full_name', e.target.value)}
            required
            disabled={inputDisabled}
            autoComplete="name"
          />
        </div>
        <div className="field">
          <label htmlFor="add-admin-mobile">
            Admin mobile number <span className="req">*</span>
          </label>
          <input
            id="add-admin-mobile"
            type="tel"
            inputMode="tel"
            value={form.admin_mobile}
            onChange={(e) => set('admin_mobile', e.target.value)}
            required
            disabled={inputDisabled}
            autoComplete="tel"
          />
        </div>
        <div className="field">
          <label htmlFor="add-admin-email">
            Admin email <span className="req">*</span>
          </label>
          <input
            id="add-admin-email"
            type="email"
            value={form.admin_email}
            onChange={(e) => set('admin_email', e.target.value)}
            required
            disabled={inputDisabled}
            autoComplete="email"
          />
        </div>

        <div className="modal-form-actions span-2 institutes-form-actions">
          <button type="submit" className="btn btn-primary" disabled={inputDisabled}>
            {busy ? 'Saving…' : 'Save institute & admin invite'}
          </button>
        </div>
      </form>
      {err ? <p className="error">{err}</p> : null}
      {msg ? <p className="success">{msg}</p> : null}
    </div>
  )
}
