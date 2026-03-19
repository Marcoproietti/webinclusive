// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore }  from './store/auth.store'
import LoginPage         from './pages/LoginPage'
import DashboardPage     from './pages/DashboardPage'
import SchedulingPage    from './pages/SchedulingPage'
import BeneficiariesPage from './pages/BeneficiariesPage'
import OperatorsPage     from './pages/OperatorsPage'
import AttendancePage    from './pages/AttendancePage'
import ReportsPage       from './pages/ReportsPage'
import Layout            from './components/layout/Layout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => !!s.user)
  return isAuth ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <RequireAuth><Layout /></RequireAuth>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"     element={<DashboardPage />} />
        <Route path="scheduling"    element={<SchedulingPage />} />
        <Route path="beneficiaries" element={<BeneficiariesPage />} />
        <Route path="operators"     element={<OperatorsPage />} />
        <Route path="attendance"    element={<AttendancePage />} />
        <Route path="reports"       element={<ReportsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
