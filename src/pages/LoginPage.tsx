import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setBusy(true)
    const trimmed = email.trim()
    const { error } = await signIn(trimmed, password)
    setPassword('')
    setBusy(false)
    if (error) setMessage(error.message)
  }

  return (
    <div className="login-page">
      {/* ── Government Header ── */}
      <header className="login-gov-header">
        <div className="gov-emblem" aria-hidden>🏛️</div>
        <div className="gov-header-text">
          <div className="gov-header-authority">Government of Maharashtra</div>
          <div className="gov-header-title">MSCE Admin Portal</div>
        </div>
        <div className="gov-header-right">
          <span className="gov-badge gov-badge-portal">Restricted Access</span>
        </div>
      </header>

      <div className="login-body">
        {/* ── Left Brand Panel ── */}
        <div className="login-brand">
          <div className="login-brand-inner">
            <div className="login-logo" aria-hidden>🏛️</div>
            <div className="login-brand-authority">Government of Maharashtra</div>
            <h1 className="login-brand-title">MSCE<br />Admin Portal</h1>
            <p className="login-brand-sub">Maharashtra State Council of Examinations</p>

            <ul className="login-feature-list">
              <li>
                <span className="login-feature-icon" aria-hidden>✔</span>
                Create institute and admin setup details for the mobile app
              </li>
              <li>
                <span className="login-feature-icon" aria-hidden>🏫</span>
                Manage institute directory and website onboarding data
              </li>
              <li>
                <span className="login-feature-icon" aria-hidden>🔒</span>
                Row-level security enforced via Supabase Auth session
              </li>
              <li>
                <span className="login-feature-icon" aria-hidden>👤</span>
                Single super admin account for website access
              </li>
              <li>
                <span className="login-feature-icon" aria-hidden>📦</span>
                Storage management for uploaded assets
              </li>
            </ul>
          </div>
        </div>

        {/* ── Right Login Panel ── */}
        <div className="login-panel">
          <div className="login-card">
            <div className="login-card-header">
              <div className="login-card-emblem" aria-hidden>🔐</div>
              <h2 className="login-heading">Authorised Sign In</h2>
              <p className="login-lead">Use the website admin account credentials to access the portal.</p>
            </div>

            <form
              onSubmit={onSubmit}
              className="login-form"
              method="post"
              action="#"
              autoComplete="on"
            >
              <label className="login-label">
                <span>Official Email Address</span>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="admin@gmail.com"
                  required
                />
              </label>
              <label className="login-label">
                <span>Password</span>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </label>

              {message ? (
                <div className="login-alert" role="alert">
                  ⚠️ {message}
                </div>
              ) : null}

              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? '⏳ Verifying credentials…' : '🔓 Access Portal'}
              </button>
            </form>
          </div>

          <p className="login-foot">
            🔒&nbsp;This is a restricted government portal. Unauthorised access is
            strictly prohibited and may be subject to legal action under the IT Act, 2000.
          </p>
          <p className="login-foot login-foot-secondary">
            Your session is stored only in this browser tab. Opening the same link in another tab
            requires signing in again. After 30 minutes without activity you are signed out automatically.
          </p>
        </div>
      </div>
    </div>
  )
}
