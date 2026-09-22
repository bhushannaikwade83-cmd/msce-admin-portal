import { useState, useEffect, type FormEvent } from 'react'
import { getSupabase } from '../lib/supabase'
import { usePortalAccess } from '../context/portal-access-context'
import { sortByInstituteId } from '../lib/instituteSort'
import { filterInstitutesByPortalPrefixes } from '../lib/portalDistricts'
import { PREDEFINED_SUBJECTS, groupSubjectsByFamily } from '../lib/predefinedSubjects'
import type { InstituteRow } from './InstituteList'

export function AddStudentForm() {
  const portal = usePortalAccess()
  const [institutes, setInstitutes] = useState<InstituteRow[]>([])
  const [selectedInstitute, setSelectedInstitute] = useState<InstituteRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [motherName, setMotherName] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set())
  const [instituteNo, setInstituteNo] = useState('')
  const [formSerialNo, setFormSerialNo] = useState('')
  const [applicationNo, setApplicationNo] = useState('')
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
    if (!formSerialNo.trim()) {
      setErr('Form Serial Number is required.')
      return
    }
    console.log('🏫 Selected institute:', { id: selectedInstitute.id, name: selectedInstitute.name, code: selectedInstitute.institute_code })
    setErr(null)
    setOk(null)
    const fn = firstName.trim()
    const mn = middleName.trim()
    const ln = lastName.trim()
    const motherN = motherName.trim()
    if (!fn || !ln || !motherN) {
      setErr('First name, last name, and mother name are required.')
      return
    }
    const fullName = `${fn} ${mn} ${ln}`.replace(/\s+/g, ' ').trim()
    setBusy(true)
    try {
      const sb = getSupabase()
      const nameCompare = `${fn.toLowerCase()} ${mn.toLowerCase()} ${ln.toLowerCase()}`.replace(/\s+/g, ' ').trim()
      const { data: dupRows, error: dupErr } = await sb
        .from('students')
        .select('id,fname,mname,lname,student_name,sr_no,form_serial_no')
        .eq('institute_id', selectedInstitute.id)
      if (dupErr) {
        console.error('❌ Duplicate check error:', dupErr)
      }
      for (const row of dupRows ?? []) {
        const r = row as Record<string, unknown>
        const fname = String(r.fname ?? '').toLowerCase()
        const mname = String(r.mname ?? '').toLowerCase()
        const lname = String(r.lname ?? '').toLowerCase()
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
        // Check for duplicate Application No (sr_no)
        if (String(r.sr_no ?? '') === applicationNo.trim()) {
          setErr(`Application No ${applicationNo} already exists in this institute.`)
          setBusy(false)
          return
        }
        // Check for duplicate Form Serial No
        if (String(r.form_serial_no ?? '') === formSerialNo.trim()) {
          setErr(`Form Serial No ${formSerialNo} already exists in this institute.`)
          setBusy(false)
          return
        }
      }
      const yearNum = year.trim() ? parseInt(year.trim().replace(/\D/g, ''), 10) || new Date().getFullYear() : new Date().getFullYear()
      const insertData: Record<string, unknown> = {
        institute_id: selectedInstitute.id,
        sr_no: applicationNo.trim(),
        form_serial_no: formSerialNo.trim(),
        year: yearNum,
        payid: 1,
      }

      if (fn) insertData.fname = fn
      if (mn) insertData.mname = mn
      if (ln) insertData.lname = ln
      if (motherN) insertData.mother_name = motherN

      const subjList = Array.from(selectedSubjects).sort()
      for (let i = 1; i <= 8; i++) {
        insertData[`sub${i}`] = subjList[i - 1] || null
      }

      console.log('📝 Inserting student data:', insertData)
      const { error: insErr, data: insData } = await sb
        .from('students')
        .insert(insertData, { count: 'estimated' })
      if (insErr) {
        console.error('❌ Insert error:', insErr)
        console.error('📋 Error details:', { code: insErr.code, message: insErr.message, details: insErr.details, hint: insErr.hint })
        throw insErr
      }
      console.log('✅ Insert success:', insData)
      try {
        const { data: instRow } = await sb.from('institutes').select('student_count').eq('id', selectedInstitute.id).maybeSingle()
        const cur = Number((instRow as { student_count?: number } | null)?.student_count ?? 0)
        await sb.from('institutes').update({ student_count: cur + 1 }).eq('id', selectedInstitute.id)
      } catch {
        /* optional counter — ignore if RLS/column blocks */
      }
      setOk(`✅ Saved ${fullName} (App No: ${applicationNo}) in ${selectedInstitute.name}. Data is live in the database. Add face photo from the mobile app.`)
      setFirstName('')
      setMiddleName('')
      setLastName('')
      setMotherName('')
      setYear(String(new Date().getFullYear()))
      setSelectedSubjects(new Set())
      setInstituteNo('')
      setFormSerialNo('')
      setApplicationNo('')
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
          <span style={{ whiteSpace: 'nowrap' }}>Institute Code (5 digits) <span className="req">*</span></span>
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
          <span style={{ whiteSpace: 'nowrap' }}>Form Serial Number <span className="req">*</span></span>
          <input
            type="text"
            value={formSerialNo}
            onChange={(e) => {
              const cleaned = e.target.value.slice(0, 5).replace(/\D/g, '')
              setFormSerialNo(cleaned)
            }}
            placeholder="e.g. 12345"
            maxLength={5}
            pattern="\d{0,5}"
            required
            autoComplete="off"
          />
        </label>

        <label>
          <span style={{ whiteSpace: 'nowrap' }}>Application No <span className="req">*</span></span>
          <input
            type="text"
            value={applicationNo}
            onChange={(e) => {
              const cleaned = e.target.value.slice(0, 5).replace(/\D/g, '')
              setApplicationNo(cleaned)
            }}
            placeholder="e.g. 12345"
            maxLength={5}
            pattern="\d{0,5}"
            required
            autoComplete="off"
          />
        </label>

        <label>
          <span style={{ whiteSpace: 'nowrap' }}>First name <span className="req">*</span></span>
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
          <span style={{ whiteSpace: 'nowrap' }}>Last name <span className="req">*</span></span>
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
          <span style={{ whiteSpace: 'nowrap' }}>Mother Name <span className="req">*</span></span>
          <input
            type="text"
            value={motherName}
            onChange={(e) => setMotherName(e.target.value)}
            placeholder="e.g. Priya"
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
            placeholder={String(new Date().getFullYear())}
            autoComplete="off"
          />
        </label>

        <div style={{ gridColumn: '1 / -1', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
          <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
            Subjects (up to 8, optional)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            {Array.from(groupSubjectsByFamily(PREDEFINED_SUBJECTS).entries()).map(([family, familySubjects]) => (
              <div key={family}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text)' }}>
                  {family}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {familySubjects.map((sub) => (
                    <label key={sub.name} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={selectedSubjects.has(sub.name)}
                        onChange={(e) => {
                          const next = new Set(selectedSubjects)
                          if (e.target.checked) {
                            next.add(sub.name)
                          } else {
                            next.delete(sub.name)
                          }
                          setSelectedSubjects(next)
                        }}
                        disabled={busy}
                        style={{ cursor: 'pointer', flexShrink: 0, width: '16px', height: '16px' }}
                      />
                      <span style={{ flex: 1 }}>{sub.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <span className="muted small" style={{ marginTop: '1rem', display: 'block' }}>
            Select up to 8 subjects. Each is stored individually in the database.
          </span>
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
