import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ekycService } from '../services/services'
import CameraCapture from '../components/CameraCapture'
import { ErrorAlert, SimulatedBanner, LoadingSpinner, AlreadyRegisteredModal } from '../components/Alerts'
import { getRiskBadgeClass, getDecisionBadgeClass, getErrorMessage } from '../utils/utils'

const INITIAL_FORM = {
  full_name: '',
  date_of_birth: '',
  gender: 'male',
  nationality: 'India',
  id_type: 'aadhaar',
  id_number: '',
  email: '',
  phone: '',
  address: '',
}

const DEMO_VALUES = {
  full_name: 'Priya Sharma',
  date_of_birth: '1992-07-24',
  gender: 'female',
  nationality: 'India',
  id_type: 'aadhaar',
  id_number: '5555-6666-7777',
  email: 'priya.sharma@demo.test',
  phone: '+91 98765 43210',
  address: '42 MG Road, Cyber City, Bengaluru, Karnataka 560001',
}

const STEPS = [
  { id: 1, title: 'Applicant Details', icon: '👤' },
  { id: 2, title: 'Document Type', icon: '🆔' },
  { id: 3, title: 'Upload Document', icon: '📄' },
  { id: 4, title: 'Live Selfie', icon: '📷' },
  { id: 5, title: 'Review & Submit', icon: '📋' },
]

export default function EKYCVerifyPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [form, setForm] = useState(INITIAL_FORM)
  const [frontDocBase64, setFrontDocBase64] = useState(null)
  const [frontDocFileName, setFrontDocFileName] = useState('')
  const [backDocBase64, setBackDocBase64] = useState(null)
  const [backDocFileName, setBackDocFileName] = useState('')
  const [liveCaptureBase64, setLiveCaptureBase64] = useState(null)
  const [liveChallenge, setLiveChallenge] = useState(null)
  const [liveChallengeFrames, setLiveChallengeFrames] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleFrontFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFrontDocFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setFrontDocBase64(reader.result)
    reader.readAsDataURL(file)
  }

  const handleBackFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBackDocFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setBackDocBase64(reader.result)
    reader.readAsDataURL(file)
  }

  const maskDisplayId = (id) => {
    if (!id) return ''
    const clean = id.replace(/[\s-]/g, '')
    if (clean.length < 4) return '••••'
    return 'XXXX-XXXX-' + clean.slice(-4)
  }

  const validateStep = (step) => {
    setError(null)
    if (step === 1) {
      if (!form.full_name || form.full_name.trim().length < 2) {
        setError('Please provide a valid full name (minimum 2 characters).')
        return false
      }
      if (!form.date_of_birth) {
        setError('Please select date of birth.')
        return false
      }
      if (!form.phone || form.phone.trim().length < 7) {
        setError('Phone number is required. Please enter a valid phone number.')
        return false
      }
    } else if (step === 2) {
      if (!form.id_number || form.id_number.trim().length < 4) {
        setError('Please enter a valid ID number.')
        return false
      }
      if (form.id_type === 'aadhaar') {
        const clean = form.id_number.replace(/[\s-]/g, '')
        if (clean.length !== 12 || !/^\d{12}$/.test(clean)) {
          setError('Aadhaar number must consist of 12 numerical digits (e.g., 5555-6666-7777).')
          return false
        }
      }
    } else if (step === 3) {
      if (!frontDocBase64) {
        setError('Please upload at least the front side of your identity document.')
        return false
      }
    } else if (step === 4) {
      if (!liveCaptureBase64) {
        setError('Please capture your live camera photo or upload a sample selfie to proceed.')
        return false
      }
    }
    return true
  }

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 5))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const prevStep = () => {
    setError(null)
    setCurrentStep((prev) => Math.max(prev - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2)) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const payload = {
        applicant: form,
        document_base64: frontDocBase64,
        document_front_base64: frontDocBase64,
        document_back_base64: backDocBase64,
        document_filename: frontDocFileName || 'front_document.png',
        live_capture_base64: liveCaptureBase64,
        live_challenge: liveChallenge,
        live_challenge_frames: liveChallengeFrames,
      }
      const res = await ekycService.verify(payload)
      setResult(res.data)
      setCurrentStep(6) // Result View
      window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const resetAll = () => {
    setForm(INITIAL_FORM)
    setFrontDocBase64(null)
    setFrontDocFileName('')
    setBackDocBase64(null)
    setBackDocFileName('')
    setLiveCaptureBase64(null)
    setResult(null)
    setError(null)
    setCurrentStep(1)
  }

  const cls = 'input-field'

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <AlreadyRegisteredModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
      />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Guided eKYC Verification</h1>
        <p className="text-gray-500 text-sm mt-1">
          End-to-end identity proofing with Aadhaar support, document fraud scoring, and live camera capture.
        </p>
      </div>

      <SimulatedBanner />

      {error && (
        <ErrorAlert message={error} onDismiss={() => setError(null)} />
      )}

      {/* Stepper Header (visible on steps 1-5) */}
      {currentStep <= 5 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            {STEPS.map((s) => {
              const isActive = currentStep === s.id
              const isPast = currentStep > s.id
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    if (isPast) setCurrentStep(s.id)
                  }}
                  className={`flex flex-col items-center flex-1 cursor-pointer transition-all ${
                    isActive
                      ? 'text-blue-600 font-semibold'
                      : isPast
                      ? 'text-gray-700 hover:text-blue-500'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold mb-0.5 sm:mb-1 transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-200'
                        : isPast
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isPast ? '✓' : s.icon}
                  </div>
                  <span className="text-xs text-center hidden sm:block">{s.title}</span>
                </div>
              )
            })}
          </div>
          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${((currentStep - 1) / 4) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step 1: Applicant Details */}
      {currentStep === 1 && (
        <div className="card space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Step 1: Applicant Information</h2>
              <p className="text-xs text-gray-500">Provide basic identity details for verification.</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(DEMO_VALUES)}
              className="btn-secondary text-xs"
            >
              📋 Load Synthetic Demo Data
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Legal Name *</label>
              <input
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className={cls}
                required
                placeholder="e.g. Priya Sharma"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
              <input
                type="date"
                name="date_of_birth"
                value={form.date_of_birth}
                onChange={handleChange}
                className={cls}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
              <select name="gender" value={form.gender} onChange={handleChange} className={cls}>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nationality *</label>
              <input
                name="nationality"
                value={form.nationality}
                onChange={handleChange}
                className={cls}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className={cls}
                placeholder="priya.sharma@example.test"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className={cls}
                placeholder="+91 98765 43210"
                required
                type="tel"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Residential Address</label>
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                className={cls}
                rows={2}
                placeholder="Synthetic test address only"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button type="button" onClick={nextStep} className="btn-primary w-full sm:w-auto">
              Continue to Document Type →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Document Type Selection */}
      {currentStep === 2 && (
        <div className="card space-y-4">
          <div className="pb-3 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Step 2: Document Type & Identifier</h2>
            <p className="text-xs text-gray-500">Select the official proof of identity.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Identity Document Type *</label>
              <select name="id_type" value={form.id_type} onChange={handleChange} className={cls}>
                <option value="aadhaar">🇮🇳 Aadhaar Card (UIDAI)</option>
                <option value="pan">💳 PAN Card (Income Tax Dept)</option>
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="driving_license">Driving License</option>
                <option value="voter_id">Voter ID</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.id_type === 'aadhaar' ? 'Aadhaar Number (12 Digits) *' : 'Document ID Number *'}
              </label>
              <input
                name="id_number"
                value={form.id_number}
                onChange={handleChange}
                className={cls}
                required
                placeholder={form.id_type === 'aadhaar' ? '5555-6666-7777' : 'e.g. DL-1234567'}
              />
            </div>
          </div>

          {form.id_type === 'aadhaar' && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-800 space-y-1.5">
              <p className="font-semibold text-sky-900 flex items-center gap-1.5">
                <span>🛡️</span> UIDAI Masking & Synthetic Data Policy
              </p>
              <p>
                In compliance with identity security practices, full 12-digit Aadhaar numbers are never stored in plaintext
                or logged. All backend records and UI displays automatically mask the number as{' '}
                <span className="font-mono font-bold">XXXX-XXXX-1234</span>.
              </p>
              <p className="text-sky-700">
                <strong>Notice:</strong> Please use synthetic 12-digit numbers (e.g. 5555-6666-7777). Never use real Aadhaar credentials.
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={prevStep} className="btn-secondary w-full sm:w-auto">
              ← Back
            </button>
            <button type="button" onClick={nextStep} className="btn-primary w-full sm:w-auto">
              Continue to Document Upload →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Document Upload */}
      {currentStep === 3 && (
        <div className="card space-y-4">
          <div className="pb-3 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Step 3: Document Upload & Evidence</h2>
            <p className="text-xs text-gray-500">
              Upload clear photos or scans of your {form.id_type === 'aadhaar' ? 'Aadhaar Card' : 'identity document'}.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Front Upload */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center hover:border-blue-500 transition-colors bg-gray-50/50">
              <div className="text-3xl mb-2">📄</div>
              <p className="text-sm font-semibold text-gray-800">
                Front Side {form.id_type === 'aadhaar' ? '(Photo & UID)' : ''} *
              </p>
              <p className="text-xs text-gray-500 mt-1 mb-3">JPEG, PNG, or PDF up to 10MB</p>

              {frontDocBase64 ? (
                <div className="space-y-2">
                  <div className="h-32 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
                    <img
                      src={frontDocBase64}
                      alt="Front preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-green-700 font-medium truncate">✓ {frontDocFileName || 'Front side selected'}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setFrontDocBase64(null)
                      setFrontDocFileName('')
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove front document
                  </button>
                </div>
              ) : (
                <label className="btn-secondary text-xs cursor-pointer inline-block">
                  <span>Browse Front File</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={handleFrontFile}
                  />
                </label>
              )}
            </div>

            {/* Back Upload */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center hover:border-blue-500 transition-colors bg-gray-50/50">
              <div className="text-3xl mb-2">🔄</div>
              <p className="text-sm font-semibold text-gray-800">
                Back Side {form.id_type === 'aadhaar' ? '(Address & QR)' : '(Optional)'}
              </p>
              <p className="text-xs text-gray-500 mt-1 mb-3">Recommended for address proof & Aadhaar</p>

              {backDocBase64 ? (
                <div className="space-y-2">
                  <div className="h-32 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
                    <img
                      src={backDocBase64}
                      alt="Back preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-green-700 font-medium truncate">✓ {backDocFileName || 'Back side selected'}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setBackDocBase64(null)
                      setBackDocFileName('')
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove back document
                  </button>
                </div>
              ) : (
                <label className="btn-secondary text-xs cursor-pointer inline-block">
                  <span>Browse Back File</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={handleBackFile}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            🔍 <strong>Document Quality & Integrity Note:</strong> The automated document analyzer performs
            Laplacian sharpness variance checks, contrast inspection, Error Level Analysis (ELA) compression check,
            and duplicate upload hashing. Please avoid blurry or heavily compressed scans.
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={prevStep} className="btn-secondary w-full sm:w-auto">
              ← Back
            </button>
            <button type="button" onClick={nextStep} className="btn-primary w-full sm:w-auto">
              Continue to Live Selfie →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Live Camera Capture */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <CameraCapture
            initialImage={liveCaptureBase64}
            onCapture={(data) => {
              if (typeof data === 'string') {
                setLiveCaptureBase64(data)
                setLiveChallenge(null)
                setLiveChallengeFrames([data])
              } else {
                setLiveCaptureBase64(data.base64)
                setLiveChallenge(data.challenge)
                setLiveChallengeFrames(data.frames)
              }
            }}
            onClear={() => {
              setLiveCaptureBase64(null)
              setLiveChallenge(null)
              setLiveChallengeFrames(null)
            }}
          />

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 flex flex-col-reverse sm:flex-row justify-between items-center gap-3">
            <button type="button" onClick={prevStep} className="btn-secondary w-full sm:w-auto min-h-[44px]">
              ← Back
            </button>
            <button
              type="button"
              onClick={nextStep}
              className="btn-primary w-full sm:w-auto min-h-[44px]"
              disabled={!liveCaptureBase64}
            >
              Review & Submit →
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review & Submit */}
      {currentStep === 5 && (
        <div className="card space-y-5">
          <div className="pb-3 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Step 5: Review Application & Submit</h2>
            <p className="text-xs text-gray-500">Confirm all applicant data and evidence before running verification.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div>
              <p className="text-xs text-gray-500">Applicant Full Name</p>
              <p className="font-semibold text-gray-900">{form.full_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Date of Birth / Gender</p>
              <p className="font-semibold text-gray-900">{form.date_of_birth} ({form.gender})</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Document Type</p>
              <p className="font-semibold text-gray-900 uppercase">{form.id_type.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Masked ID Number</p>
              <p className="font-mono font-semibold text-gray-900">{maskDisplayId(form.id_number)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Contact</p>
              <p className="text-gray-800 break-words">{form.email || '—'} / {form.phone || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Address</p>
              <p className="text-gray-800 break-words">{form.address || '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 bg-white border border-gray-200 rounded-lg text-center">
              <span className="text-xs text-gray-500 block mb-1">Front Document</span>
              <span className={`text-xs font-semibold ${frontDocBase64 ? 'text-green-600' : 'text-red-500'}`}>
                {frontDocBase64 ? '✓ Attached' : '✗ Missing'}
              </span>
            </div>
            <div className="p-3 bg-white border border-gray-200 rounded-lg text-center">
              <span className="text-xs text-gray-500 block mb-1">Back Document</span>
              <span className="text-xs font-semibold text-gray-600">
                {backDocBase64 ? '✓ Attached' : '— Optional'}
              </span>
            </div>
            <div className="p-3 bg-white border border-gray-200 rounded-lg text-center">
              <span className="text-xs text-gray-500 block mb-1">Live Capture</span>
              <span className={`text-xs font-semibold ${liveCaptureBase64 ? 'text-green-600' : 'text-red-500'}`}>
                {liveCaptureBase64 ? '✓ Ready' : '✗ Missing'}
              </span>
            </div>
          </div>

          {loading && (
            <LoadingSpinner text="Running MOSIP identity check, document fraud detection, and prototype liveness assessment…" />
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={prevStep} disabled={loading} className="btn-secondary w-full sm:w-auto">
              ← Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary w-full sm:w-auto px-6 py-2.5 text-base shadow-lg shadow-blue-600/30"
            >
              {loading ? 'Processing eKYC…' : '🚀 Submit for eKYC Verification'}
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Results Screen */}
      {currentStep === 6 && result && (
        <div className="space-y-5">
          {/* ── Main Summary Card ─────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5">
            {/* Header row */}
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-0.5">eKYC Assessment</p>
                <h2 className="text-xl font-bold text-gray-900">Verification Results</h2>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link
                  to={`/applications/${result.application_id}`}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  View Full Record →
                </Link>
                <button
                  type="button"
                  onClick={resetAll}
                  className="btn-primary text-xs px-4 py-2"
                >
                  + New Verification
                </button>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
              <div>
                <p className="text-[11px] text-gray-500 mb-1">Application ID</p>
                <p className="font-mono text-xs font-bold text-gray-900 leading-tight">{result.application_id}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 mb-1.5">Final Decision</p>
                <span className={getDecisionBadgeClass(result.decision)}>{result.decision}</span>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 mb-0.5">Risk Score (0–100)</p>
                <p className="text-4xl font-black text-gray-900 leading-none">{result.risk_score?.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 mb-1.5">Risk Category</p>
                <span className={getRiskBadgeClass(result.risk_category)}>{result.risk_category}</span>
              </div>
            </div>

            {/* Evidence factors */}
            {result.risk_reasons?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Explainable Evidence Factors:</p>
                <ul className="space-y-1">
                  {result.risk_reasons.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-600">
                      <span className="text-blue-500 font-bold flex-shrink-0">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Three Sub-cards ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* ① MOSIP Identity card */}
            <div className="bg-white rounded-2xl border-2 border-sky-300 shadow-sm p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm text-gray-900">🔐 MOSIP<br/>Identity</h3>
                <span className={`text-[11px] px-2 py-1 rounded-lg font-semibold leading-tight text-center whitespace-nowrap ${
                  result.identity_result?.simulated
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-sky-100 text-sky-800'
                }`}>
                  {result.identity_result?.simulated
                    ? 'MOCK_MOSIP\n(Sandbox)'
                    : (result.identity_result?.provider || 'MOSIP IDA')}
                </span>
              </div>

              <p className="text-xs text-gray-600">
                ID: <span className="font-mono font-semibold text-gray-900">
                  {maskDisplayId(result.applicant?.id_number || form.id_number)}
                </span>
              </p>

              <p className={`text-sm font-semibold ${result.identity_result?.verified ? 'text-green-700' : 'text-red-600'}`}>
                {result.identity_result?.verified ? '✅ Demographics Match Verified' : '❌ Verification Failed'}
              </p>

              {result.identity_result?.note && (
                <p className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-100 pt-2">
                  {result.identity_result.note}
                </p>
              )}
            </div>

            {/* ② Document Analysis card */}
            <div className="bg-white rounded-2xl border-2 border-indigo-300 shadow-sm p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm text-gray-900">📄 Document<br/>Analysis</h3>
                <span className={`text-[11px] px-2 py-1 rounded-lg font-semibold ${
                  (result.document_result?.suspicious || result.document_result?.suspicious_detected)
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {(result.document_result?.suspicious || result.document_result?.suspicious_detected)
                    ? '⚠️ Anomalies'
                    : '✓ Quality Passed'}
                </span>
              </div>

              <div className="text-xs text-gray-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Quality Score:</span>
                  <span className="font-semibold">
                    {result.document_result?.quality_score
                      ?? (result.document_result?.risk_score !== undefined
                          ? (100 - result.document_result.risk_score).toFixed(0)
                          : 'N/A')}/100
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Duplicate Hash:</span>
                  <span className={`font-semibold ${
                    (result.document_result?.duplicate_detected ||
                     result.document_result?.flags?.includes('DUPLICATE_DOCUMENT_UPLOAD'))
                      ? 'text-red-600' : 'text-green-700'
                  }`}>
                    {(result.document_result?.duplicate_detected ||
                      result.document_result?.flags?.includes('DUPLICATE_DOCUMENT_UPLOAD'))
                      ? '⚠️ Found' : '✓ Unique'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Sharpness (Laplacian):</span>
                  <span className="font-mono font-semibold">
                    {result.document_result?.quality_metrics?.sharpness_score?.toFixed(1)
                      ?? result.document_result?.measured_metrics?.sharpness?.toFixed(1)
                      ?? 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Contrast (StdDev):</span>
                  <span className="font-mono font-semibold">
                    {result.document_result?.quality_metrics?.contrast_stddev?.toFixed(1)
                      ?? result.document_result?.measured_metrics?.contrast?.toFixed(1)
                      ?? 'N/A'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-2">
                {result.document_result?.limitations
                  || result.document_result?.analysis_limitations
                  || 'Heuristic image processing is a preliminary filter, NOT forensic authentication. A high risk score flags the document for manual review rather than definitive fraud.'}
              </p>
            </div>

            {/* ③ Biometric Liveness card */}
            <div className="bg-white rounded-2xl border-2 border-purple-300 shadow-sm p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm text-gray-900">👁️ Biometric<br/>Liveness</h3>
                <span className="text-[11px] px-2 py-1 rounded-lg font-semibold bg-amber-100 text-amber-800">
                  Prototype<br/>(Uncertified)
                </span>
              </div>

              {/* Core liveness fields — matching screenshot layout */}
              <div className="text-xs text-gray-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Face Detected:</span>
                  <span className={`font-semibold ${result.liveness_result?.face_detected ? 'text-green-700' : 'text-red-600'}`}>
                    {result.liveness_result?.face_detected ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                {result.liveness_result?.face_count != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Faces Count:</span>
                    <span className={`font-semibold ${result.liveness_result.face_count === 1 ? 'text-green-700' : 'text-orange-600'}`}>
                      {result.liveness_result.face_count}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-start gap-2">
                  <span className="text-gray-500 flex-shrink-0">Status:</span>
                  <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-right leading-snug">
                    {result.liveness_result?.liveness_status || 'UNVERIFIED_PROTOTYPE'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Liveness Score:</span>
                  <span className={`font-bold text-sm ${
                    (result.liveness_result?.liveness_score ?? 0) >= 70 ? 'text-green-700'
                    : (result.liveness_result?.liveness_score ?? 0) >= 40 ? 'text-amber-700'
                    : 'text-red-600'
                  }`}>
                    {result.liveness_result?.liveness_score?.toFixed(1) ?? '0.0'}/100
                    <span className="text-[10px] text-blue-500 font-normal ml-1">(biometric verification)</span>
                  </span>
                </div>
                {result.liveness_result?.challenge_passed != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Challenge:</span>
                    <span className={`font-semibold ${result.liveness_result.challenge_passed ? 'text-green-700' : 'text-orange-600'}`}>
                      {result.liveness_result.challenge_passed ? '✓ Passed' : '— Not completed'}
                    </span>
                  </div>
                )}
              </div>

              {/* Contextual notes — shown conditionally */}
              <div className="space-y-1.5">
                {/* Static frame / no challenge note */}
                {result.liveness_result?.liveness_status === 'UNVERIFIED_STATIC_FRAME' && (
                  <div className="flex gap-1.5 bg-blue-50 border border-blue-200 rounded-lg p-2">
                    <span className="text-blue-500 flex-shrink-0 text-xs">ℹ️</span>
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      Single image face presence detected, but live challenge is unverified. Complete live camera challenge for full verification.
                    </p>
                  </div>
                )}

                {/* Multiple faces warning */}
                {result.liveness_result?.face_count > 1 && (
                  <div className="flex gap-1.5 bg-orange-50 border border-orange-200 rounded-lg p-2">
                    <span className="text-orange-500 flex-shrink-0 text-xs">⚠️</span>
                    <p className="text-[11px] text-orange-800 leading-relaxed">
                      Multiple faces detected. Ensure only one person is in frame.
                    </p>
                  </div>
                )}

                {/* No face warning */}
                {result.liveness_result?.face_detected === false && (
                  <div className="flex gap-1.5 bg-red-50 border border-red-200 rounded-lg p-2">
                    <span className="text-red-500 flex-shrink-0 text-xs">✗</span>
                    <p className="text-[11px] text-red-800 leading-relaxed">
                      No face found. Center your face in the camera with good lighting and retry.
                    </p>
                  </div>
                )}

                {/* Challenge failure */}
                {result.liveness_result?.challenge_passed === false && result.liveness_result?.liveness_status !== 'UNVERIFIED_STATIC_FRAME' && (
                  <div className="flex gap-1.5 bg-orange-50 border border-orange-200 rounded-lg p-2">
                    <span className="text-orange-500 flex-shrink-0 text-xs">⚠️</span>
                    <p className="text-[11px] text-orange-800 leading-relaxed">
                      Live challenge not completed. Follow the on-screen instructions carefully.
                    </p>
                  </div>
                )}

                {/* Diagnostic message */}
                {(result.liveness_result?.diagnostic_details?.diagnostic || result.liveness_result?.details?.diagnostic) && (
                  <div className="flex gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <span className="text-slate-500 flex-shrink-0 text-xs">ℹ️</span>
                    <p className="text-[11px] text-slate-700 leading-relaxed">
                      {result.liveness_result?.diagnostic_details?.diagnostic || result.liveness_result?.details?.diagnostic}
                    </p>
                  </div>
                )}

                {/* Always-on spoofing caveat */}
                <p className="text-[11px] text-red-500 leading-tight pt-0.5">
                  ⚠️ Basic motion checks do not prevent 2D photo, video replay, or deepfake spoofing.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
