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
  institute_code: '',
  name: '',
  address: '',
  city: '',
  district: '',
  taluka: '',
  pincode: '',
  country: 'India',
  mobile_no: '',
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
        <p className="small">Sign in as a <strong>coder</strong> or <strong>super_admin</strong> to insert into <code>institutes</code> (RLS).</p>
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
      const code = form.institute_code.trim()
      if (code) {
        const dupCode = await sb.from('institutes').select('id').eq('institute_code', code).maybeSingle()
        if (dupCode.data) {
          setErr(`Institute code "${code}" is already used.`)
          setBusy(false)
          return
        }
      }

      const now = new Date().toISOString()
      const is_active = !startInactive
      const pincode = form.pincode.replace(/\D/g, '').slice(0, 6)

      const { error: insErr } = await sb.from('institutes').insert({
        id,
        institute_code: code,
        name,
        location: '',
        address: form.address.trim(),
        city: form.city.trim(),
        district: form.district.trim(),
        taluka: form.taluka.trim(),
        state: MH_STATE,
        country: form.country.trim() || 'India',
        mobile_no: form.mobile_no.trim(),
        is_active,
        user_count: 0,
        student_count: 0,
        created_at: now,
        updated_at: now,
      })
      if (insErr) {
        throw new Error(formatSupabaseInsertError(insErr))
      }

      let pincodeNote = ''
      if (pincode.length === 6) {
        const { error: pinErr } = await sb.from('institutes').update({ pincode }).eq('id', id)
        if (pinErr) {
          pincodeNote = ` Pincode not stored — run migration 011_institutes_pincode.sql. (${pinErr.message})`
        }
      }

      const { error: geoErr } = await sb.from('institute_geofence').upsert(
        {
          institute_id: id,
          radius: 30,
          data: { enabled: false, latitude: 0, longitude: 0 },
          updated_at: now,
        },
        { onConflict: 'institute_id' },
      )
      if (geoErr) {
        setMsg(`Institute created; geofence row warning: ${geoErr.message}.${pincodeNote}`)
      } else {
        setMsg(
          (is_active
            ? 'Institute created and active (visible in app directory).'
            : 'Institute created as inactive — use “Approve” in the list below when ready.') + pincodeNote,
        )
      }

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
        Inserts into <code>public.institutes</code> (state is fixed to <strong>Maharashtra</strong>). Enter a 6-digit pincode to load district and taluka. Requires <code>pincode</code> column — run <code>supabase/migrations/011_institutes_pincode.sql</code> in the Supabase SQL Editor once.
      </p>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Institute ID <span className="req">*</span>
          <input value={form.id} onChange={(e) => set('id', e.target.value)} placeholder="e.g. 3333, inst_pune_01" required />
        </label>
        <label>
          Institute code
          <input value={form.institute_code} onChange={(e) => set('institute_code', e.target.value)} placeholder="Short code (unique if set)" />
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
        <label className="checkbox span-2">
          <input type="checkbox" checked={startInactive} onChange={(e) => setStartInactive(e.target.checked)} />
          Start as <strong>inactive</strong> (hidden from public institute list until you approve below)
        </label>
        <div className="span-2 row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Create institute'}
          </button>
        </div>
      </form>
      {err ? <p className="error">{err}</p> : null}
      {msg ? <p className="success">{msg}</p> : null}
    </div>
  )
}
