import { useState, useEffect } from 'react'
import { settingsService } from '../services/services'
import { LoadingSpinner, ErrorAlert, SuccessAlert } from '../components/Alerts'
import { getErrorMessage } from '../utils/utils'

export default function SettingsPage() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    settingsService.get()
      .then(res => setSettings(res.data))
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await settingsService.update({
        risk_low_threshold: settings.risk_low_threshold,
        risk_medium_threshold: settings.risk_medium_threshold,
        risk_high_threshold: settings.risk_high_threshold,
        mosip_mode: settings.mosip_mode,
        esignet_mode: settings.esignet_mode,
        liveness_mode: settings.liveness_mode,
      })
      setSettings(res.data)
      setSuccess('Settings saved successfully.')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading settings…" />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System Settings</h1>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        ℹ️ These settings control risk thresholds and provider modes.
        Changes are stored in MongoDB and take effect immediately.
        Switching a provider to "Real" requires credentials in the backend <code className="bg-blue-100 px-1 rounded">.env</code> file.
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {success && <SuccessAlert message={success} />}

      {settings && (
        <div className="space-y-6">
          {/* Risk Thresholds */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-5">Risk Score Thresholds</h2>
            {[
              {
                key: 'risk_low_threshold',
                label: 'Low Risk Threshold',
                help: 'Score ≤ this value → LOW → APPROVED',
                color: 'green',
              },
              {
                key: 'risk_medium_threshold',
                label: 'Medium Risk Threshold',
                help: 'Score ≤ this value → MEDIUM → MANUAL_REVIEW',
                color: 'yellow',
              },
              {
                key: 'risk_high_threshold',
                label: 'High Risk Threshold',
                help: 'Score ≤ this → HIGH → MANUAL_REVIEW; above → VERY_HIGH → REJECTED',
                color: 'red',
              },
            ].map(({ key, label, help, color }) => (
              <div key={key} className="mb-6">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-semibold text-gray-700">{label}</label>
                  <span className={`text-lg font-black ${
                    color === 'green' ? 'text-green-600' : color === 'yellow' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {settings[key]}
                  </span>
                </div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={settings[key]}
                  onChange={e => setSettings(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                  className="w-full accent-blue-600"
                />
                <p className="text-xs text-gray-400 mt-1">{help}</p>
              </div>
            ))}

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
              <p className="font-semibold text-gray-700 mb-2">Current Threshold Summary:</p>
              <p>🟢 Score 0–{settings.risk_low_threshold}: <strong>LOW</strong> → APPROVED</p>
              <p>🟡 Score {settings.risk_low_threshold + 1}–{settings.risk_medium_threshold}: <strong>MEDIUM</strong> → MANUAL_REVIEW</p>
              <p>🟠 Score {settings.risk_medium_threshold + 1}–{settings.risk_high_threshold}: <strong>HIGH</strong> → MANUAL_REVIEW</p>
              <p>🔴 Score {settings.risk_high_threshold + 1}–100: <strong>VERY_HIGH</strong> → REJECTED</p>
            </div>
          </div>

          {/* Provider Modes */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-2">Provider Modes</h2>
            <p className="text-sm text-gray-500 mb-4">
              Currently all providers use <strong>Mock (Demo)</strong> mode.
              Switch to "Real" only after configuring credentials in the backend <code className="bg-gray-100 px-1 rounded">.env</code> file.
              Real providers are not implemented in this prototype.
            </p>
            <div className="space-y-3">
              {[
                { key: 'mosip_mode', label: '🔐 MOSIP Identity Provider' },
                { key: 'esignet_mode', label: '🔑 eSignet OIDC Provider' },
                { key: 'liveness_mode', label: '👁️ Liveness Provider' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <span className="text-sm font-medium">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      settings[key] === 'mock'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {settings[key] === 'mock' ? '⚠️ MOCK' : '✅ REAL'}
                    </span>
                    <select
                      value={settings[key]}
                      onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                      className="input-field max-w-[180px] text-sm"
                    >
                      <option value="mock">Mock (Demo)</option>
                      <option value="real">Real (Requires credentials)</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? '⏳ Saving…' : '💾 Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
