import { useCallback, useState } from 'react'
import { AuthProvider } from './context/auth-context'
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

function LoadingScreen() {
  return (
    <div className="state-screen">
      <div className="loading-spinner" aria-label="Loading" />
      <p className="state-muted">Verifying session…</p>
    </div>
  )
}

function AuthenticatedApp() {
  const { user, loading, configError, signOut } = useAuth()
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [instituteReload, setInstituteReload] = useState(0)
  const [studentsJumpInstituteId, setStudentsJumpInstituteId] = useState<string | null>(null)
  const [reportsJumpInstituteId, setReportsJumpInstituteId] = useState<string | null>(null)

  const handleStudentsJumpHandled = useCallback(() => setStudentsJumpInstituteId(null), [])
  const handleReportsJumpHandled = useCallback(() => setReportsJumpInstituteId(null), [])

  if (configError) {
    return <ConfigErrorScreen message={configError} />
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <DashboardLayout
      userEmail={user.email ?? null}
      activeTab={tab}
      onTab={setTab}
      onSignOut={signOut}
    >
      {tab === 'overview' && <OverviewPanel />}
      {tab === 'admins'   && <InstituteAdminsSection embedded />}
      {tab === 'instructors' && <InstituteInstructorsSection embedded />}
      {tab === 'institutes' && (
        <InstituteList reloadToken={instituteReload} embedded onAddInstitute={() => setTab('add')} />
      )}
      {tab === 'add'      && <AddInstituteForm onCreated={() => setInstituteReload((n) => n + 1)} embedded />}
      {tab === 'students' && (
        <StudentsSection
          embedded
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
      <AuthenticatedApp />
    </AuthProvider>
  )
}
