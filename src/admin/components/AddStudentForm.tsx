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
  const [subjects, setSubjects] = useState<Record<number, string>>({
    1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', 8: '',
  })
  const [instituteNo, setInstituteNo] = useState('')
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function lookupInstituteByNo(no: string) {
    if (!no || no.length !== 5) return null
    const inst = institutes.find(i => i.institute_code === no)
    return inst ?? null
  }

  function handleInstituteNoChange(val: string) {
    const cleaned = val.slice(0, 5).replace(/\D/g, '')
    setInstituteNo(cleaned)
    if (cleaned.length === 5) {
      void lookupInstituteByNo(cleaned).then(inst => {
        if (inst) {
          setSelectedInstitute(inst)
        } else {
          setErr(`Institute with code ${cleaned} not found.`)
          setSelectedInstitute(null)
        }
      })
    } else {
      setSelectedInstitute(null)
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
        insertData[`sub${i}`] = subjects[i]?.trim() || null
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
      setSubjects({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', 8: '' })
      setInstituteNo('')
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
          Institute Code (5 digits) <span className="req">*</span>
          <input
            type="text"
            value={instituteNo}
            onChange={(e) => handleInstituteNoChange(e.target.value)}
            placeholder="e.g. 12345"
            maxLength={5}
            pattern="\d{0,5}"
            required
            autoComplete="off"
          />
          {selectedInstitute && (
            <div className="small" style={{ marginTop: '0.25rem', color: 'var(--success-fg)' }}>
              ✓ {selectedInstitute.name}
            </div>
          )}
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

        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Subjects (optional)</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <label key={i} style={{ marginBottom: 0 }}>
                <span className="small" style={{ display: 'block', marginBottom: '0.25rem' }}>Subject {i}</span>
                <input
                  type="text"
                  value={subjects[i] ?? ''}
                  onChange={(e) => setSubjects({ ...subjects, [i]: e.target.value })}
                  placeholder={`e.g. Subject ${i}`}
                  autoComplete="off"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="span-2" style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !selectedInstitute}>
            {busy ? 'Saving…' : 'Save to database'}
          </button>
        </div>
      </form>
    </div>
  )
}
