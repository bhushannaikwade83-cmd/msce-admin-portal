import { useEffect, useState, type FormEvent } from 'react'
import { getSupabase } from '../lib/supabase'
import { subjectsFromStudent } from '../lib/studentSubjects'
import { ModalPortal } from './ModalPortal'

type StudentRow = Record<string, unknown> & { id: string }

function pickName(row: StudentRow): { first: string; middle: string; last: string } {
  const fn = String(row.first_name ?? '').trim()
  const mn = String(row.middle_name ?? '').trim()
  const ln = String(row.last_name ?? '').trim()
  if (fn || ln) return { first: fn, middle: mn, last: ln }
  const full = String(row.name ?? row.student_name ?? '').trim()
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', middle: '', last: '' }
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' }
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] }
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] }
}

type Props = {
  student: StudentRow
  instituteLabel: string
  onClose: () => void
  onSaved: () => void
}

export function EditStudentModal({ student, instituteLabel, onClose, onSaved }: Props) {
  const initial = pickName(student)
  const [firstName, setFirstName] = useState(initial.first)
  const [middleName, setMiddleName] = useState(initial.middle)
  const [lastName, setLastName] = useState(initial.last)
  const [year, setYear] = useState(String(student.year ?? `Year ${new Date().getFullYear()}`).trim())
  const [subjects, setSubjects] = useState<Record<number, string>>(() => {
    const subs: Record<number, string> = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', 8: '' }
    for (let i = 1; i <= 8; i++) {
      subs[i] = String(student[`sub${i}`] ?? '').trim()
    }
    return subs
  })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmClearPhoto, setConfirmClearPhoto] = useState(false)

  useEffect(() => {
    const n = pickName(student)
    setFirstName(n.first)
    setMiddleName(n.middle)
    setLastName(n.last)
    setYear(String(student.year ?? `Year ${new Date().getFullYear()}`).trim())
    const subs: Record<number, string> = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', 8: '' }
    for (let i = 1; i <= 8; i++) {
      subs[i] = String(student[`sub${i}`] ?? '').trim()
    }
    setSubjects(subs)
    setFormError(null)
  }, [student])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const fn = firstName.trim()
    const mn = middleName.trim()
    const ln = lastName.trim()
    if (!fn || !ln) {
      setFormError('First and last name are required.')
      return
    }
    const fullName = `${fn} ${mn} ${ln}`.replace(/\s+/g, ' ').trim()
    const subjList = Object.values(subjects).filter(s => s.trim() !== '')

    setBusy(true)
    try {
      const sb = getSupabase()
      const patch: Record<string, unknown> = {
        name: fullName,
        first_name: fn,
        middle_name: mn || null,
        last_name: ln,
        year: year.trim() || `Year ${new Date().getFullYear()}`,
        updated_at: new Date().toISOString(),
        subjects: subjList,
        subject: subjList.length > 0 ? subjList.join(', ') : null,
      }

      // Update individual sub1-sub8 fields
      for (let i = 1; i <= 8; i++) {
        patch[`sub${i}`] = subjects[i]?.trim() || null
      }

      const { error } = await sb.from('students').update(patch).eq('id', student.id)
      if (error) throw error
      onSaved()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleClearPhoto() {
    setFormError(null)
    setBusy(true)
    try {
      const sb = getSupabase()
      // Move current photo to backup columns before clearing
      const patch: Record<string, unknown> = {
        original_face_photo_url: student.face_photo_url || null,
        original_registration_photo_path: student.registration_photo_path || null,
        face_photo_url: null,
        registration_photo_path: null,
        face_embedding: null,
        face_photo_changed_once: true,
        face_photo_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error } = await sb.from('students').update(patch).eq('id', student.id)
      if (error) throw error
      setConfirmClearPhoto(false)
      onSaved()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const hasPhoto = !!(student.face_photo_url || student.registration_photo_path)

  const roll =
    String(student.sr_no ?? student.user_id ?? student.roll_no ?? '').trim() || '—'

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal
        aria-labelledby="edit-student-title"
        onClick={onClose}
      >
        <div className="modal-panel card-elevated" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 id="edit-student-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              Edit student
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
              ✕
            </button>
          </div>
          <p className="modal-subtitle">
            <strong>{instituteLabel}</strong>
            <br />
            Roll <code>{roll}</code> · ID <code className="tiny">{student.id}</code>
          </p>
          {formError ? (
            <p className="error" style={{ marginTop: '0.75rem' }}>
              {formError}
            </p>
          ) : null}
          <form className="modal-form" onSubmit={(e) => void handleSubmit(e)} autoComplete="off">
            <div className="field">
              <label htmlFor="edit-stu-first">
                First name <span className="req">*</span>
              </label>
              <input
                id="edit-stu-first"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                disabled={busy}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-stu-middle">Middle name</label>
              <input
                id="edit-stu-middle"
                type="text"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-stu-last">
                Last name <span className="req">*</span>
              </label>
              <input
                id="edit-stu-last"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                disabled={busy}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-stu-year">Year / batch label</label>
              <input
                id="edit-stu-year"
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                disabled={busy}
              />
            </div>
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
              <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
                Subjects (1-8)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i}>
                    <label htmlFor={`edit-stu-sub${i}`} style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                      Subject {i}
                    </label>
                    <input
                      id={`edit-stu-sub${i}`}
                      type="text"
                      value={subjects[i] ?? ''}
                      onChange={(e) => setSubjects({ ...subjects, [i]: e.target.value })}
                      placeholder={`e.g. GCC TBC ENG ${30 + i}`}
                      disabled={busy}
                      style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                    />
                  </div>
                ))}
              </div>
              <span className="muted small" style={{ marginTop: '0.5rem', display: 'block' }}>
                Leave empty fields blank. Each subject is stored individually in the database.
              </span>
            </div>
            <div className="modal-form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save to database'}
              </button>
            </div>
          </form>

          {hasPhoto && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '1rem', paddingTop: '1rem' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <strong>Photo Registration</strong>
                <p className="muted small" style={{ margin: '0.5rem 0 0' }}>
                  Clear photo and face embedding to allow student to retake registration
                </p>
              </div>
              {!confirmClearPhoto ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => setConfirmClearPhoto(true)}
                  style={{ color: 'var(--color-warn)' }}
                >
                  🗑️ Clear photo &amp; retake registration
                </button>
              ) : (
                <div style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: '0.375rem' }}>
                  <p className="small" style={{ margin: '0 0 0.5rem' }}>
                    Clear all photos and face embedding? Student can retake from the mobile app.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: 'var(--color-danger)', color: 'white', border: 'none' }}
                      disabled={busy}
                      onClick={() => void handleClearPhoto()}
                    >
                      {busy ? 'Clearing…' : 'Yes, clear photo'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => setConfirmClearPhoto(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
