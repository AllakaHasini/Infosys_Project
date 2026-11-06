import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ErrorAlert } from '../components/Alerts'
import { getErrorMessage } from '../utils/utils'

export default function LoginPage() {
  const [activePortal, setActivePortal] = useState('applicant') // 'applicant' | 'admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { login, logout } = useAuth()
  const navigate = useNavigate()

  const handlePortalSwitch = (portal) => {
    setActivePortal(portal)
    setError(null)
    if (portal === 'admin') {
      setEmail('admin@ekyc.local')
      setPassword('Admin@eKYC2024')
    } else {
      setEmail('')
      setPassword('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const userData = await login(email, password)
      const returnedRole = userData?.role || 'user'
      const isAdmin = returnedRole === 'admin' || returnedRole === 'superadmin'

      // Portal / role mismatch detection
      if (activePortal === 'admin' && !isAdmin) {
        logout()
        setError('This account does not have administrator privileges. Please use the Applicant Portal to log in.')
        setLoading(false)
        return
      }
      if (activePortal === 'applicant' && isAdmin) {
        // Admin is using the wrong portal — redirect them to dashboard (admin dashboard)
        navigate('/dashboard')
        return
      }

      navigate('/dashboard')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-slate-100">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🛡️</div>
          <h1 className="text-2xl font-bold text-gray-900">eKYC Risk Intelligence</h1>
          <p className="text-gray-500 text-xs mt-1">AI-Powered Identity Verification on MOSIP</p>
          <div className="mt-2.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <p className="text-amber-800 text-[11px] font-semibold">⚠️ PROTOTYPE DEMONSTRATION SYSTEM</p>
            <p className="text-amber-700 text-[10px]">Synthetic data & simulated providers only. Not for production use.</p>
          </div>
        </div>

        {/* Portal Switch Tabs */}
        <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-xl mb-5">
          <button
            type="button"
            onClick={() => handlePortalSwitch('applicant')}
            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
              activePortal === 'applicant'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            👤 Applicant Portal
          </button>
          <button
            type="button"
            onClick={() => handlePortalSwitch('admin')}
            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
              activePortal === 'admin'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            🛡️ Admin Portal
          </button>
        </div>

        <div className="mb-4 text-center">
          <p className="text-xs font-medium text-gray-600">
            {activePortal === 'admin'
              ? 'Compliance Officers & System Administrators'
              : 'Applicant Login — Submit & Track Personal eKYC'}
          </p>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              {activePortal === 'admin' ? 'Admin Email' : 'Applicant Email'}
            </label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={activePortal === 'admin' ? 'admin@ekyc.local' : 'applicant@example.com'}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Password
              </label>
              {activePortal === 'applicant' && (
                <Link
                  to="/forgot-password"
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  Forgot Password?
                </Link>
              )}
            </div>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 text-sm font-semibold tracking-wide rounded-xl transition-all shadow-md ${
              activePortal === 'admin'
                ? 'bg-purple-700 hover:bg-purple-800 text-white shadow-purple-900/20'
                : 'btn-primary'
            }`}
          >
            {loading ? 'Authenticating…' : `Sign in to ${activePortal === 'admin' ? 'Admin Portal' : 'User Portal'}`}
          </button>
        </form>

        {activePortal === 'applicant' ? (
          <div className="mt-5 text-center">
            <p className="text-xs text-gray-600">
              New applicant?{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="text-blue-600 font-semibold hover:underline"
              >
                Create Applicant Account
              </button>
            </p>
          </div>
        ) : (
          <div className="mt-5 text-center">
            <p className="text-[11px] text-gray-400">
              Administrative access is strictly restricted to pre-provisioned security officers.
            </p>
          </div>
        )}

        <div className="mt-6 p-3 bg-gray-50 rounded-xl text-xs text-gray-500 border border-gray-100">
          <p className="font-semibold text-gray-700 mb-1">Demo Credentials:</p>
          <div className="space-y-0.5 text-[11px]">
            <p>• <strong>Admin:</strong> <code className="bg-gray-100 px-1 rounded">admin@ekyc.local</code> / <code className="bg-gray-100 px-1 rounded">Admin@eKYC2024</code></p>
            <p>• <strong>Applicant:</strong> Register new account via link above</p>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Infosys AI-on-DPI Internship Project 2024
        </p>
      </div>
    </div>
  )
}
