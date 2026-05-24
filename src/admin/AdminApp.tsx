import { useCallback, useEffect, useState } from 'react'
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

function AuthenticatedApp() {
  const { user, loading, configError, signOut } = useAuth()
  const portal = usePortalAccess()
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [instituteReload, setInstituteReload] = useState(0)
  const [studentsJumpInstituteId, setStudentsJumpInstituteId] = useState<string | null>(null)
  const [reportsJumpInstituteId, setReportsJumpInstituteId] = useState<string | null>(null)

  const handleStudentsJumpHandled = useCallback(() => setStudentsJumpInstituteId(null), [])
  const handleReportsJumpHandled = useCallback(() => setReportsJumpInstituteId(null), [])

  const readOnly = portal.readOnly
  const allowedTabs = portal.allowedTabs

  useEffect(() => {
    if (portal.mode === 'district_viewer' && !allowedTabs.includes(tab)) {
      setTab('institutes')
    }
  }, [portal.mode, allowedTabs, tab])

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
      {tab === 'overview' && <OverviewPanel />}
      {tab === 'admins'   && <InstituteAdminsSection embedded />}
      {tab === 'instructors' && <InstituteInstructorsSection embedded />}
      {tab === 'institutes' && (
        <InstituteList
          reloadToken={instituteReload}
          embedded
          readOnly={readOnly}
          onAddInstitute={readOnly ? undefined : () => setTab('add')}
        />
      )}
      {tab === 'add'      && <AddInstituteForm onCreated={() => setInstituteReload((n) => n + 1)} embedded />}
      {tab === 'students' && (
        <StudentsSection
          embedded
          readOnly={readOnly}
          jumpToInstituteId={studentsJumpInstituteId}
          onJumpToInstituteHandled={handleStudentsJumpHandled}
        />
      )}
      {tab === 'integrity' && (
        <AttendanceIntegritySection
          embedded
          onOpenInstitute={(instituteId) => {
            setStudentsJumpInstituteId(instituteId)
            setTab('students')
          }}
        />
      )}
      {tab === 'reports' && (
        <ReportsSection
          embedded
          readOnly={readOnly}
          jumpToInstituteId={reportsJumpInstituteId}
          onJumpToInstituteHandled={handleReportsJumpHandled}
        />
      )}
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
