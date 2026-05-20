import { useRef, useState, type ReactNode } from 'react'
import { useDashChromeSync } from '../lib/syncDashChrome'
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_TEL } from '../../siteSupport'

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
  const headerRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const [signingOut, setSigningOut] = useState(false)
  const currentTab = tabs.find((x) => x.id === activeTab)

  useDashChromeSync(headerRef, navRef)

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
      <header ref={headerRef} className="gov-portal-header dash-shell-header" role="banner">
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

      <nav ref={navRef} className="dash-topnav" aria-label="Main navigation">
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
          <span className="gov-footer-support">
            Support:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            {' · '}
            <a href={`tel:${SUPPORT_PHONE_TEL}`}>{SUPPORT_PHONE}</a>
          </span>
        </footer>
      </main>
    </div>
  )
}
