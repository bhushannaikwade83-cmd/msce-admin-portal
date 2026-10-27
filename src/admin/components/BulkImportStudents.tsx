import { useState, useRef, type FormEvent } from 'react'
import { getSupabase } from '../lib/supabase'

interface StudentRow {
  fname: string
  mname?: string
  lname: string
  student_name: string
  mother_name?: string
  institute_id: string
  sr_no: string
  form_serial_no?: string
  application_no?: string
  year?: number
  subjects?: string[]
}

type Props = {
  onImported: () => void
}

export function BulkImportStudents({ onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<StudentRow[]>([])
  const [showPreview, setShowPreview] = useState(false)

  function parseCSV(text: string): StudentRow[] {
    const lines = text.trim().split('\n')
    if (lines.length < 2) throw new Error('CSV must have header and at least one data row')

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const rows: StudentRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim())
      if (values.length < 5) continue

      const fname = values[headers.indexOf('fname')] || ''
      const lname = values[headers.indexOf('lname')] || ''
      const mname = values[headers.indexOf('mname')] || ''
      const student_name = values[headers.indexOf('student_name')] || `${fname} ${lname}`.trim()

      rows.push({
        fname,
        mname,
        lname,
        student_name,
        mother_name: values[headers.indexOf('mother_name')] || undefined,
        institute_id: values[headers.indexOf('institute_id')] || '',
        sr_no: values[headers.indexOf('sr_no')] || '',
        form_serial_no: values[headers.indexOf('form_serial_no')] || undefined,
        application_no: values[headers.indexOf('application_no')] || undefined,
        year: parseInt(values[headers.indexOf('year')]) || new Date().getFullYear(),
        subjects: values[headers.indexOf('subjects')]?.split('|').map(s => s.trim()).filter(Boolean),
      })
    }

    return rows
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setErr(null)
      setMsg(null)
      const text = await file.text()
      const rows = parseCSV(text)

      if (rows.length === 0) {
        setErr('No valid data rows found in CSV')
        return
      }

      setPreview(rows)
      setShowPreview(true)
      setMsg(`✅ Parsed ${rows.length} students from CSV. Review and click "Import" to save.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleImport(e: FormEvent) {
    e.preventDefault()
    if (preview.length === 0) {
      setErr('No data to import')
      return
    }

    setBusy(true)
    try {
      setErr(null)
      const sb = getSupabase()

      // Validate all rows
      const validationErrors: string[] = []
      preview.forEach((row, idx) => {
        if (!row.fname && !row.lname) validationErrors.push(`Row ${idx + 1}: Missing fname or lname`)
        if (!row.institute_id) validationErrors.push(`Row ${idx + 1}: Missing institute_id`)
        if (!row.sr_no) validationErrors.push(`Row ${idx + 1}: Missing sr_no`)
      })

      if (validationErrors.length > 0) {
        setErr(`Validation errors:\n${validationErrors.slice(0, 10).join('\n')}${validationErrors.length > 10 ? `\n... and ${validationErrors.length - 10} more` : ''}`)
        setBusy(false)
        return
      }

      // Insert in batches
      const batchSize = 100
      let inserted = 0
      let skipped = 0

      for (let i = 0; i < preview.length; i += batchSize) {
        const batch = preview.slice(i, i + batchSize).map(row => ({
          fname: row.fname || null,
          mname: row.mname || null,
          lname: row.lname || null,
          student_name: row.student_name,
          mother_name: row.mother_name || null,
          institute_id: row.institute_id,
          sr_no: row.sr_no,
          form_serial_no: row.form_serial_no || null,
          application_no: row.application_no || null,
          year: row.year || new Date().getFullYear(),
        }))

        const { error: insertErr, data } = await sb.from('students').insert(batch).select('id')

        if (insertErr) {
          // Check if it's a duplicate error (ignore and continue)
          if (insertErr.message.includes('duplicate') || insertErr.code === '23505') {
            skipped += batch.length
          } else {
            throw new Error(`Batch ${Math.floor(i / batchSize) + 1}: ${insertErr.message}`)
          }
        } else {
          inserted += (data?.length || batch.length)
        }
      }

      let resultMsg = `✅ Successfully imported ${inserted} students`
      if (skipped > 0) resultMsg += ` (${skipped} duplicates skipped)`
      resultMsg += '!'

      setMsg(resultMsg)
      setPreview([])
      setShowPreview(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onImported()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card bulk-import-panel">
      <div className="card-head">
        <h3>📥 Bulk Import Students</h3>
        <p className="muted small">Upload a CSV file to add multiple students at once (fast bulk entry)</p>
      </div>

      <form className="bulk-import-form" onSubmit={handleImport} autoComplete="off">
        <div className="field">
          <label htmlFor="csv-file">
            CSV File <span className="req">*</span>
          </label>
          <input
            id="csv-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            disabled={busy || showPreview}
            required
          />
          <span className="field-hint">
            Required columns: fname, lname, institute_id, sr_no | Optional: mname, student_name, mother_name, form_serial_no, application_no, year, subjects
          </span>
        </div>

        {showPreview && preview.length > 0 ? (
          <>
            <div className="preview-section">
              <p className="form-section-label">Preview ({preview.length} students)</p>
              <div className="table-wrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Sr No</th>
                      <th>Institute ID</th>
                      <th>Mother Name</th>
                      <th>Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 20).map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.student_name}</td>
                        <td>{row.sr_no}</td>
                        <td>{row.institute_id}</td>
                        <td className="muted small">{row.mother_name || '—'}</td>
                        <td>{row.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 20 ? (
                <p className="muted small" style={{ marginTop: '0.5rem' }}>
                  ... and {preview.length - 20} more students
                </p>
              ) : null}
            </div>

            <div className="modal-form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  setShowPreview(false)
                  setPreview([])
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Importing...' : `✅ Import All (${preview.length})`}
              </button>
            </div>
          </>
        ) : null}
      </form>

      {err ? <p className="error" style={{ marginTop: '1rem' }}>{err}</p> : null}
      {msg ? <p className="success" style={{ marginTop: '1rem' }}>{msg}</p> : null}

      <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: '0.375rem' }}>
        <p className="small" style={{ marginBottom: '0.5rem' }}>
          <strong>📋 CSV Format Example:</strong>
        </p>
        <pre style={{ fontSize: '0.8rem', overflow: 'auto', backgroundColor: '#000', color: '#0f0', padding: '0.75rem', borderRadius: '0.25rem', maxHeight: '200px' }}>
{`fname,mname,lname,student_name,sr_no,institute_id,mother_name,year
राज,नारायण,शर्मा,राज शर्मा,001,inst-001,सुनीता शर्मा,2026
प्रिया,,पटेल,प्रिया पटेल,002,inst-001,मीरा पटेल,2026
अमित,कुमार,कुलकर्णी,अमित कुलकर्णी,003,inst-002,संगीता कुलकर्णी,2026`}
        </pre>
        <p className="muted small" style={{ marginTop: '0.5rem' }}>
          💡 Tip: For multiple subjects per student, use pipe separator: "Marathi|English|Hindi"<br/>
          Duplicates (same institute_id + sr_no) will be automatically skipped.
        </p>
      </div>
    </div>
  )
}
