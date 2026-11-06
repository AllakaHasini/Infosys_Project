import { useState, useRef } from 'react'
import { documentService } from '../services/services'
import { ErrorAlert, SimulatedBanner } from '../components/Alerts'
import { getErrorMessage } from '../utils/utils'

export default function DocumentPage() {
  const [file, setFile] = useState(null)
  const [docType, setDocType] = useState('national_id')
  const [appId, setAppId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('document_type', docType)
    if (appId) fd.append('application_id', appId)
    try {
      const res = await documentService.analyze(fd)
      setResult(res.data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const confPct = result ? Math.round(result.confidence * 100) : 0
  const confColor = confPct >= 75 ? 'bg-green-500' : confPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Document Analysis</h1>
      <SimulatedBanner />

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        ⚠️ <strong>Disclaimer:</strong> This module performs basic heuristic image checks only.
        It cannot forensically authenticate documents. A flag does not prove fraud;
        absence of flags does not prove authenticity. For demonstration purposes only.
        <strong> Do not upload real identity documents.</strong>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Upload Document Image</h2>
        <p className="text-sm text-gray-500 mb-4">
          Accepts JPG, PNG, or PDF. Maximum 10 MB. Use synthetic test images only.
        </p>
        {error && <div className="mb-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
            onClick={() => fileRef.current.click()}
          >
            {file ? (
              <div>
                <div className="text-4xl mb-2">📄</div>
                <p className="text-blue-700 font-medium">{file.name}</p>
                <p className="text-gray-400 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  className="text-red-500 text-xs mt-2 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <div className="text-4xl mb-2">📤</div>
                <p className="text-gray-600 font-medium">Click to upload or drag a file here</p>
                <p className="text-gray-400 text-sm mt-1">JPG, PNG, PDF — max 10 MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files[0])}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)} className="input-field">
                <option value="aadhaar">Aadhaar Card</option>
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="driving_license">Driving License</option>
                <option value="voter_id">Voter ID</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Application ID (optional)</label>
              <input
                value={appId}
                onChange={e => setAppId(e.target.value)}
                className="input-field"
                placeholder="APP-XXXXXXXXXX"
              />
            </div>
          </div>
          <button type="submit" disabled={!file || loading} className="btn-primary">
            {loading ? '🔄 Analyzing…' : '🔍 Analyze Document'}
          </button>
        </form>
      </div>

      {result && (
        <div className="card space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Analysis Result</h2>
            <span className={`text-lg font-bold ${result.suspicious ? 'text-red-600' : 'text-green-600'}`}>
              {result.suspicious ? '⚠️ Flags Detected' : '✅ No Flags Detected'}
            </span>
          </div>

          {/* Confidence bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 font-medium">Analysis Confidence</span>
              <span className="font-bold">{confPct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`${confColor} h-3 rounded-full transition-all duration-700`}
                style={{ width: `${confPct}%` }}
              />
            </div>
          </div>

          {/* Flags */}
          {result.flags?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-700 mb-2">Detected Flags:</p>
              <div className="flex flex-wrap gap-2">
                {result.flags.map((f, i) => (
                  <span key={i} className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded-full font-mono">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Extracted fields */}
          {Object.keys(result.extracted_fields || {}).length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Extracted Properties:</p>
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {Object.entries(result.extracted_fields).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-gray-500">{k}: </span>
                    <span className="font-semibold font-mono">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            📋 <strong>Limitation:</strong> {result.note}
          </div>
        </div>
      )}
    </div>
  )
}
