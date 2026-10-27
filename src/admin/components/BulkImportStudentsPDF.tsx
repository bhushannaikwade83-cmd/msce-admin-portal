import { useState, useRef, type FormEvent } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { getSupabase } from '../lib/supabase'

// Set worker for PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

interface ExtractedStudent {
  student_name: string
  mother_name: string
  institute_id: string
  application_no: string
  form_serial_no: string
  mobile_no: string
  email: string
  gender: string
  educational_qualification: string
  aadhar_district: string
  aadhar_taluka: string
  sr_no: string
  fname: string
  lname: string
}

type Props = {
  onImported: () => void
}

export function BulkImportStudentsPDF({ onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<ExtractedStudent[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])

  // Extract text from PDF using pdfjs-dist
  async function extractTextFromPDF(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
          let fullText = ''

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum)
            const textContent = await page.getTextContent()
            const pageText = textContent.items.map((item: any) => item.str).join(' ')
            fullText += pageText + '\n'
          }

          resolve(fullText)
        } catch (error) {
          reject(error)
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  function parseFormData(text: string): ExtractedStudent | null {
    try {
      // Extract fields from form text using regex patterns
      const extractField = (pattern: RegExp): string => {
        const match = text.match(pattern)
        return match ? match[1].trim() : ''
      }

      const studentName = extractField(/STUDENT NAME:\s*(.+?)(?:\n|MOTHER|$)/i) ||
                         extractField(/Student Name:\s*(.+?)(?:\n|Mother|$)/i)
      const motherName = extractField(/MOTHER NAME:\s*(.+?)(?:\n|GENDER|$)/i) ||
                        extractField(/Mother Name:\s*(.+?)(?:\n|Gender|$)/i)
      const instituteCode = extractField(/INSTITUTE CODE:\s*(.+?)(?:\n|APPLICATION|$)/i) ||
                           extractField(/Institute Code:\s*(.+?)(?:\n|Application|$)/i)
      const applicationNo = extractField(/APPLICATION NUMBER:\s*(.+?)(?:\n|FORMSERIAL|$)/i) ||
                           extractField(/Application Number:\s*(.+?)(?:\n|Form|$)/i)
      const formSerialNo = extractField(/FORMSERIAL NO:\s*(.+?)(?:\n|STUDENT|$)/i) ||
                          extractField(/Form Serial No:\s*(.+?)(?:\n|Student|$)/i)
      const mobile = extractField(/MOBILE NUMBER:\s*(.+?)(?:\n|EMAIL|$)/i) ||
                    extractField(/Mobile:\s*(.+?)(?:\n|Email|$)/i)
      const email = extractField(/EMAIL:\s*(.+?)(?:\n|GENDER|$)/i) ||
                   extractField(/Email:\s*(.+?)(?:\n|Gender|$)/i)
      const gender = extractField(/GENDER:\s*(.+?)(?:\n|MOBILE|$)/i) ||
                    extractField(/Gender:\s*(.+?)(?:\n|Mobile|$)/i)
      const qualification = extractField(/EDICATIONAL QUALIFICATION:\s*(.+?)(?:\n|HANDICAPPED|$)/i) ||
                           extractField(/Educational Qualification:\s*(.+?)(?:\n|Handicapped|$)/i)
      const district = extractField(/AADHAR CARD DISTRICT:\s*(.+?)(?:\n|TALUKA|$)/i) ||
                      extractField(/Aadhar District:\s*(.+?)(?:\n|Taluka|$)/i)
      const taluka = extractField(/AADHAR CARD TALUKA:\s*(.+?)(?:\n|Application|$)/i) ||
                    extractField(/Aadhar Taluka:\s*(.+?)(?:\n|Application|$)/i)

      if (!studentName || !instituteCode) {
        return null
      }

      // Parse student name into fname and lname
      const names = studentName.split(' ')
      const lname = names.pop() || ''
      const fname = names.join(' ')

      return {
        student_name: studentName,
        mother_name: motherName,
        institute_id: instituteCode,
        application_no: applicationNo,
        form_serial_no: formSerialNo,
        mobile_no: mobile,
        email: email,
        gender: gender,
        educational_qualification: qualification,
        aadhar_district: district,
        aadhar_taluka: taluka,
        sr_no: applicationNo.slice(-3) || '', // Last 3 digits of application number
        fname: fname,
        lname: lname,
      }
    } catch {
      return null
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setBusy(true)
    try {
      setErr(null)
      setMsg(null)
      const extractedStudents: ExtractedStudent[] = []

      for (const file of files) {
        try {
          const text = await extractTextFromPDF(file)
          const student = parseFormData(text)
          if (student) {
            extractedStudents.push(student)
          }
        } catch (e) {
          console.error(`Failed to extract from ${file.name}:`, e)
        }
      }

      if (extractedStudents.length === 0) {
        setErr(`Could not extract student data from ${files.length} PDF(s). Make sure PDFs are exam forms with proper text.`)
        setBusy(false)
        return
      }

      setPreview(extractedStudents)
      setUploadedFiles(files)
      setShowPreview(true)
      setMsg(`✅ Extracted ${extractedStudents.length} students from ${files.length} PDF(s). Review and click "Import" to save.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
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
        if (!row.fname && !row.lname) validationErrors.push(`Form ${idx + 1}: Missing student name`)
        if (!row.institute_id) validationErrors.push(`Form ${idx + 1}: Missing institute code`)
      })

      if (validationErrors.length > 0) {
        setErr(`Validation errors:\n${validationErrors.slice(0, 5).join('\n')}${validationErrors.length > 5 ? `\n... and ${validationErrors.length - 5} more` : ''}`)
        setBusy(false)
        return
      }

      // Insert in batches
      const batchSize = 50
      let inserted = 0
      let skipped = 0

      for (let i = 0; i < preview.length; i += batchSize) {
        const batch = preview.slice(i, i + batchSize).map((row) => ({
          fname: row.fname || null,
          lname: row.lname || null,
          student_name: row.student_name,
          mother_name: row.mother_name || null,
          institute_id: row.institute_id,
          sr_no: row.sr_no,
          form_serial_no: row.form_serial_no || null,
          application_no: row.application_no || null,
          year: new Date().getFullYear(),
        }))

        const { error: insertErr, data } = await sb.from('students').insert(batch).select('id')

        if (insertErr) {
          if (insertErr.message.includes('duplicate') || insertErr.code === '23505') {
            skipped += batch.length
          } else {
            throw new Error(`Batch ${Math.floor(i / batchSize) + 1}: ${insertErr.message}`)
          }
        } else {
          inserted += data?.length || batch.length
        }
      }

      let resultMsg = `✅ Successfully imported ${inserted} students from PDFs`
      if (skipped > 0) resultMsg += ` (${skipped} duplicates skipped)`
      resultMsg += '!'

      setMsg(resultMsg)
      setPreview([])
      setUploadedFiles([])
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
        <h3>📄 Bulk Import Students from PDFs</h3>
        <p className="muted small">Upload exam form PDFs to automatically extract student data and import to database</p>
      </div>

      <form className="bulk-import-form" onSubmit={handleImport} autoComplete="off">
        <div className="field">
          <label htmlFor="pdf-files">
            PDF Files <span className="req">*</span>
          </label>
          <input
            id="pdf-files"
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            disabled={busy || showPreview}
            multiple
            required
          />
          <span className="field-hint">
            Upload one or more exam form PDFs (GCC-TBC, etc.). Data will be automatically extracted.
          </span>
        </div>

        {showPreview && preview.length > 0 ? (
          <>
            <div className="preview-section">
              <p className="form-section-label">Extracted Data ({preview.length} students)</p>
              <div className="table-wrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Mother Name</th>
                      <th>Institute ID</th>
                      <th>Application No</th>
                      <th>Mobile</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 15).map((row, idx) => (
                      <tr key={idx}>
                        <td className="small">{row.student_name}</td>
                        <td className="small">{row.mother_name}</td>
                        <td>{row.institute_id}</td>
                        <td className="small">{row.application_no}</td>
                        <td className="small">{row.mobile_no || '—'}</td>
                        <td className="small" style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.email || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 15 ? (
                <p className="muted small" style={{ marginTop: '0.5rem' }}>
                  ... and {preview.length - 15} more students
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
                  setUploadedFiles([])
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
          <strong>📋 How it Works:</strong>
        </p>
        <ul className="small" style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>
          <li>Upload one or more GCC-TBC exam form PDFs</li>
          <li>System automatically extracts: Student Name, Mother Name, Institute Code, Application Number, etc.</li>
          <li>Review extracted data in preview table</li>
          <li>Click "Import All" to save 100+ students in seconds!</li>
          <li>Duplicate entries (same institute + application no) are automatically skipped</li>
        </ul>
      </div>
    </div>
  )
}
