import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ErrorAlert, AlreadyRegisteredModal } from '../components/Alerts'
import { getErrorMessage } from '../utils/utils'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    setLoading(true)
    try {
      await register({
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
        role: 'user',
      })
      navigate('/dashboard')
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(msg)
      if (
        err?.response?.status === 409 ||
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already associated')
      ) {
        setShowDuplicateModal(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <AlreadyRegisteredModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        onLogin={() => navigate('/login')}
      />

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-slate-100">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🛡️</div>
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 text-sm mt-1">eKYC &amp; Identity Risk Intelligence on MOSIP</p>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-2.5">
            <p className="text-blue-800 text-xs font-medium">
              Applicant Self-Registration • Admin access requires designated security credentials
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Full Name *
            </label>
            <input
              type="text"
              className="input-field"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              required
              minLength={2}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Email Address *
            </label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Password *
              </label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Confirm *
              </label>
              <input
                type="password"
                className="input-field"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-800">
            <p className="font-semibold text-sky-900 mb-0.5">👤 Applicant Self-Service Account</p>
            <p className="text-[11px] text-sky-700">
              Registration provides personal access to submit eKYC identity proofs, upload documents,
              and track verification outcomes. Your phone number will be collected during the eKYC
              verification step. Admin functionality is restricted to pre-authorized administrators.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-sm font-semibold tracking-wide mt-2"
          >
            {loading ? 'Creating Account…' : 'Register & Continue'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500 border-t border-gray-100 pt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 font-semibold hover:underline">
            Sign In here
          </Link>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Infosys AI-on-DPI Internship Project 2024
        </p>
      </div>
    </div>
  )
}
