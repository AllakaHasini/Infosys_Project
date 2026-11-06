import { useState, useEffect, useRef } from 'react'
import { batchService } from '../services/services'
import { ErrorAlert, SimulatedBanner } from '../components/Alerts'
import { getErrorMessage, formatDate } from '../utils/utils'

const DEMO_PAYLOAD = {
  label: "Demo Batch Job",
  records: [
    { applicant: { full_name: "Batch Alice", date_of_birth: "1990-01-01", gender: "female", nationality: "India", id_type: "national_id", id_number: "BATCH-001", email: "batch.alice@example.test" } },
    { applicant: { full_name: "Batch Bob", date_of_birth: "1985-06-15", gender: "male", nationality: "India", id_type: "passport", id_number: "BATCH-002", email: "batch.bob@example.test" } },
    { applicant: { full_name: "Batch Carol", date_of_birth: "1995-11-20", gender: "female", nationality: "India", id_type: "driving_license", id_number: "BATCH-003", email: "batch.carol@example.test" } },
  ]
}

export default function BatchVerifyPage() {
  const [jsonText, setJsonText] = useState(JSON.stringify(DEMO_PAYLOAD, null, 2))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [batchId, setBatchId] = useState(null)
  const [status, setStatus] = useState(null)
  const pollRef = useRef(null)

  // Cleanup polling on unmount
  useEffect(() => () => clearInterval(pollRef.current), [])

  const startPolling = (id) => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await batchService.status(id)
        setStatus(res.data)
        if (res.data.status === 'completed') {
          clearInterval(pollRef.current)
        }
      } catch {
        clearInterval(pollRef.current)
      }
    }, 2000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null); setStatus(null); setBatchId(null)
    clearInterval(pollRef.current)

    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setError('Invalid JSON. Please check your input format.')
      return
    }

    setLoading(true)
    try {
      const res = await batchService.submit(parsed)
      setBatchId(res.data.batch_id)
      setStatus(res.data)
      startPolling(res.data.batch_id)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const pct = status && status.total > 0
    ? Math.round((status.processed / status.total) * 100)
    : 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Batch Verification</h1>
      <SimulatedBanner />

      <div className="card">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold">Submit Batch Job</h2>
            <p className="text-sm text-gray-500 mt-1">
              Paste JSON with a <code className="bg-gray-100 px-1 rounded text-xs">records</code> array.
              Maximum 50 records. Use synthetic test data only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setJsonText(JSON.stringify(DEMO_PAYLOAD, null, 2))}
            className="btn-secondary text-sm"
          >
            📋 Load Demo Data
          </button>
        </div>

        {error && <div className="mb-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            rows={14}
            className="input-field font-mono text-xs"
            placeholder='{"label": "my-batch", "records": [...]}'
          />
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? '⏳ Submitting…' : '🔄 Submit Batch Job'}
            </button>
            <button
              type="button"
              onClick={() => { setStatus(null); setBatchId(null); setError(null) }}
              className="btn-secondary"
            >
              Clear
            </button>
          </div>
        </form>
      </div>

      {status && (
        <div className="card space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Batch Status</h2>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              status.status === 'completed'
                ? 'bg-green-100 text-green-800'
                : 'bg-blue-100 text-blue-800 animate-pulse'
            }`}>
              {status.status.toUpperCase()}
            </span>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Batch ID</p>
            <p className="font-mono text-sm font-bold">{status.batch_id}</p>
            {status.label && <p className="text-xs text-gray-400 mt-1">Label: {status.label}</p>}
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-sm font-medium mb-2">
              <span>Progress</span>
              <span>{status.processed} / {status.total} records ({pct}%)</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all duration-700 ${
                  status.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Result counts */}
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: 'Approved', value: status.approved, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Review', value: status.manual_review, color: 'text-yellow-600', bg: 'bg-yellow-50' },
              { label: 'Rejected', value: status.rejected, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Errors', value: status.errors, color: 'text-gray-600', bg: 'bg-gray-50' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-xl py-4`}>
                <p className={`text-3xl font-black ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-500 mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          {status.completed_at && (
            <p className="text-xs text-gray-400">
              ✅ Completed at: {formatDate(status.completed_at)}
            </p>
          )}

          {status.status !== 'completed' && (
            <p className="text-xs text-blue-500 animate-pulse">
              ↻ Auto-refreshing every 2 seconds…
            </p>
          )}
        </div>
      )}

      {/* Batch History Table */}
      <BatchHistorySection onSelectBatch={(id) => {
        setBatchId(id)
        startPolling(id)
      }} />
    </div>
  )
}

function BatchHistorySection({ onSelectBatch }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchBatches = () => {
    setLoading(true)
    batchService.list()
      .then(res => setBatches(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchBatches()
  }, [])

  if (loading) return null
  if (!batches.length) return null

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="text-base font-semibold text-gray-900">Recent Batch Verification Jobs</h3>
        <button type="button" onClick={fetchBatches} className="btn-secondary text-xs">
          🔄 Refresh History
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b text-gray-400 uppercase tracking-wider">
              <th className="py-2">Batch ID</th>
              <th className="py-2">Label</th>
              <th className="py-2">Status</th>
              <th className="py-2">Total</th>
              <th className="py-2">Approved</th>
              <th className="py-2">Review</th>
              <th className="py-2">Rejected</th>
              <th className="py-2">Created</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.batch_id} className="border-b hover:bg-gray-50">
                <td className="py-2 font-mono font-medium text-blue-600">{b.batch_id}</td>
                <td className="py-2 text-gray-700">{b.label || '—'}</td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    b.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {b.status.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 font-semibold">{b.total}</td>
                <td className="py-2 text-green-600 font-semibold">{b.approved}</td>
                <td className="py-2 text-yellow-600 font-semibold">{b.manual_review}</td>
                <td className="py-2 text-red-600 font-semibold">{b.rejected}</td>
                <td className="py-2 text-gray-400">{formatDate(b.created_at)}</td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => onSelectBatch(b.batch_id)}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    View Status →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
