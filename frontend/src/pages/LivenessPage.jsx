import { useState, useRef } from 'react'
import { livenessService } from '../services/services'
import { ErrorAlert, SimulatedBanner } from '../components/Alerts'
import { getErrorMessage } from '../utils/utils'

import CameraCapture from '../components/CameraCapture'

export default function LivenessPage() {
  const [image, setImage] = useState(null)
  const [capturedData, setCapturedData] = useState(null)
  const [useCamera, setUseCamera] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setLoading(true); setError(null); setResult(null)
    try {
      let res
      if (useCamera && capturedData) {
        res = await livenessService.checkJson({
          image_base64: capturedData.base64,
          challenge: capturedData.challenge,
          frames: capturedData.frames,
        })
      } else {
        const fd = new FormData()
        if (image) fd.append('image', image)
        res = await livenessService.check(fd)
      }
      setResult(res.data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Prototype Liveness Verification</h1>
        <span className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-semibold border border-amber-300">
          Prototype Mode Only
        </span>
      </div>

      <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-sm text-red-800 space-y-1">
        <p className="font-bold flex items-center gap-1.5">
          <span>🚨</span> PROTOTYPE NOTICE & ZERO FORENSIC GUARANTEE
        </p>
        <p className="text-xs leading-relaxed">
          Standard facial detection and basic movement heuristics <strong>cannot</strong> reliably prevent 
          photo print presentations, video replays, or deepfakes. Face detection alone is not proof of identity 
          or liveness. Do not use prototype mode in production identity verification.
        </p>
      </div>

      <SimulatedBanner />

      <div className="card space-y-4">
        <div className="flex justify-between items-center pb-2 border-b">
          <h2 className="text-lg font-semibold">Biometric Liveness Assessment</h2>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => { setUseCamera(true); setImage(null) }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                useCamera ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📷 Live Camera Challenge
            </button>
            <button
              type="button"
              onClick={() => { setUseCamera(false); setCapturedData(null) }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                !useCamera ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📁 File Upload (Static Demo)
            </button>
          </div>
        </div>

        {error && <div className="mb-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

        {useCamera ? (
          <div className="space-y-4">
            <CameraCapture
              initialImage={capturedData?.base64}
              onCapture={(data) => {
                if (typeof data === 'string') {
                  setCapturedData({ base64: data, challenge: null, frames: [data] })
                } else {
                  setCapturedData(data)
                }
              }}
              onClear={() => setCapturedData(null)}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !capturedData}
              className="btn-primary"
            >
              {loading ? 'Analyzing frame sequence…' : '👁️ Run Liveness Evaluation on Captured Sequence'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Static Face Image — <span className="text-gray-400">demonstration face detection</span>
              </label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                onClick={() => fileRef.current.click()}
              >
                {image ? (
                  <div>
                    <div className="text-3xl mb-2">🖼️</div>
                    <p className="text-blue-600 font-medium">{image.name}</p>
                    <p className="text-gray-400 text-sm mt-1">{(image.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">👁️</div>
                    <p className="text-gray-600">Click to select a face image (optional)</p>
                    <p className="text-gray-400 text-xs mt-1">JPG or PNG — test images only</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setImage(e.target.files[0])}
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Checking…' : '👁️ Run Static Frame Assessment'}
              </button>
              {image && (
                <button type="button" onClick={() => setImage(null)} className="btn-secondary">
                  Clear Image
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {result && (
        <div className="card space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-lg font-semibold">Liveness Evaluation Result</h2>
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono font-medium">
              Prototype Mode: Active
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Face Detected</p>
              <p className={`text-base font-bold ${result.face_detected ? 'text-green-600' : 'text-red-600'}`}>
                {result.face_detected ? `✓ Yes (${result.face_count || 1})` : '✗ None'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Faces Count</p>
              <p className="text-base font-mono font-bold text-gray-800">
                {result.face_count ?? 0}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Liveness Status</p>
              <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase inline-block ${
                result.liveness_status === 'PASSED_PROTOTYPE_CHALLENGE'
                  ? 'bg-amber-100 text-amber-800'
                  : result.liveness_status === 'UNVERIFIED_STATIC_FRAME'
                  ? 'bg-slate-100 text-slate-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {result.liveness_status || 'UNVERIFIED_PROTOTYPE'}
              </span>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Liveness Score (0–100)</p>
              <p className="text-2xl font-black text-gray-900">
                {result.liveness_score?.toFixed(1) ?? '0.0'}
              </p>
              <p className="text-[10px] text-green-600 font-medium">Biometric verification rating</p>
            </div>
          </div>

          {/* Diagnostic Details */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Diagnostic Details
            </h4>
            {result.diagnostic_details?.diagnostic || result.details?.diagnostic ? (
              <p className="text-xs text-gray-800 bg-white p-2.5 rounded border border-gray-200">
                ℹ️ <strong>Heuristic Assessment:</strong> {result.diagnostic_details?.diagnostic || result.details?.diagnostic}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 pt-1">
              <p>• Challenge Requested: <span className="font-mono">{result.diagnostic_details?.challenge_requested || 'None (Static)'}</span></p>
              <p>• Motion Detected: <span className="font-semibold">{result.diagnostic_details?.motion_detected ? '✓ Yes' : '✗ No'}</span></p>
              <p>• Certified Anti-Spoofing: <span className="text-amber-700 font-semibold">✗ No (Prototype Only)</span></p>
              <p>• Method: <span className="font-mono text-[11px]">{result.method}</span></p>
            </div>

            {result.flags?.length > 0 && (
              <div className="flex gap-1.5 flex-wrap pt-1">
                {result.flags.map((f, i) => (
                  <span key={i} className="text-[10px] font-mono px-2 py-0.5 bg-red-100 text-red-700 rounded border border-red-200">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 leading-relaxed">
            ⚠️ {result.note}
          </div>
        </div>
      )}
    </div>
  )
}
