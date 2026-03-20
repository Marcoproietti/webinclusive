// src/components/layout/Layout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import {
  LayoutDashboard, Calendar, Users, UserCheck,
  ClipboardList, BarChart3, LogOut, Activity,
} from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scheduling',    icon: Calendar,         label: 'Pianificazione' },
  { to: '/beneficiaries', icon: Users,            label: 'Beneficiari' },
  { to: '/operators',     icon: UserCheck,        label: 'Operatori' },
  { to: '/attendance',    icon: ClipboardList,    label: 'Presenze' },
  { to: '/reports',       icon: BarChart3,        label: 'Report' },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate          = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1A5276] flex flex-col shadow-xl">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Activity className="w-7 h-7 text-white" />
            <div>
              <p className="text-white font-bold text-base leading-tight">WEB.INCLUSIVE</p>
              <p className="text-white/60 text-xs">Gestione ADI</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) =>
              clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white')
            }>
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center
                            text-white font-bold text-sm">
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.email}</p>
              <p className="text-white/50 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
                       text-white/70 hover:bg-white/10 hover:text-white text-sm transition-all">
            <LogOut className="w-4 h-4" />
            Esci
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
