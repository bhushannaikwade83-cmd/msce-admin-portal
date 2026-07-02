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
import { QuickSearchSection } from './components/QuickSearchSection'
import { ReportsSection } from './components/ReportsSection'
import { AttendanceIntegritySection } from './components/AttendanceIntegritySection'
import { ExamsSection } from './components/ExamsSection'
import { STRINGS } from './constants/strings'
import './index.css'
import './App.css'

// MSCE Admin Portal — Maharashtra State Council of Examinations
const ACTIVE_TAB_STORAGE_KEY = 'msce.admin.activeTab'

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="state-screen">
      <div className="state-card card-elevated">
        <h1>{STRINGS.config.title}</h1>
        <p className="state-text">
          {STRINGS.config.instructions}
        </p>
        <p className="state-detail">{message}</p>
      </div>
    </div>
  )
}

function LoadingScreen({ message = STRINGS.loading.verifyingSession }: { message?: string }) {
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
        <h1>{STRINGS.auth.accessDenied}</h1>
        <p className="state-text">{message}</p>
        {email ? <p className="state-detail muted small">{STRINGS.auth.signedInAs} {email}</p> : null}
        <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => void signOut()}>
          {STRINGS.auth.signOut}
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
    case 'exams':
    case 'students':
    case 'quicksearch':
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

  const handleStudentsJumpHandled = useCallback(() => setStudentsJumpInstituteId(null), [])
  const handleReportsJumpHandled = useCallback(() => setReportsJumpInstituteId(null), [])

  const readOnly = portal.readOnly
  const allowedTabs = portal.allowedTabs
  const visibleTabs = useMemo(
    () => allowedTabs,
    [allowedTabs],
  )
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0] ?? 'overview'

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab)
  }, [activeTab])

  if (configError) {
    return <ConfigErrorScreen message={configError} />
  }

  if (loading || portal.mode === 'loading') {
    return <LoadingScreen message={loading ? STRINGS.loading.verifyingSession : STRINGS.loading.checkingAccess} />
  }

  if (!user) {
    return <LoginPage />
  }

  if (portal.mode === 'unauthorized') {
    return (
      <PortalAccessDenied
        message={portal.message ?? STRINGS.auth.unauthorizedPortal}
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
      activeTab={activeTab}
      onTab={setTab}
      onSignOut={signOut}
    >
      {visibleTabs.includes('overview') && activeTab === 'overview' ? (
        <TabPanel active>
          <OverviewPanel />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('admins') && activeTab === 'admins' ? (
        <TabPanel active>
          <InstituteAdminsSection embedded />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('instructors') && activeTab === 'instructors' ? (
        <TabPanel active>
          <InstituteInstructorsSection embedded />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('institutes') && activeTab === 'institutes' ? (
        <TabPanel active>
          <InstituteList
            reloadToken={instituteReload}
            embedded
            readOnly={readOnly}
            onAddInstitute={readOnly ? undefined : () => setTab('add')}
          />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('add') && activeTab === 'add' ? (
        <TabPanel active>
          <AddInstituteForm onCreated={() => setInstituteReload((n) => n + 1)} embedded />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('exams') && activeTab === 'exams' ? (
        <TabPanel active>
          <ExamsSection embedded readOnly={readOnly} />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('students') && activeTab === 'students' ? (
        <TabPanel active>
          <StudentsSection
            embedded
            readOnly={readOnly}
            jumpToInstituteId={studentsJumpInstituteId}
            onJumpToInstituteHandled={handleStudentsJumpHandled}
          />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('integrity') && activeTab === 'integrity' ? (
        <TabPanel active>
          <AttendanceIntegritySection
            embedded
            onOpenInstitute={(instituteId) => {
              setStudentsJumpInstituteId(instituteId)
              setTab('students')
            }}
          />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('reports') && activeTab === 'reports' ? (
        <TabPanel active>
          <ReportsSection
            embedded
            readOnly={readOnly}
            jumpToInstituteId={reportsJumpInstituteId}
            onJumpToInstituteHandled={handleReportsJumpHandled}
          />
        </TabPanel>
      ) : null}
      {visibleTabs.includes('quicksearch') && activeTab === 'quicksearch' ? (
        <TabPanel active>
          <QuickSearchSection embedded />
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
