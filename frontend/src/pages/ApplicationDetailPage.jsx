import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { applicationsService } from '../services/services'
import { LoadingSpinner, ErrorAlert, SimulatedBanner } from '../components/Alerts'
import { getRiskBadgeClass, getDecisionBadgeClass, formatDate, getErrorMessage } from '../utils/utils'
import { useAuth } from '../hooks/useAuth'

const IMAGE_LABELS = {
  document_base64: 'Identity Document',
  document_front_base64: 'Document (Front Side)',
  document_back_base64: 'Document (Back Side)',
  live_capture_base64: 'Live Selfie / Biometric Capture',
  selfie_base64: 'Selfie',
  face_image_base64: 'Face Image',
  id_document_base64: 'ID Document',
}

const toDataUrl = (base64Str) => {
  if (!base64Str) return null
  if (base64Str.startsWith('data:')) return base64Str
  return `data:image/jpeg;base64,${base64Str}`
}

export default function ApplicationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newDecision, setNewDecision] = useState('')
  const [notes, setNotes] = useState('')
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState(null)

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Images state
  const [images, setImages] = useState(null)
  const [loadingImages, setLoadingImages] = useState(false)
  const [previewImage, setPreviewImage] = useState(null) // {src, label}

  useEffect(() => {
    applicationsService.get(id)
      .then(res => {
        setApp(res.data)
        setNewDecision(res.data.decision)
      })
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id])

  const handleDecisionUpdate = async () => {
    setUpdating(true); setUpdateMsg(null)
    try {
      await applicationsService.updateDecision(id, { decision: newDecision, notes })
      setApp(prev => ({ ...prev, decision: newDecision }))
      setUpdateMsg({ type: 'success', text: `Decision updated to ${newDecision}` })
    } catch (err) {
      setUpdateMsg({ type: 'error', text: getErrorMessage(err) })
    } finally {
      setUpdating(false)
    }
  }

  const handleDeleteApplication = async () => {
    setDeleting(true)
    try {
      await applicationsService.delete(id)
      navigate('/applications')
    } catch (err) {
      setUpdateMsg({ type: 'error', text: 'Failed to delete: ' + (err?.response?.data?.detail || err.message || 'Unknown error') })
      setShowDeleteModal(false)
    } finally {
      setDeleting(false)
    }
  }

  const handleLoadImages = async () => {
    setLoadingImages(true)
    try {
      const res = await applicationsService.getImages(id)
      setImages(res.data.images || {})
    } catch (err) {
      setUpdateMsg({ type: 'error', text: 'Could not load images: ' + (err?.response?.data?.detail || err.message || 'Unknown error') })
    } finally {
      setLoadingImages(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading application…" />
  if (error) return <div className="space-y-3"><Link to="/applications" className="text-blue-600 text-sm">← Back</Link><ErrorAlert message={error} /></div>
  if (!app) return null

  const isAdmin = ['admin', 'superadmin'].includes(user?.role)
  const currentUser = user

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/applications" className="text-blue-600 hover:underline text-sm">← Applications</Link>
          <span className="text-gray-400">/</span>
          <h1 className="text-xl font-bold text-gray-900">Application Detail</h1>
          {app.simulated && (
            <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-1 rounded-full">
              SIMULATED DATA
            </span>
          )}
        </div>
        {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
          <button
            onClick={() => setShowDeleteModal(true)}
            style={{
              padding: '8px 16px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🗑️ Delete Application
          </button>
        )}
      </div>

      {app.simulated && <SimulatedBanner />}

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Application ID</p>
          <p className="font-mono text-sm font-bold text-gray-800 break-all">{app.application_id}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Applicant</p>
          <p className="font-semibold text-gray-900">{app.applicant_name}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-2">Decision</p>
          <span className={getDecisionBadgeClass(app.decision)}>{app.decision}</span>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Risk Score</p>
          <p className="text-3xl font-black text-gray-900">{app.risk_score?.toFixed(1) ?? '—'}</p>
        </div>
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold text-sm mb-3 text-gray-700 border-b pb-2">Applicant Info</h3>
          {[
            ['ID Type', (app.id_type || '—').toUpperCase().replace('_', ' ')],
            ['ID Number', app.masked_id_number || app.id_number || '—'],
            ['Email', app.applicant_email || '—'],
            ['Phone', app.applicant_phone || '—'],
            ['Risk Category', app.risk_category || '—'],
            ['Status', app.status || '—'],
            ['Created', formatDate(app.created_at)],
            ['Updated', formatDate(app.updated_at)],
            ...(app.review_notes ? [['Review Notes', app.review_notes]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2 border-b border-gray-50 text-sm">
              <span className="text-gray-500">{k}</span>
              <span className="font-medium text-gray-900 text-right max-w-[60%] break-words font-mono text-xs">{v}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="font-semibold text-sm mb-3 text-gray-700 border-b pb-2">🔐 Identity Verification</h3>
          {app.identity_result ? (
            <>
              <p className="text-sm py-1"><span className="text-gray-500">Provider:</span> <span className="font-medium">{app.identity_result.provider}</span></p>
              <p className="text-sm py-1">
                <span className="text-gray-500">Verified:</span>{' '}
                <span className={`font-semibold ${app.identity_result.verified ? 'text-green-600' : 'text-red-600'}`}>
                  {app.identity_result.verified ? '✅ Yes' : '❌ No'}
                </span>
              </p>
              {app.identity_result.match_score !== undefined && (
                <p className="text-sm py-1"><span className="text-gray-500">Match Score:</span> <span className="font-medium">{(app.identity_result.match_score * 100).toFixed(0)}%</span></p>
              )}
              <p className="text-xs text-amber-600 mt-3 leading-relaxed bg-amber-50 rounded p-2">{app.identity_result.note}</p>
            </>
          ) : (
            <p className="text-gray-400 text-sm">Not available</p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3 border-b pb-2">
            <h3 className="font-semibold text-sm text-gray-700">👁️ Biometric Liveness</h3>
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
              {app.liveness_result?.prototype_mode ? 'Prototype Mode' : 'Uncertified'}
            </span>
          </div>
          {app.liveness_result ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Provider:</span>
                <span className="font-medium text-gray-900">{app.liveness_result.provider || 'MockLivenessProvider'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Face Detected:</span>
                <span className={`font-semibold ${app.liveness_result.face_detected ? 'text-green-600' : 'text-gray-600'}`}>
                  {app.liveness_result.face_detected ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Face Count:</span>
                <span className="font-mono text-gray-900">{app.liveness_result.face_count ?? (app.liveness_result.face_detected ? 1 : 0)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Liveness Status:</span>
                <span className="font-bold text-xs uppercase px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono">
                  {app.liveness_result.liveness_status || (app.liveness_result.live ? 'UNVERIFIED_PROTOTYPE' : 'FAILED')}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Liveness Score:</span>
                <span className="font-semibold text-gray-900">
                  {app.liveness_result.liveness_score !== undefined
                    ? `${Number(app.liveness_result.liveness_score).toFixed(1)}/100`
                    : `${Math.round((app.liveness_result.confidence || 0) * 100)}/100`}
                </span>
              </div>
              {(app.liveness_result.diagnostic_details?.diagnostic || app.liveness_result.details?.diagnostic) && (
                <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                  ℹ️ {app.liveness_result.diagnostic_details?.diagnostic || app.liveness_result.details?.diagnostic}
                </div>
              )}
              <p className="text-xs text-red-600 mt-2 bg-red-50 rounded p-2 leading-relaxed">
                ⚠️ {app.liveness_result.note || 'Prototype demonstration only. Basic face detection and motion heuristics cannot prevent photo or video spoofing. Certified biometric anti-spoofing is required for production.'}
              </p>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Not available</p>
          )}
        </div>
      </div>

      {/* Administrative Cross-Reference Diagnostics - visible to admins only */}
      {isAdmin && app.cross_reference && (
        <div className="card border-l-4 border-slate-600 bg-slate-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
              <span>🛡️</span> Administrative Technical Diagnostics: External Registries
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
              app.cross_reference.status === 'VERIFIED_MOSIP' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'
            }`}>
              {app.cross_reference.status === 'VERIFIED_MOSIP' ? 'MOSIP Connected' : 'Sandbox / Mock Mode'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700 mt-2">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <p className="font-semibold text-slate-900 mb-1">Configured Identity Sources:</p>
              <p>• MOSIP IDA: {app.cross_reference.sources_checked?.length > 0 ? 'Connected' : 'Simulated Sandbox'}</p>
              <p>• UIDAI CIDR: <span className="text-amber-700 font-medium">Not Configured (Unintegrated)</span></p>
              <p>• DigiLocker API: <span className="text-amber-700 font-medium">Not Configured (Unintegrated)</span></p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <p className="font-semibold text-slate-900 mb-1">Data Privacy & Integrity Standard:</p>
              <p className="text-slate-500 leading-relaxed">{app.cross_reference.note}</p>
            </div>
          </div>
        </div>
      )}

      {/* Document Fraud Analysis Card if available */}
      {app.document_result && (
        <div className="card border-l-4 border-indigo-500">
          <div className="flex items-center justify-between mb-3 border-b pb-2">
            <h3 className="font-semibold text-gray-800">📄 Document Fraud & Visual Heuristics</h3>
            <span className={`text-xs px-2.5 py-1 rounded font-semibold ${
              (app.document_result.suspicious || app.document_result.suspicious_detected) ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
            }`}>
              {(app.document_result.suspicious || app.document_result.suspicious_detected) ? '⚠️ Suspicious Indicators' : '✓ Quality Check Passed'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Quality Score</p>
              <p className="text-xl font-bold text-gray-800">
                {app.document_result.quality_score ?? (app.document_result.risk_score !== undefined ? (100 - app.document_result.risk_score).toFixed(0) : 'N/A')}/100
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Duplicate Check</p>
              <p className="font-medium text-gray-800">
                {(app.document_result.duplicate_detected || (app.document_result.flags && app.document_result.flags.includes('DUPLICATE_DOCUMENT_UPLOAD'))) ? '⚠️ Duplicate Found' : '✓ Unique'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Sharpness (Laplacian)</p>
              <p className="font-mono text-gray-800">
                {app.document_result.quality_metrics?.sharpness_score?.toFixed(1) ?? app.document_result.measured_metrics?.sharpness?.toFixed(1) ?? 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Contrast (StdDev)</p>
              <p className="font-mono text-gray-800">
                {app.document_result.quality_metrics?.contrast_stddev?.toFixed(1) ?? app.document_result.measured_metrics?.contrast?.toFixed(1) ?? 'N/A'}
              </p>
            </div>
          </div>
          {app.document_result.flags?.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">Detected Evidence Flags:</p>
              <div className="flex flex-wrap gap-1.5">
                {app.document_result.flags.map((flag, idx) => (
                  <span key={idx} className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded border border-red-200 font-mono">
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 italic">
            Limitations: {app.document_result.limitations || app.document_result.analysis_limitations || 'Heuristic quality analysis only. Not certified forensic validation.'}
          </p>
        </div>
      )}

      {/* Risk Assessment */}
      {app.risk_assessment && (
        <div className="card">
          <h3 className="font-semibold mb-4 border-b pb-2">⚠️ Risk Assessment</h3>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <p className="text-xs text-gray-500 mb-1">Score</p>
              <p className="text-4xl font-black text-gray-900">{app.risk_assessment.score?.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Category</p>
              <span className={getRiskBadgeClass(app.risk_assessment.category)}>{app.risk_assessment.category}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Recommended Decision</p>
              <span className={getDecisionBadgeClass(app.risk_assessment.decision)}>{app.risk_assessment.decision}</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-3 text-gray-700">Risk Factors:</p>
            <ul className="space-y-2">
              {app.risk_assessment.reasons?.map((r, i) => (
                <li key={i} className="text-sm text-gray-600 flex gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-400 mt-0.5 flex-shrink-0">→</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-gray-400 mt-4 italic">{app.risk_assessment.model_note}</p>
        </div>
      )}

      {/* Manual Decision Override — admin only */}
      {isAdmin && (
        <div className="card border-l-4 border-purple-500 bg-purple-50">
          <h3 className="font-semibold mb-2 text-purple-900">Manual Decision Override (Admin)</h3>
          <p className="text-sm text-purple-700 mb-4">
            Override the system's decision as an administrator.
            This action is permanently recorded in the audit trail.
          </p>

          {updateMsg && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${updateMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {updateMsg.type === 'success' ? '✅' : '❌'} {updateMsg.text}
            </div>
          )}

          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Decision</label>
              <select
                value={newDecision}
                onChange={e => setNewDecision(e.target.value)}
                className="input-field"
              >
                <option value="APPROVED">✅ APPROVED</option>
                <option value="MANUAL_REVIEW">🔍 MANUAL_REVIEW</option>
                <option value="REJECTED">❌ REJECTED</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Review Notes</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="input-field"
                placeholder="Reason for override (optional)…"
              />
            </div>
            <button
              onClick={handleDecisionUpdate}
              disabled={updating || newDecision === app.decision}
              className="btn-primary"
            >
              {updating ? 'Updating…' : 'Update Decision'}
            </button>
          </div>
        </div>
      )}

      {/* Admin-only: Uploaded Evidence Images */}
      {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
        <div style={{
          background: 'white', border: '2px solid #7c3aed', borderRadius: '12px',
          padding: '24px', marginTop: '24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span style={{
                fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px',
                color: '#7c3aed', fontWeight: 600,
              }}>🔒 Admin Only</span>
              <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 700 }}>
                📷 Uploaded Evidence Files
              </h3>
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: '13px' }}>
                Identity documents and biometric captures submitted by the applicant.
              </p>
            </div>
            <button
              onClick={handleLoadImages}
              disabled={loadingImages}
              style={{
                padding: '10px 20px', background: '#7c3aed', color: 'white',
                border: 'none', borderRadius: '8px', cursor: loadingImages ? 'wait' : 'pointer',
                fontSize: '14px', fontWeight: 500,
              }}
            >
              {loadingImages ? '⏳ Loading...' : images === null ? '📂 Load Images' : '🔄 Refresh Images'}
            </button>
          </div>

          {images === null && (
            <div style={{
              textAlign: 'center', padding: '32px', background: '#f9f5ff',
              borderRadius: '8px', color: '#7c3aed',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
              <p style={{ margin: 0, color: '#666' }}>
                Click "Load Images" to view uploaded documents and biometric captures.
              </p>
            </div>
          )}

          {images !== null && Object.keys(images).length === 0 && (
            <div style={{
              textAlign: 'center', padding: '32px', background: '#fef2f2',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
              <p style={{ margin: 0, color: '#666' }}>No uploaded images found for this application.</p>
            </div>
          )}

          {images !== null && Object.keys(images).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {Object.entries(images).map(([field, base64Str]) => {
                const label = IMAGE_LABELS[field] || field
                const src = toDataUrl(base64Str)
                return (
                  <div
                    key={field}
                    style={{
                      border: '1px solid #e5e7eb', borderRadius: '10px',
                      overflow: 'hidden', background: '#f9fafb',
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      <img
                        src={src}
                        alt={label}
                        style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
                        onError={e => { e.target.style.display = 'none' }}
                      />
                      <button
                        onClick={() => setPreviewImage({ src, label })}
                        style={{
                          position: 'absolute', bottom: '8px', right: '8px',
                          background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none',
                          borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px',
                        }}
                      >
                        🔍 View Full Size
                      </button>
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#374151' }}>{label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#9ca3af' }}>
                        {Math.round(base64Str.length * 0.75 / 1024)} KB
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'white', borderRadius: '12px', padding: '32px',
            maxWidth: '460px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗑️</div>
            <h3 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 700, color: '#111' }}>
              Delete Application?
            </h3>
            <p style={{ color: '#555', marginBottom: '8px' }}>
              Are you sure you want to delete application <strong>{id}</strong>?
            </p>
            <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '28px' }}>
              ⚠️ This action cannot be undone. All associated records and uploaded files will be removed.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  padding: '10px 24px', border: '1px solid #ccc', borderRadius: '8px',
                  background: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteApplication}
                disabled={deleting}
                style={{
                  padding: '10px 24px', background: '#dc2626', color: 'white',
                  border: 'none', borderRadius: '8px', cursor: deleting ? 'wait' : 'pointer',
                  fontSize: '14px', fontWeight: 600,
                }}
              >
                {deleting ? 'Deleting...' : '🗑️ Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox / Fullscreen Preview */}
      {previewImage && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1001, flexDirection: 'column',
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div style={{ position: 'absolute', top: '20px', right: '24px', display: 'flex', gap: '12px' }}>
            <a
              href={previewImage.src}
              download={`${previewImage.label}.jpg`}
              onClick={e => e.stopPropagation()}
              style={{
                color: 'white', textDecoration: 'none', background: 'rgba(255,255,255,0.15)',
                padding: '8px 16px', borderRadius: '6px', fontSize: '14px',
              }}
            >
              ⬇️ Download
            </a>
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                color: 'white', background: 'rgba(255,255,255,0.15)', border: 'none',
                padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
              }}
            >
              ✕ Close
            </button>
          </div>
          <p style={{ color: '#ccc', marginBottom: '12px', fontSize: '14px' }}>{previewImage.label}</p>
          <img
            src={previewImage.src}
            alt={previewImage.label}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
          />
          <p style={{ color: '#888', marginTop: '12px', fontSize: '12px' }}>
            Click outside the image to close
          </p>
        </div>
      )}
    </div>
  )
}
