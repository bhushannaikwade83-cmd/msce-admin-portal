import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import PromoPage from './promo/PromoPage'
import { ADMIN_SITE_TITLE, PROMO_SITE_TITLE } from './siteTitle'

const AdminApp = lazy(() => import('./admin/AdminApp'))

function DocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = pathname.startsWith('/admin') ? ADMIN_SITE_TITLE : PROMO_SITE_TITLE
  }, [pathname])

  return null
}

function AdminLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0c1222',
        color: '#94a3b8',
        fontFamily: 'DM Sans, system-ui, sans-serif',
      }}
    >
      Loading admin portal…
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <DocumentTitle />
      <Routes>
        <Route path="/" element={<PromoPage />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<AdminLoading />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
