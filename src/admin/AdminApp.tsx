import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthProvider } from './context/auth-context'
import { PortalAccessProvider, usePortalAccess } from './context/portal-access-context'
import { useAuth } from './hooks/useAuth'
import { DashboardLayout, type DashboardTab } from './layouts/DashboardLayout'
import { LoginPage } from './pages/LoginPage'
import { AddInstituteForm } from './components/AddInstituteForm'
import { InstituteAdminsSection } from './components/InstituteAdminsSection'
import { InstituteInstructorsSection } from './components/InstituteInstructorsSection'
import { InstituteList } from './components/InstituteList'
import { OverviewPanel } from './components/OverviewPanel'
import { StudentsSection } from './components/StudentsSection'
import { ReportsSection } from './components/ReportsSection'
import { AttendanceIntegritySection } from './components/AttendanceIntegritySection'
import './index.css'
import './App.css'

// MSCE Admin Portal — Maharashtra State Council of Examinations
const ACTIVE_TAB_STORAGE_KEY = 'msce.admin.activeTab'

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="state-screen">
      <div className="state-card card-elevated">
        <h1>⚙️ Configuration Required</h1>
        <p className="state-text">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your{' '}
          <code>.env.local</code> file (same values as the mobile app).
        </p>
        <p className="state-detail">{message}</p>
      </div>
    </div>
  )
}

function LoadingScreen({ message = 'Verifying session…' }: { message?: string }) {
  return (
    <div className="state-screen">
      <div className="loading-spinner" aria-label="Loading" />
      <p className="state-muted">{message}</p>
    </div>
  )
}

function PortalAccessDenied({ message, email }: { message: string; email: string | null }) {
  const { signOut } = useAuth()
  return (
    <div className="state-screen">
      <div className="state-card card-elevated">
        <h1>Access not allowed</h1>
        <p className="state-text">{message}</p>
        {email ? <p className="state-detail muted small">Signed in as {email}</p> : null}
        <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}

function TabPanel({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  return (
    <div hidden={!active} aria-hidden={!active}>
      {children}
    </div>
  )
}

function loadStoredAdminTab(): DashboardTab {
  if (typeof window === 'undefined') return 'overview'
  const raw = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)
  switch (raw) {
    case 'overview':
    case 'admins':
    case 'instructors':
    case 'institutes':
    case 'add':
    case 'students':
    case 'integrity':
    case 'reports':
      return raw
    default:
      return 'overview'
  }
}

function AuthenticatedApp() {
  const { user, loading, configError, signOut } = useAuth()
  const portal = usePortalAccess()
  const [tab, setTab] = useState<DashboardTab>(() => loadStoredAdminTab())
  const [instituteReload, setInstituteReload] = useState(0)
  const [studentsJumpInstituteId, setStudentsJumpInstituteId] = useState<string | null>(null)
  const [reportsJumpInstituteId, setReportsJumpInstituteId] = useState<string | null>(null)
  const [mountedTabs, setMountedTabs] = useState<DashboardTab[]>(['overview'])

  const handleStudentsJumpHandled = useCallback(() => setStudentsJumpInstituteId(null), [])
  const handleReportsJumpHandled = useCallback(() => setReportsJumpInstituteId(null), [])

  const readOnly = portal.readOnly
  const allowedTabs = portal.allowedTabs
  const visibleTabs = useMemo(
    () => allowedTabs,
    [allowedTabs],
  )

  useEffect(() => {
    if (portal.mode === 'district_viewer' && !allowedTabs.includes(tab)) {
      setTab('institutes')
    }
  }, [portal.mode, allowedTabs, tab])

  useEffect(() => {
    if (!visibleTabs.includes(tab)) return
    setMountedTabs((prev) => (prev.includes(tab) ? prev : [...prev, tab]))
  }, [tab, visibleTabs])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab)
  }, [tab])

  if (configError) {
    return <ConfigErrorScreen message={configError} />
  }

  if (loading || portal.mode === 'loading') {
    return <LoadingScreen message={loading ? 'Verifying session…' : 'Checking portal access…'} />
  }

  if (!user) {
    return <LoginPage />
  }

  if (portal.mode === 'unauthorized') {
    return (
      <PortalAccessDenied
        message={portal.message ?? 'This account cannot use the MSCE admin portal.'}
        email={user.email ?? null}
      />
    )
  }

  return (
    <DashboardLayout
      userEmail={user.email ?? null}
      districtLabel={portal.districtName}
      readOnly={readOnly}
      allowedTabs={allowedTabs}
      activeTab={tab}
      onTab={setTab}
      onSignOut={signOut}
    >
      {visibleTabs.includes('overview') && mountedTabs.includes('overview') ? (
        <TabPanel active={tab === 'overview'}>
          <OverviewPanel />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('admins') && mountedTabs.includes('admins') ? (
        <TabPanel active={tab === 'admins'}>
          <InstituteAdminsSection embedded />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('instructors') && mountedTabs.includes('instructors') ? (
        <TabPanel active={tab === 'instructors'}>
          <InstituteInstructorsSection embedded />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('institutes') && mountedTabs.includes('institutes') ? (
        <TabPanel active={tab === 'institutes'}>
          <InstituteList
            reloadToken={instituteReload}
            embedded
            readOnly={readOnly}
            onAddInstitute={readOnly ? undefined : () => setTab('add')}
          />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('add') && mountedTabs.includes('add') ? (
        <TabPanel active={tab === 'add'}>
          <AddInstituteForm onCreated={() => setInstituteReload((n) => n + 1)} embedded />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('students') && mountedTabs.includes('students') ? (
        <TabPanel active={tab === 'students'}>
          <StudentsSection
            embedded
            readOnly={readOnly}
            jumpToInstituteId={studentsJumpInstituteId}
            onJumpToInstituteHandled={handleStudentsJumpHandled}
          />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('integrity') && mountedTabs.includes('integrity') ? (
        <TabPanel active={tab === 'integrity'}>
          <AttendanceIntegritySection
            embedded
            onOpenInstitute={(instituteId) => {
              setStudentsJumpInstituteId(instituteId)
              setTab('students')
            }}
          />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('reports') && mountedTabs.includes('reports') ? (
        <TabPanel active={tab === 'reports'}>
          <ReportsSection
            embedded
            readOnly={readOnly}
            jumpToInstituteId={reportsJumpInstituteId}
            onJumpToInstituteHandled={handleReportsJumpHandled}
          />
        </TabPanel>
      ) : null}
    </DashboardLayout>
  )
}

export default function AdminApp() {
  return (
    <AuthProvider>
      <PortalAccessProvider>
        <AuthenticatedApp />
      </PortalAccessProvider>
    </AuthProvider>
  )
}
