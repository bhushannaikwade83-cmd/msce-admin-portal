import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import PromoPage from './promo/PromoPage'

const AdminApp = lazy(() => import('./admin/AdminApp'))

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
