import { useState, type ReactNode } from 'react'

export type DashboardTab =
  | 'overview'
  | 'institutes'
  | 'admins'
  | 'add'
  | 'students'
  | 'reports'
  | 'storage'

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
  section?: string
}

const tabs: TabDef[] = [
  { id: 'overview',    label: 'Dashboard',             icon: '🏠', section: 'Main' },
  { id: 'institutes',  label: 'Institutes',             icon: '🏫', section: 'Management' },
  { id: 'admins',      label: 'Pending Approvals',      icon: '✅' },
  { id: 'add',         label: 'Add Institute',          icon: '➕' },
  { id: 'students',    label: 'Students & Attendance',  icon: '👨‍🎓' },
  { id: 'reports',     label: 'Reports',                icon: '📑' },
  { id: 'storage',     label: 'Storage',                icon: '📦', section: 'System' },
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

  function renderNav() {
    const nodes: ReactNode[] = []
    let lastSection = ''
    for (const t of tabs) {
      if (t.section && t.section !== lastSection) {
        if (nodes.length > 0) nodes.push(<div key={`div-${t.section}`} className="dash-nav-divider" />)
        nodes.push(<div key={`lbl-${t.section}`} className="dash-nav-section-label">{t.section}</div>)
        lastSection = t.section
      }
      nodes.push(
        <button
          key={t.id}
          type="button"
          className={`dash-nav-item${activeTab === t.id ? ' is-active' : ''}`}
          onClick={() => onTab(t.id)}
        >
          <span className="dash-nav-item-icon" aria-hidden>{t.icon}</span>
          {t.label}
        </button>
      )
    }
    return nodes
  }

  return (
    <>
      {/* ── Government Portal Header ── */}
      <header className="gov-portal-header" role="banner">
        <div className="gov-emblem" aria-hidden>🏛️</div>
        <div className="gov-header-text">
          <div className="gov-header-authority">Government of Maharashtra</div>
          <div className="gov-header-title">MSCE Admin Portal</div>
          <div className="gov-header-subtitle">
            Maharashtra State Council of Examinations — Operations Console
          </div>
        </div>
        <div className="gov-header-right">
          <span className="gov-badge gov-badge-portal">Admin</span>
          <span className="gov-badge gov-badge-secure">🔒 Secure</span>
        </div>
      </header>

      {/* ── Dashboard Shell ── */}
      <div className="dash">
        <aside className="dash-sidebar" aria-label="Navigation">
          <div className="dash-sidebar-head">
            <div className="dash-portal-label">MSCE Portal</div>
            <div className="dash-portal-name">Admin Console</div>
            <div className="dash-portal-desc">Maharashtra State Examinations</div>
          </div>

          <nav className="dash-nav" aria-label="Main navigation">
            {renderNav()}
          </nav>

          <div className="dash-sidebar-foot">
            <div className="dash-user-label">Signed in as</div>
            <span className="dash-user-email" title={userEmail ?? ''}>
              {userEmail ?? '—'}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-block btn-sm"
              disabled={signingOut}
              aria-busy={signingOut}
              onClick={() => void handleSignOut()}
            >
              {signingOut ? '⏳ Signing out…' : '🚪 Sign Out'}
            </button>
          </div>
        </aside>

        <div className="dash-main">
          {/* ── Topbar ── */}
          <header className="dash-topbar">
            <div>
              <div className="dash-breadcrumb">
                <span>MSCE Portal</span>
                <span className="dash-breadcrumb-sep">›</span>
                <span className="dash-breadcrumb-current">
                  {currentTab?.icon} {currentTab?.label ?? 'Console'}
                </span>
              </div>
            </div>
            <div className="dash-topbar-right">
              <div className="dash-session-info" title="Sign-in applies to this browser tab only. Idle 30 minutes signs you out.">
                <span className="dash-session-dot" aria-hidden />
                Secured tab session
              </div>
            </div>
          </header>

          {/* ── Page Content ── */}
          <div className="dash-content">{children}</div>

          {/* ── Government Footer ── */}
          <footer className="gov-footer">
            <span>
              <span className="gov-footer-stripe">
                <span className="stripe-s" />
                <span className="stripe-w" />
                <span className="stripe-g" />
              </span>
              &nbsp;© Maharashtra State Council of Examinations (MSCE) — Restricted Access Portal
            </span>
            <span>NIC · Powered by Supabase · Version 2.0</span>
          </footer>
        </div>
      </div>
    </>
  )
}
