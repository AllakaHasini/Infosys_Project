import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LandingPage() {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')

  const handleStart = () => {
    if (isAuthenticated) {
      navigate('/ekyc/verify')
    } else {
      navigate('/login')
    }
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#faf9f6]/90 backdrop-blur-md border-b border-neutral-200/70">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2 group min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-xs sm:text-sm tracking-wider shadow-sm group-hover:scale-105 transition-transform flex-shrink-0">
              <span className="text-amber-400">🛡️</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs sm:text-sm tracking-tight text-neutral-900 flex items-center gap-1 truncate">
                MOSIP eKYC
                <span className="hidden sm:inline-block text-[10px] font-semibold bg-neutral-200/80 text-neutral-700 px-1.5 py-0.2 rounded-full">
                  AI Risk
                </span>
              </span>
            </div>
          </Link>

          {/* Center Nav Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-neutral-600">
            <a href="#features" className="hover:text-neutral-900 transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-neutral-900 transition-colors">
              How it works
            </a>
            <a href="#accuracy" className="hover:text-neutral-900 transition-colors">
              Accuracy & Security
            </a>
            <a href="#open-network" className="hover:text-neutral-900 transition-colors">
              Open Network
            </a>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="text-xs font-medium text-neutral-600 hover:text-neutral-900 hidden sm:inline-block"
                >
                  Dashboard ({user?.role || 'user'})
                </Link>
                <button
                  type="button"
                  onClick={() => navigate('/ekyc/verify')}
                  className="bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white rounded-full px-3.5 sm:px-5 py-2 text-xs font-medium transition shadow-sm whitespace-nowrap"
                >
                  Verify Applicant
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-xs font-medium text-neutral-600 hover:text-neutral-900 px-1.5 sm:px-2 py-1"
                >
                  Sign in
                </Link>
                <button
                  type="button"
                  onClick={handleStart}
                  className="bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white rounded-full px-3 sm:px-5 py-2 text-xs font-medium transition shadow-sm whitespace-nowrap"
                >
                  Start verification
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-10 pb-12 sm:pt-20 sm:pb-20 px-3.5 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-4 sm:space-y-5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-neutral-200/80 shadow-xs text-[11px] sm:text-xs text-neutral-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">MOSIP Open Source Identity Architecture</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-neutral-900 leading-[1.15]">
            Verify less, trust more.
          </h1>

          <p className="text-sm sm:text-lg text-neutral-600 max-w-2xl mx-auto leading-relaxed">
            AI-powered eKYC and real-time risk intelligence on MOSIP standards. Assess identity documents,
            biometric liveness, and multi-signal fraud risks in seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 pt-2 sm:pt-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleStart}
              className="w-full sm:w-auto bg-neutral-900 hover:bg-neutral-800 text-white rounded-full px-6 py-3 text-sm font-medium transition shadow-sm hover:scale-[1.02] active:scale-[0.98]"
            >
              Start verification
            </button>
            <Link
              to={isAuthenticated ? '/dashboard' : '/login'}
              className="w-full sm:w-auto bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 rounded-full px-6 py-3 text-sm font-medium transition shadow-xs text-center"
            >
              {isAuthenticated ? 'Open Dashboard' : 'View demo console'}
            </Link>
          </div>

          <div className="pt-1 sm:pt-2 flex items-center justify-center gap-1.5 text-[11px] sm:text-xs text-neutral-500">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Built for MOSIP Open Standards & Synthetic Aadhaar Compliance</span>
          </div>
        </div>
      </section>

      {/* "What you can verify" Section (Inspired by Reference Image 1) */}
      <section id="features" className="py-12 sm:py-16 px-3.5 sm:px-6 border-t border-neutral-200/60">
        <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
          <div className="text-center space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              What you can verify
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500 max-w-md mx-auto">
              Automated multi-layer verification for open digital networks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {/* Card 1: Identity & Aadhaar */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-neutral-200/80 shadow-xs hover:shadow-md transition-all space-y-2.5 sm:space-y-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-xl">
                🆔
              </div>
              <div>
                <h3 className="font-semibold text-base text-neutral-900">Identity & Aadhaar</h3>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  Automated demographic matching, 12-digit UIDAI masking, synthetic tokenization, and MOSIP IDA verification.
                </p>
              </div>
              <ul className="text-[11px] text-neutral-600 space-y-1 pt-1 border-t border-neutral-100">
                <li>• UIDAI compliant masking (XXXX-XXXX-1234)</li>
                <li>• Deterministic demographic score</li>
                <li>• Cross-registry transparency</li>
              </ul>
            </div>

            {/* Card 2: Document Forensics */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-neutral-200/80 shadow-xs hover:shadow-md transition-all space-y-2.5 sm:space-y-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-xl">
                📄
              </div>
              <div>
                <h3 className="font-semibold text-base text-neutral-900">Document Forensics</h3>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  Deep image forensics: Error Level Analysis (ELA), Laplacian sharpness checks, contrast variance, and duplicate hashing.
                </p>
              </div>
              <ul className="text-[11px] text-neutral-600 space-y-1 pt-1 border-t border-neutral-100">
                <li>• ELA digital tampering detection</li>
                <li>• Image blur & quality thresholds</li>
                <li>• SHA-256 duplicate image detection</li>
              </ul>
            </div>

            {/* Card 3: Biometric Liveness */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-neutral-200/80 shadow-xs hover:shadow-md transition-all space-y-2.5 sm:space-y-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-xl">
                📷
              </div>
              <div>
                <h3 className="font-semibold text-base text-neutral-900">Biometric Liveness</h3>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  Prototype facial presence verification with interactive challenge-response head movements and camera stream analysis.
                </p>
              </div>
              <ul className="text-[11px] text-neutral-600 space-y-1 pt-1 border-t border-neutral-100">
                <li>• Front-camera selfie alignment</li>
                <li>• Head turn & blink motion check</li>
                <li>• Front/back camera toggle</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* "Searching now" / Live Interactive Demo Showcase (Inspired by Reference Images 2, 3, 4) */}
      <section id="accuracy" className="py-12 sm:py-16 px-3.5 sm:px-6 bg-white border-t border-b border-neutral-200/60">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-center">
          {/* Left Column: Copy */}
          <div className="space-y-3 sm:space-y-4">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Real-Time Verification
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-neutral-900">
              Verifying now.
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              Open identity verification without friction. The moment an applicant submits credentials,
              the AI risk engine evaluates identity signals, document sharpness, and biometric presence—rendering
              an explainable decision in sub-seconds.
            </p>
            <div className="pt-1 sm:pt-2 flex flex-col gap-2 text-xs text-neutral-600">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] sm:text-[11px]">
                  ✓
                </span>
                <span>Zero full Aadhaar numbers stored in logs or exposed in API</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] sm:text-[11px]">
                  ✓
                </span>
                <span>Explainable weighted risk scores (Low, Medium, High, Very High)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] sm:text-[11px]">
                  ✓
                </span>
                <span>Immutable audit trail recorded for all verification operations</span>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleStart}
                className="w-full sm:w-auto bg-neutral-900 hover:bg-neutral-800 text-white rounded-full px-5 py-2.5 text-xs font-medium transition shadow-sm text-center"
              >
                Try live demo verification →
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Widget Card */}
          <div className="bg-[#faf9f6] rounded-2xl p-4 sm:p-6 border border-neutral-200/90 shadow-sm space-y-3.5 sm:space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div>
                <p className="text-[11px] text-neutral-500 font-medium">Verified Applicant</p>
                <h4 className="font-bold text-sm text-neutral-900">Priya Sharma</h4>
              </div>
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] sm:text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                ✓ APPROVED
              </span>
            </div>

            {/* Signal Meters */}
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-neutral-500 font-medium">AI Risk Score</span>
                  <span className="font-mono font-bold text-emerald-700">12 / 100 (Low Risk)</span>
                </div>
                <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: '12%' }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-neutral-200/80">
                  <span className="text-[9px] sm:text-[10px] text-neutral-400 block font-medium">Identifier</span>
                  <span className="font-mono font-semibold text-xs text-neutral-900">XXXX-XXXX-7777</span>
                  <span className="text-[9px] sm:text-[10px] text-emerald-600 block mt-0.5">UIDAI Masked</span>
                </div>
                <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-neutral-200/80">
                  <span className="text-[9px] sm:text-[10px] text-neutral-400 block font-medium">Doc Quality</span>
                  <span className="font-semibold text-xs text-neutral-900">Sharp (Var: 482)</span>
                  <span className="text-[9px] sm:text-[10px] text-emerald-600 block mt-0.5">ELA Clean</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="pt-1">
                <div className="flex gap-1 p-1 bg-white rounded-xl border border-neutral-200 text-[11px]">
                  {['overview', 'document', 'liveness'].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-1.5 rounded-lg font-medium capitalize transition-all ${
                        activeTab === tab
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="mt-2 p-2.5 sm:p-3 bg-white rounded-xl border border-neutral-200 text-[11px] text-neutral-600 space-y-1">
                  {activeTab === 'overview' && (
                    <p>Demographic match score: 98% • Decision automated via weighted signals.</p>
                  )}
                  {activeTab === 'document' && (
                    <p>Laplacian sharpness variance: 482 • Resolution: 1920x1080 • SHA-256 unique.</p>
                  )}
                  {activeTab === 'liveness' && (
                    <p>Facial presence detected • Challenge-response sequence verified.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* "How it works" Section */}
      <section id="how-it-works" className="py-12 sm:py-16 px-3.5 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-8 sm:space-y-10">
          <div className="text-center space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              How it works
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500 max-w-md mx-auto">
              Three simple steps to trust an identity on any digital network.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-neutral-200/80 shadow-xs space-y-2">
              <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold">
                1
              </div>
              <h3 className="font-semibold text-sm text-neutral-900">Input & Document Upload</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Applicant provides demographics and document photo (Aadhaar, Passport, National ID). Numbers are auto-masked immediately.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-neutral-200/80 shadow-xs space-y-2">
              <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold">
                2
              </div>
              <h3 className="font-semibold text-sm text-neutral-900">Live Camera Selfie</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Applicant completes a rapid interactive challenge-response selfie (head turn or blink) to verify live presence.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-neutral-200/80 shadow-xs space-y-2">
              <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold">
                3
              </div>
              <h3 className="font-semibold text-sm text-neutral-900">Explainable Decision</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                The AI risk engine outputs a composite score (0-100), automated recommendation (APPROVED, MANUAL_REVIEW, REJECTED), and full audit log.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section id="open-network" className="py-12 sm:py-14 px-3.5 sm:px-6 bg-neutral-900 text-white">
        <div className="max-w-4xl mx-auto text-center space-y-3.5 sm:space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Ready to test identity verification?
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
            Experience our guided verification flow with synthetic demo credentials or explore the enterprise administrative dashboard.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 pt-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleStart}
              className="w-full sm:w-auto bg-white hover:bg-neutral-100 text-neutral-900 rounded-full px-6 py-2.5 text-xs font-semibold transition"
            >
              Launch Verification Flow →
            </button>
            <Link
              to="/login"
              className="w-full sm:w-auto bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-full px-6 py-2.5 text-xs font-semibold transition text-center"
            >
              Sign into console
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 sm:py-8 px-3.5 sm:px-6 border-t border-neutral-200/60 bg-[#faf9f6] text-neutral-500 text-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span>🛡️</span>
            <span className="font-semibold text-neutral-700">MOSIP eKYC & Risk Intelligence</span>
            <span>• Infosys Internship</span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Synthetic demographic data & simulated providers only. Not certified for ISO/IEC 30107 production PAD.
          </p>
        </div>
      </footer>
    </div>
  )
}
