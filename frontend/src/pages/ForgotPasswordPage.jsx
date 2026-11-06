import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/services'
import { ErrorAlert } from '../components/Alerts'
import { getErrorMessage } from '../utils/utils'

const STEPS = {
  EMAIL: 'email',
  OTP: 'otp',
  RESET: 'reset',
  SUCCESS: 'success',
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(STEPS.EMAIL)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpHint, setOtpHint] = useState(null) // Prototype: show actual OTP
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  // Step 1: Request OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authService.forgotPassword(email.trim().toLowerCase())
      setOtpHint(res.data.otp_hint) // Prototype only
      setStep(STEPS.OTP)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setError(null)
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      setError('Please enter the 6-digit numeric OTP.')
      return
    }
    setLoading(true)
    try {
      const res = await authService.verifyOtp(email.trim().toLowerCase(), otp.trim())
      if (res.data?.reset_token) {
        setResetToken(res.data.reset_token)
        setStep(STEPS.RESET)
      } else {
        setError(res.data?.message || 'Invalid or expired OTP. Please check and try again.')
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Reset Password
  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await authService.resetPassword(resetToken, newPassword)
      setStep(STEPS.SUCCESS)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const stepLabels = [
    { id: STEPS.EMAIL, label: 'Email', num: 1 },
    { id: STEPS.OTP, label: 'Verify OTP', num: 2 },
    { id: STEPS.RESET, label: 'New Password', num: 3 },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-slate-100">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
          <p className="text-gray-500 text-sm mt-1">eKYC Risk Intelligence</p>
        </div>

        {/* Step Indicator */}
        {step !== STEPS.SUCCESS && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {stepLabels.map((s, i) => {
              const isActive = s.id === step
              const isDone =
                (step === STEPS.OTP && i === 0) ||
                (step === STEPS.RESET && i <= 1) ||
                (step === STEPS.SUCCESS && i <= 2)
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      isDone
                        ? 'bg-green-500 text-white'
                        : isActive
                        ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isDone ? '✓' : s.num}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${isActive ? 'text-blue-700' : isDone ? 'text-green-600' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                  {i < stepLabels.length - 1 && (
                    <div className={`w-6 h-0.5 ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="mb-4">
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* Step 1: Enter Email */}
        {step === STEPS.EMAIL && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Registered Email Address
              </label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter the email address associated with your account.
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-sm font-semibold"
            >
              {loading ? 'Sending OTP…' : 'Send OTP →'}
            </button>
          </form>
        )}

        {/* Step 2: Enter OTP */}
        {step === STEPS.OTP && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            {/* Prototype OTP hint banner */}
            {otpHint && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-bold mb-1">⚠️ Prototype Mode — Simulated Email</p>
                <p className="text-xs mb-2">
                  In production, the OTP would be emailed to <strong>{email}</strong>.
                  Since this is a demo, the OTP is shown here:
                </p>
                <div className="bg-white border border-amber-200 rounded-lg p-3 text-center">
                  <span className="text-3xl font-black tracking-[0.5em] text-amber-700 font-mono">
                    {otpHint}
                  </span>
                </div>
                <p className="text-xs mt-2 text-amber-600">Valid for 10 minutes.</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Enter 6-Digit OTP
              </label>
              <input
                type="text"
                className="input-field text-center text-2xl font-mono tracking-widest"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                pattern="\d{6}"
                required
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep(STEPS.EMAIL); setOtp(''); setError(null) }}
                className="btn-secondary flex-1 py-2.5 text-sm"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="btn-primary flex-1 py-2.5 text-sm font-semibold"
              >
                {loading ? 'Verifying…' : 'Verify OTP →'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setOtp(''); setError(null); handleRequestOtp({ preventDefault: () => {} }) }}
              disabled={loading}
              className="w-full text-xs text-blue-600 hover:underline"
            >
              Resend OTP
            </button>
          </form>
        )}

        {/* Step 3: New Password */}
        {step === STEPS.RESET && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                New Password *
              </label>
              <input
                type="password"
                className="input-field"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoFocus
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Confirm New Password *
              </label>
              <input
                type="password"
                className="input-field"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-sm font-semibold"
            >
              {loading ? 'Resetting Password…' : '🔑 Reset Password'}
            </button>
          </form>
        )}

        {/* Step 4: Success */}
        {step === STEPS.SUCCESS && (
          <div className="text-center space-y-4">
            <div className="text-6xl mb-2">✅</div>
            <h2 className="text-xl font-bold text-green-700">Password Reset Successful!</h2>
            <p className="text-sm text-gray-600">
              Your password has been updated. You can now log in with your new password.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn-primary w-full py-3 text-sm font-semibold"
            >
              Go to Login →
            </button>
          </div>
        )}

        {/* Footer */}
        {step !== STEPS.SUCCESS && (
          <div className="mt-6 text-center text-xs text-gray-500 border-t border-gray-100 pt-4">
            Remembered your password?{' '}
            <Link to="/login" className="text-blue-600 font-semibold hover:underline">
              Sign In
            </Link>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Infosys AI-on-DPI Internship Project 2024
        </p>
      </div>
    </div>
  )
}

