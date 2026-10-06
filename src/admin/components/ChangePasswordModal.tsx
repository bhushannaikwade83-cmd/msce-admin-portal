import { useState, type FormEvent } from 'react'
import { getSupabase } from '../lib/supabase'

type Props = {
  userEmail: string | null
  onClose: () => void
}

export function ChangePasswordModal({ userEmail, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (!newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all fields' })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters' })
      return
    }

    setBusy(true)
    try {
      const sb = getSupabase()

      // First, re-authenticate with current password to verify it's correct
      const { error: authError } = await sb.auth.signInWithPassword({
        email: userEmail || '',
        password: currentPassword,
      })

      if (authError) {
        setMessage({ type: 'error', text: 'Current password is incorrect' })
        setBusy(false)
        return
      }

      // Update password
      const { error: updateError } = await sb.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        setMessage({ type: 'error', text: `Error: ${updateError.message}` })
      } else {
        setMessage({ type: 'success', text: 'Password changed successfully!' })
        setTimeout(() => onClose(), 2000)
      }
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🔐 Change Password</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={(e) => void onSubmit(e)} className="form-grid">
            <label>
              <span>Current Password <span className="req">*</span></span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                required
                disabled={busy}
                autoComplete="current-password"
              />
            </label>

            <label>
              <span>New Password <span className="req">*</span></span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                required
                disabled={busy}
                autoComplete="new-password"
              />
            </label>

            <label>
              <span>Confirm New Password <span className="req">*</span></span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                disabled={busy}
                autoComplete="new-password"
              />
            </label>

            {message && (
              <div
                className={message.type === 'error' ? 'form-error' : 'form-success'}
                role="alert"
              >
                {message.type === 'error' ? '⚠️' : '✅'} {message.text}
              </div>
            )}

            <div className="form-actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy}
              >
                {busy ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
