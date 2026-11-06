import { useState } from 'react'
import { riskService } from '../services/services'
import { ErrorAlert } from '../components/Alerts'
import { getRiskBadgeClass, getDecisionBadgeClass, getErrorMessage } from '../utils/utils'

export default function RiskScorePage() {
  const [form, setForm] = useState({
    identity_verified: false,
    document_suspicious: false,
    document_confidence: 1.0,
    liveness_passed: false,
    liveness_confidence: 1.0,
    duplicate_detected: false,
    fields_consistent: true,
    provider_simulated: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const toggle = (key) => setForm(prev => ({ ...prev, [key]: !prev[key] }))
  const setNum = (key, val) => setForm(prev => ({ ...prev, [key]: parseFloat(val) }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await riskService.score(form)
      setResult(res.data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const scoreColor = result
    ? result.score <= 30 ? 'text-green-600' : result.score <= 60 ? 'text-yellow-600' : 'text-red-600'
    : 'text-gray-900'

  const scoreBg = result
    ? result.score <= 30 ? 'bg-green-50' : result.score <= 60 ? 'bg-yellow-50' : 'bg-red-50'
    : 'bg-gray-50'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Risk Score Calculator</h1>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        ℹ️ This tool lets you manually explore how different verification signals affect the risk score.
        Adjust the signals below to see the engine's response in real-time.
        This is a <strong>prototype weighted heuristic model</strong> — not a validated fraud detection system.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Input Signals</h2>
          {error && <div className="mb-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Boolean toggles */}
            <div className="space-y-3">
              {[
                ['identity_verified', 'Identity Verified by Provider', 'green'],
                ['document_suspicious', 'Document Flagged as Suspicious', 'red'],
                ['liveness_passed', 'Liveness Check Passed', 'green'],
                ['duplicate_detected', 'Potential Duplicate Detected', 'red'],
                ['fields_consistent', 'Submitted Fields are Consistent', 'green'],
                ['provider_simulated', 'Using Simulated Provider', 'yellow'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={() => toggle(key)}
                    className="w-5 h-5 text-blue-600 rounded cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${form[key] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {form[key] ? 'ON' : 'OFF'}
                  </span>
                </label>
              ))}
            </div>

            {/* Sliders */}
            <div className="space-y-4 pt-2 border-t border-gray-100">
              {[
                ['document_confidence', 'Document Analysis Confidence'],
                ['liveness_confidence', 'Liveness Check Confidence'],
              ].map(([key, label]) => (
                <div key={key}>
                  <div className="flex justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    <span className="text-sm font-bold text-blue-600">
                      {Math.round(form[key] * 100)}%
                    </span>
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={form[key]}
                    onChange={(e) => setNum(key, e.target.value)}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Low confidence</span>
                    <span>High confidence</span>
                  </div>
                </div>
              ))}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Calculating…' : '⚠️ Calculate Risk Score'}
            </button>
          </form>
        </div>

        {/* Result Panel */}
        <div>
          {result ? (
            <div className="card space-y-4 h-full">
              <h2 className="text-lg font-semibold">Risk Score Result</h2>

              {/* Score gauge */}
              <div className={`text-center py-8 rounded-xl ${scoreBg}`}>
                <p className={`text-7xl font-black ${scoreColor}`}>
                  {result.score.toFixed(1)}
                </p>
                <p className="text-gray-400 text-sm mt-1">out of 100</p>
                <div className="flex justify-center gap-3 mt-4">
                  <span className={getRiskBadgeClass(result.category)}>{result.category}</span>
                  <span className={getDecisionBadgeClass(result.decision)}>{result.decision}</span>
                </div>
              </div>

              {/* Score bar */}
              <div>
                <div className="w-full h-3 bg-gradient-to-r from-green-400 via-yellow-300 to-red-500 rounded-full relative">
                  <div
                    className="absolute -top-1 w-2 h-5 bg-gray-900 rounded-full shadow-md transition-all duration-500"
                    style={{ left: `calc(${Math.min(result.score, 98)}% - 4px)` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>LOW (0–30)</span>
                  <span>MEDIUM (30–60)</span>
                  <span>HIGH (60+)</span>
                </div>
              </div>

              {/* Reasons */}
              <div>
                <h3 className="font-semibold text-sm mb-3 text-gray-700">Contributing Factors:</h3>
                <ul className="space-y-2">
                  {result.reasons?.map((r, i) => (
                    <li key={i} className="text-xs text-gray-600 flex gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-400 mt-0.5 flex-shrink-0">→</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-xs text-yellow-800">
                📋 {result.model_note}
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center h-full min-h-[300px] text-gray-400">
              <div className="text-5xl mb-3">⚠️</div>
              <p className="font-medium">Set signals and click Calculate</p>
              <p className="text-sm mt-1">Results will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
