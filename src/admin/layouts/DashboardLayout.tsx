import { useState, type ReactNode } from 'react'

export type DashboardTab =
  | 'overview'
  | 'admins'
  | 'institutes'
  | 'add'
  | 'students'
  | 'reports'

type Props = {
  userEmail: string | null
  activeTab: DashboardTab
  onTab: (t: DashboardTab) => void
  onSignOut: () => void | Promise<void>
  children: ReactNode
}

type TabDef = {
  id: DashboardTab
  label: string
  icon: string
}

const tabs: TabDef[] = [
  { id: 'overview', label: 'Dashboard', icon: '🏠' },
  { id: 'admins', label: 'Admins & Access', icon: '🔐' },
  { id: 'institutes', label: 'Institutes', icon: '🏫' },
  { id: 'add', label: 'Add Institute', icon: '➕' },
  { id: 'students', label: 'Students', icon: '👨‍🎓' },
  { id: 'reports', label: 'Reports', icon: '📑' },
]

export function DashboardLayout({ userEmail, activeTab, onTab, onSignOut, children }: Props) {
  const [signingOut, setSigningOut] = useState(false)
  const currentTab = tabs.find((x) => x.id === activeTab)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="dash-shell">
      <header className="gov-portal-header dash-shell-header" role="banner">
        <div className="gov-emblem" aria-hidden>
          🏛️
        </div>
        <div className="gov-header-text">
          <div className="gov-header-authority">Government of Maharashtra</div>
          <div className="gov-header-title">MSCE Admin Portal</div>
          <div className="gov-header-subtitle">Maharashtra State Council of Examinations</div>
        </div>
        <div className="gov-header-right dash-header-actions">
          <span className="gov-badge gov-badge-portal">Admin</span>
          <span className="gov-badge gov-badge-secure">🔒 Secure</span>
          <span className="dash-topnav-user" title={userEmail ?? ''}>
            {userEmail ?? '—'}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm dash-signout-btn"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            {signingOut ? '…' : 'Sign out'}
          </button>
        </div>
      </header>

      <nav className="dash-topnav" aria-label="Main navigation">
        <div className="dash-topnav-scroll">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dash-topnav-item${activeTab === t.id ? ' is-active' : ''}`}
              onClick={() => onTab(t.id)}
            >
              <span className="dash-nav-item-icon" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <div className="dash-topnav-page" aria-current="page">
          <span aria-hidden>{currentTab?.icon}</span> {currentTab?.label}
        </div>
      </nav>

      <main className="dash-main-full">
        <div className="dash-content-full">{children}</div>
        <footer className="gov-footer gov-footer-full">
          <span>
            <span className="gov-footer-stripe">
              <span className="stripe-s" />
              <span className="stripe-w" />
              <span className="stripe-g" />
            </span>
            &nbsp;© Maharashtra State Council of Examinations (MSCE)
          </span>
          <span>Powered by Supabase</span>
        </footer>
      </main>
    </div>
  )
}
