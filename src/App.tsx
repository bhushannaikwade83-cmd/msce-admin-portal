import { useState } from 'react'
import { AuthProvider } from './context/auth-context'
import { useAuth } from './hooks/useAuth'
import { DashboardLayout, type DashboardTab } from './layouts/DashboardLayout'
import { LoginPage } from './pages/LoginPage'
import { AddInstituteForm } from './components/AddInstituteForm'
import { InstituteList } from './components/InstituteList'
import { StorageSection } from './components/StorageSection'
import { OverviewPanel } from './components/OverviewPanel'
import { StudentsSection } from './components/StudentsSection'
import { ReportsSection } from './components/ReportsSection'
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
      {tab === 'institutes' && <InstituteList reloadToken={instituteReload} embedded />}
      {tab === 'add'      && <AddInstituteForm onCreated={() => setInstituteReload((n) => n + 1)} embedded />}
      {tab === 'students' && <StudentsSection embedded />}
      {tab === 'reports' && <ReportsSection embedded />}
      {tab === 'storage'  && <StorageSection embedded />}
    </DashboardLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}
