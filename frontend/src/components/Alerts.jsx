export function LoadingSpinner({ text = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3" />
      <span className="text-gray-500 text-sm">{text}</span>
    </div>
  )
}

export function ErrorAlert({ message, onDismiss }) {
  return (
    <div className="bg-red-50 border border-red-300 text-red-800 rounded-lg p-4 flex justify-between items-start">
      <div>
        <strong className="font-semibold">Error: </strong>
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-600 hover:text-red-800 ml-4 font-bold">✕</button>
      )}
    </div>
  )
}

export function SuccessAlert({ message }) {
  return (
    <div className="bg-green-50 border border-green-300 text-green-800 rounded-lg p-4">
      <strong className="font-semibold">✓ </strong>{message}
    </div>
  )
}

export function SimulatedBanner() {
  return (
    <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-2.5 sm:p-3 text-xs sm:text-sm">
      ⚠️ <strong>Demo Mode:</strong> Simulated providers (mock MOSIP, mock liveness) for demonstration only.
    </div>
  )
}

export function InfoBadge({ label }) {
  return (
    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">{label}</span>
  )
}

export function AlreadyRegisteredModal({ isOpen, onClose, onLogin }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 border border-slate-100 text-center relative">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 ring-8 ring-amber-50">
          ⚠️
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Already Registered!
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-6 font-medium">
          This phone number or ID is already associated with an existing account.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          {onLogin && (
            <button
              type="button"
              onClick={onLogin}
              className="btn-primary flex-1 py-2.5 text-sm font-semibold shadow-md shadow-blue-600/20"
            >
              Sign In to Account
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1 py-2.5 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
