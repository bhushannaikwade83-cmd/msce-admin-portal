import { useState, useEffect, type FormEvent } from 'react'
import { getSupabase } from '../lib/supabase'
import { usePortalAccess } from '../context/portal-access-context'
import { sortByInstituteId } from '../lib/instituteSort'
import { filterInstitutesByPortalPrefixes } from '../lib/portalDistricts'
import type { InstituteRow } from './InstituteList'

export function AddStudentForm() {
  const portal = usePortalAccess()
  const [institutes, setInstitutes] = useState<InstituteRow[]>([])
  const [selectedInstitute, setSelectedInstitute] = useState<InstituteRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [year, setYear] = useState(`Year ${new Date().getFullYear()}`)
  const [subjectsCsv, setSubjectsCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    void loadInstitutes()
  }, [portal])

  async function loadInstitutes() {
    setLoading(true)
    try {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('institutes')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      let list = (data ?? []) as InstituteRow[]
      list = sortByInstituteId(list)
      if (portal.institutePrefixes?.length) {
        list = filterInstitutesByPortalPrefixes(list, portal.institutePrefixes)
      }
      setInstitutes(list)
      if (list.length === 1) {
        setSelectedInstitute(list[0])
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedInstitute) {
      setErr('Please select an institute.')
      return
    }
    setErr(null)
    setOk(null)
    const fn = firstName.trim()
    const mn = middleName.trim()
    const ln = lastName.trim()
    if (!fn || !ln) {
      setErr('First and last name are required.')
      return
    }
    const fullName = `${fn} ${mn} ${ln}`.replace(/\s+/g, ' ').trim()
    setBusy(true)
    try {
      const sb = getSupabase()
      const nameCompare = `${fn.toLowerCase()} ${mn.toLowerCase()} ${ln.toLowerCase()}`.replace(/\s+/g, ' ').trim()
      const { data: dupRows } = await sb
        .from('students')
        .select('id,fname,mname,lname,first_name,middle_name,last_name,name,student_name')
        .eq('institute_id', selectedInstitute.id)
      for (const row of dupRows ?? []) {
        const r = row as Record<string, unknown>
        const fname = String(r.fname ?? r.first_name ?? '').toLowerCase()
        const mname = String(r.mname ?? r.middle_name ?? '').toLowerCase()
        const lname = String(r.lname ?? r.last_name ?? '').toLowerCase()
        const ex = `${fname} ${mname} ${lname}`.replace(/\s+/g, ' ').trim()
        const nm = String(r.student_name ?? r.name ?? '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
        if ((ex && ex === nameCompare) || (nm && nm === fullName.toLowerCase())) {
          setErr('A student with the same full name is already registered in this institute.')
          setBusy(false)
          return
        }
      }
      const { data: peakRaw, error: peakErr } = await sb.rpc('institute_peak_student_numbers', {
        p_institute_id: selectedInstitute.id,
      })
      if (peakErr) throw peakErr
      const peak = (peakRaw ?? {}) as { sr_max?: number; roll_max?: number }
      const base = Math.max(Number(peak.sr_max ?? 0), Number(peak.roll_max ?? 0))
      const nextSr = String(base + 1)
      const subjList = subjectsCsv.split(',').map((s) => s.trim()).filter(Boolean)

      const insertData: Record<string, unknown> = {
        institute_id: selectedInstitute.id,
        user_id: nextSr,
        sr_no: nextSr,
        name: fullName,
        student_name: fullName,
        year: year.trim() || `Year ${new Date().getFullYear()}`,
        is_pay: 1,
        is_paid: 1,
      }

      if (fn) insertData.fname = fn
      if (mn) insertData.mname = mn
      if (ln) insertData.lname = ln

      for (let i = 1; i <= 8; i++) {
        insertData[`sub${i}`] = subjList[i - 1] ?? null
      }

      const { error: insErr } = await sb
        .from('students')
        .insert(insertData, { count: 'estimated' })
      if (insErr) throw insErr
      try {
        const { data: instRow } = await sb.from('institutes').select('student_count').eq('id', selectedInstitute.id).maybeSingle()
        const cur = Number((instRow as { student_count?: number } | null)?.student_count ?? 0)
        await sb.from('institutes').update({ student_count: cur + 1 }).eq('id', selectedInstitute.id)
      } catch {
        /* optional counter — ignore if RLS/column blocks */
      }
      setOk(`✅ Saved ${fullName} with roll ${nextSr} in ${selectedInstitute.name}. Data is live in the database. Add face photo from the mobile app.`)
      setFirstName('')
      setMiddleName('')
      setLastName('')
      setYear(`Year ${new Date().getFullYear()}`)
      setSubjectsCsv('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="card">
        <h2>Add Student</h2>
        <p className="muted">Loading institutes…</p>
      </div>
    )
  }

  if (institutes.length === 0) {
    return (
      <div className="card">
        <h2>Add Student</h2>
        <p className="error">No institutes available in your access scope.</p>
      </div>
    )
  }

  return (
    <div className="card card-elevated">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Add Student</h2>
        <p className="muted small">Add a new student to an institute. Data inserts into Supabase <code>students</code> table.</p>
      </div>

      {err ? <p className="error" style={{ marginBottom: '1rem' }}>{err}</p> : null}
      {ok ? <p className="success" style={{ marginBottom: '1rem' }}>{ok}</p> : null}

      <form onSubmit={(e) => void onSubmit(e)} className="form-grid">
        <label>
          Institute <span className="req">*</span>
          <select
            value={selectedInstitute?.id ?? ''}
            onChange={(e) => {
              const inst = institutes.find((i) => i.id === e.target.value)
              setSelectedInstitute(inst ?? null)
            }}
            required
          >
            <option value="">— Select institute —</option>
            {institutes.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name} {inst.institute_code ? `(${inst.institute_code})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          First name <span className="req">*</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Rajesh"
            required
            autoComplete="off"
          />
        </label>

        <label>
          Middle name
          <input
            type="text"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            placeholder="e.g. Kumar"
            autoComplete="off"
          />
        </label>

        <label>
          Last name <span className="req">*</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Sharma"
            required
            autoComplete="off"
          />
        </label>

        <label>
          Year / batch label
          <input
            type="text"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder={`Year ${new Date().getFullYear()}`}
            autoComplete="off"
          />
        </label>

        <label className="span-2">
          Subjects (comma-separated, optional)
          <input
            type="text"
            value={subjectsCsv}
            onChange={(e) => setSubjectsCsv(e.target.value)}
            placeholder="e.g. English, Maths, Science"
            autoComplete="off"
          />
        </label>

        <div className="span-2" style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !selectedInstitute}>
            {busy ? 'Saving…' : 'Save to database'}
          </button>
        </div>
      </form>
    </div>
  )
}
