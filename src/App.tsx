import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components'
import { AppHeader } from './components/AppHeader'
import { setCatalogOverrides } from './data/catalog'
import { fetchProductOverrides } from './lib/productOverrides'
import { DevAuthGate } from './features/auth/DevAuthGate'
import { DashboardShell } from './features/dashboard/DashboardShell'
import { DashboardHome } from './features/dashboard/DashboardHome'
import { MyWork } from './features/dashboard/MyWork'
import { InProgress } from './features/dashboard/InProgress'
import { QuotePage } from './features/quote/QuotePage'
import { AccountPage } from './features/account/AccountPage'

// App shell: routing/layout only, kept thin. The two dashboard views share a
// frame (DashboardShell) and each have their own URL, so the Manager/My Work
// switch is real navigation. DevAuthGate ensures a read-only session first.
export default function App() {
  // Load manager catalog overrides once at startup into the module cache, then
  // bump state so the tree re-renders with the merged catalog.
  const [, setOvReady] = useState(0)
  useEffect(() => {
    let alive = true
    fetchProductOverrides().then((rows) => { if (alive) { setCatalogOverrides(rows); setOvReady((n) => n + 1) } })
    return () => { alive = false }
  }, [])

  return (
    <ToastProvider>
      <AppHeader />
      <DevAuthGate>
        <Routes>
        <Route
          path="/"
          element={
            <DashboardShell>
              <DashboardHome />
            </DashboardShell>
          }
        />
        <Route
          path="/my-work"
          element={
            <DashboardShell>
              <MyWork />
            </DashboardShell>
          }
        />
        <Route
          path="/in-progress"
          element={
            <DashboardShell>
              <InProgress />
            </DashboardShell>
          }
        />
        <Route path="/quote/:id" element={<QuotePage />} />
        <Route path="/account/:name" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </DevAuthGate>
    </ToastProvider>
  )
}
