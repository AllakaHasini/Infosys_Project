import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Automatically close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const userNavItems = [
    { path: '/dashboard', label: '📊 My Dashboard' },
    { path: '/ekyc/verify', label: '🔍 Submit New eKYC' },
    { path: '/applications', label: '📋 My Applications' },
    { path: '/', label: '🌐 Public Portal' },
  ]

  const adminNavItems = [
    { path: '/dashboard', label: '📊 Enterprise Dashboard' },
    { path: '/applications', label: '📋 All Applications (Review Queue)' },
    { path: '/ekyc/verify', label: '🔍 Test eKYC Flow' },
    { path: '/batch', label: '🔄 Batch Verification' },
    { path: '/audit', label: '🔒 Security Audit Logs' },
    { path: '/settings', label: '⚙️ Risk Thresholds' },
    { path: '/documents', label: '📄 Document Forensics' },
    { path: '/liveness', label: '👁️ Biometric Liveness' },
    { path: '/risk', label: '⚠️ Risk Engine Diagnostics' },
    { path: '/', label: '🌐 Public Portal' },
  ]

  const currentNavItems = isAdmin ? adminNavItems : userNavItems
  const themeBg = isAdmin ? 'bg-slate-900 text-slate-100' : 'bg-blue-900 text-blue-50'
  const themeBorder = isAdmin ? 'border-slate-800' : 'border-blue-800'

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Mobile Top App Bar (Visible only on mobile/tablet) */}
      <header className={`md:hidden flex items-center justify-between px-4 py-3 shadow-md z-30 ${themeBg}`}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 transition text-lg leading-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs truncate leading-tight">
              {isAdmin ? 'MOSIP Admin' : 'eKYC Portal'}
            </span>
            <span className="text-[10px] text-white/70 truncate">
              {user?.fullName || user?.email}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${
              isAdmin ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white'
            }`}
          >
            {isAdmin ? 'Admin' : 'User'}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-[11px] text-red-300 hover:text-white px-2 py-1 rounded bg-red-950/40"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Mobile Drawer Overlay Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar: Desktop fixed + Mobile off-canvas slide-out */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 flex flex-col shadow-2xl md:shadow-xl transition-transform duration-200 ease-in-out ${themeBg} ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className={`p-4 md:p-5 border-b ${themeBorder}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span
              className={`inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded ${
                isAdmin ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white'
              }`}
            >
              {isAdmin ? '🛡️ Admin Portal' : '👤 Applicant Portal'}
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-white/70 hover:text-white p-1 text-base leading-none"
            >
              ✕
            </button>
          </div>
          <h1 className="text-sm md:text-base font-bold tracking-tight">
            {isAdmin ? 'MOSIP Risk Intelligence' : 'eKYC Identity Proofing'}
          </h1>
          <p className={`text-[11px] mt-0.5 ${isAdmin ? 'text-slate-400' : 'text-blue-200'}`}>
            {isAdmin ? 'Enterprise Decisioning' : 'Self-Service Applicant Onboarding'}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-amber-400 text-[9px] font-semibold">⚠️ DEMO / PROTOTYPE</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2.5 space-y-0.5">
          {currentNavItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 md:px-5 py-2.5 text-xs font-semibold transition-all ${
                  isActive
                    ? isAdmin
                      ? 'bg-purple-700 text-white shadow-inner font-bold'
                      : 'bg-blue-700 text-white shadow-inner font-bold'
                    : isAdmin
                    ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    : 'text-blue-100 hover:bg-blue-800 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className={`p-3.5 md:p-4 border-t ${themeBorder}`}>
          <p className="text-white text-xs font-medium truncate mb-0.5">
            {user?.fullName || user?.email}
          </p>
          <p className={`text-[11px] truncate mb-2 ${isAdmin ? 'text-slate-400' : 'text-blue-300'}`}>
            {user?.email}
          </p>
          <div className="mb-2.5">
            <span
              className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${
                isAdmin
                  ? 'bg-purple-900/80 text-purple-200 border border-purple-500/30'
                  : 'bg-emerald-900/80 text-emerald-200 border border-emerald-500/30'
              }`}
            >
              Role: {user?.role || 'user'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left text-red-300 hover:text-red-200 text-xs font-medium transition-colors py-1"
          >
            🚪 Sign out
          </button>
        </div>
      </aside>

      {/* Main content scroll container */}
      <main className="flex-1 overflow-y-auto w-full">
        <div className="max-w-7xl mx-auto p-3.5 sm:p-5 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
