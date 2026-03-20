// src/components/layout/Layout.tsx
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

const NAV = [
  { to:'/dashboard',     label:'Dashboard',      icon:'M3 13l2-2m0 0l7-7 7 7M5 11v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to:'/monitoring',    label:'Monitor CO',     icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { to:'/scheduling',    label:'Pianificazione', icon:'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { to:'/beneficiaries', label:'Beneficiari',    icon:'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { to:'/operators',     label:'Operatori',      icon:'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { to:'/attendance',    label:'Presenze',       icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to:'/reports',       label:'Report',         icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

function Icon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
      <path d={path}/>
    </svg>
  )
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate          = useNavigate()
  const location          = useLocation()
  const handleLogout      = async () => { await logout(); navigate('/login') }
  const initials          = user?.email?.slice(0,2).toUpperCase() ?? 'XX'
  const isProfileActive   = location.pathname === '/profile'

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      {/* ── Sidebar ───────────────────────────── */}
      <aside style={{
        width: 'var(--sidebar-w)', background:'var(--navy)', display:'flex',
        flexDirection:'column', flexShrink:0, borderRight:'1px solid rgba(255,255,255,.06)',
      }}>
        {/* Logo */}
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, background:'rgba(255,255,255,.1)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <div style={{ color:'white', fontSize:13, fontWeight:600, letterSpacing:'.03em' }}>WEB.INCLUSIVE</div>
              <div style={{ color:'rgba(255,255,255,.35)', fontSize:10 }}>Gestione ADI</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 10px', overflowY:'auto' }}>
          <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', color:'rgba(255,255,255,.25)', padding:'6px 10px 4px', marginBottom:2 }}>
            Menu
          </div>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
              borderRadius:7, fontSize:13, fontWeight: isActive ? 500 : 400,
              color: isActive ? 'white' : 'rgba(255,255,255,.5)',
              background: isActive ? 'rgba(255,255,255,.1)' : 'transparent',
              textDecoration:'none', marginBottom:1, transition:'all .12s',
            })}>
              <Icon path={n.icon}/>
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding:'12px 10px', borderTop:'1px solid rgba(255,255,255,.07)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:7, background: isProfileActive ? 'rgba(255,255,255,.1)' : 'transparent' }}>
            <button onClick={() => navigate('/profile')} title="Profilo utente" style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', flexShrink:0 }}>
              <div style={{ width:30, height:30, borderRadius:'50%', background: isProfileActive ? 'white' : 'rgba(255,255,255,.12)', color: isProfileActive ? 'var(--navy)' : 'rgba(255,255,255,.7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, transition:'all .12s' }}>
                {initials}
              </div>
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:'rgba(255,255,255,.75)', fontSize:12, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.email}</div>
              <div style={{ color:'rgba(255,255,255,.35)', fontSize:10, textTransform:'capitalize' }}>{user?.role}</div>
            </div>
            <button onClick={handleLogout} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.3)', padding:4, display:'flex' }} title="Esci">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Topbar */}
        <header style={{
          height:'var(--header-h)', background:'var(--white)',
          borderBottom:'1px solid var(--gray-300)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 28px', flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--gray-500)', fontSize:12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            <span style={{ color:'var(--gray-300)' }}>/</span>
            <span style={{ color:'var(--gray-700)' }}>
              {NAV.find(n => window.location.pathname.startsWith(n.to))?.label ?? 'Dashboard'}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'var(--teal-light)', border:'1px solid rgba(13,122,95,.2)', borderRadius:99, padding:'4px 10px' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--teal)', animation:'pulse 2s infinite' }}/>
              <span style={{ fontSize:11, fontWeight:500, color:'var(--teal)' }}>Sistema operativo</span>
            </div>
            <div style={{ fontSize:12, color:'var(--gray-500)', fontFeatureSettings:'"tnum"' }}>
              {new Date().toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'})}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex:1, overflow:'auto', padding:'28px' }}>
          <Outlet/>
        </main>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        nav a:hover:not([aria-current]) { color: rgba(255,255,255,.75) !important; background: rgba(255,255,255,.05) !important; }
      `}</style>
    </div>
  )
}
