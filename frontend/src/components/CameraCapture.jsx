import { useState, useRef, useEffect, useCallback } from 'react'

const CHALLENGES = [
  {
    id: 'turn_left',
    title: 'Turn Head Left',
    direction: 'left',
    instruction: 'Slowly turn your head to your LEFT (towards your left shoulder)',
    hint: 'Keep your face inside the guide. Turn slightly — do not rotate your phone.',
    icon: '👈',
  },
  {
    id: 'turn_right',
    title: 'Turn Head Right',
    direction: 'right',
    instruction: 'Slowly turn your head to your RIGHT (towards your right shoulder)',
    hint: 'Keep your face inside the guide. Turn slightly — do not rotate your phone.',
    icon: '👉',
  },
  {
    id: 'blink',
    title: 'Blink Eyes',
    direction: 'blink',
    instruction: 'Look straight at the camera and blink your eyes naturally',
    hint: 'Keep your face centered and eyes clearly visible.',
    icon: '👁️',
  },
]

export default function CameraCapture({ onCapture, onClear, initialImage = null }) {
  const [streamActive, setStreamActive] = useState(false)
  const [capturedImage, setCapturedImage] = useState(initialImage)
  const [error, setError] = useState(null)
  const [videoReady, setVideoReady] = useState(false)
  const [activeChallenge, setActiveChallenge] = useState(CHALLENGES[0])
  const [challengeStep, setChallengeStep] = useState(0) // 0: idle, 1: baseline (look straight), 2: performing action
  const [countdown, setCountdown] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)

  const [facingMode, setFacingMode] = useState('user') // default 'user' (front camera)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const baselineFrameRef = useRef(null)
  const collectedFramesRef = useRef([])

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput')
          setHasMultipleCameras(videoInputs.length > 1)
        })
        .catch(() => {})
    }
  }, [])

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch (e) {
          // ignore
        }
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStreamActive(false)
    setVideoReady(false)
    setChallengeStep(0)
    setCountdown(0)
    setProgressPercent(0)
  }, [])

  const attachStreamToVideo = useCallback((stream) => {
    const video = videoRef.current
    if (!video || !stream) return

    video.srcObject = stream
    video.playsInline = true
    video.muted = true

    const playPromise = video.play()
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Video play error:', err)
      })
    }
  }, [])

  const setVideoElement = useCallback(
    (el) => {
      videoRef.current = el
      if (el && streamRef.current) {
        attachStreamToVideo(streamRef.current)
      }
    },
    [attachStreamToVideo]
  )

  useEffect(() => {
    if (streamActive && streamRef.current && videoRef.current) {
      attachStreamToVideo(streamRef.current)
    }
  }, [streamActive, attachStreamToVideo])

  useEffect(() => {
    return () => {
      stopTracks()
    }
  }, [stopTracks])

  const pickRandomChallenge = () => {
    const idx = Math.floor(Math.random() * CHALLENGES.length)
    setActiveChallenge(CHALLENGES[idx])
    setStatusMessage('')
  }

  const requestMediaStream = async (targetFacing) => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1280, min: 480 },
          height: { ideal: 720, min: 480 },
        },
      })
    } catch (err) {
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        try {
          return await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: targetFacing },
          })
        } catch {
          return await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          })
        }
      }
      throw err
    }
  }

  const startCamera = async (targetFacing = facingMode) => {
    setError(null)
    setVideoReady(false)
    pickRandomChallenge()
    setChallengeStep(0)
    setStatusMessage('')
    setProgressPercent(0)

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Live camera access is not supported by your current browser. You can upload a photo below.')
      return
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      const stream = await requestMediaStream(targetFacing)
      streamRef.current = stream
      setFacingMode(targetFacing)
      setStreamActive(true)

      if (navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput')
          if (videoInputs.length > 1) {
            setHasMultipleCameras(true)
          }
        })
      }

      if (videoRef.current) {
        attachStreamToVideo(stream)
      }
    } catch (err) {
      console.warn('Camera access error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission was denied. Please allow camera permissions in your browser settings.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No camera device detected on this system. You can upload a photo below.')
      } else {
        setError(`Camera initialization failed: ${err.message || 'Unknown error'}. You can upload a photo below.`)
      }
      stopTracks()
    }
  }

  const switchCamera = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user'
    startCamera(nextFacing)
  }

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {})
      setVideoReady(true)
    }
  }

  const grabCurrentFrame = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
      return null
    }
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.92)
  }

  const captureSingleFrame = () => {
    setError(null)
    const base64 = grabCurrentFrame()
    if (!base64 || base64.length < 500) {
      setError('Camera video feed is still initializing. Please wait a moment and try again.')
      return
    }
    setCapturedImage(base64)
    stopTracks()
    if (onCapture) {
      onCapture({
        base64,
        challenge: null,
        frames: [base64],
      })
    }
  }

  // Enhanced multi-frame challenge execution
  const runChallengeFlow = async () => {
    setError(null)
    const baseline = grabCurrentFrame()
    if (!baseline || baseline.length < 500) {
      setError('Camera feed not ready. Please center your face and wait a moment.')
      return
    }

    baselineFrameRef.current = baseline
    collectedFramesRef.current = [baseline]
    setChallengeStep(1) // Step 1: Baseline straight face
    setCountdown(2)
    setProgressPercent(20)
    setStatusMessage('1/2: Looking straight ahead (recording baseline face)…')

    // Countdown 2 -> 1
    setTimeout(() => {
      setCountdown(1)
      setProgressPercent(40)

      // Start action step
      setTimeout(() => {
        setChallengeStep(2)
        setCountdown(0)
        setProgressPercent(60)
        setStatusMessage(`2/2: ${activeChallenge.instruction}`)

        // Capture sequence of 3 action frames at 350ms intervals
        setTimeout(() => {
          const actionFrame1 = grabCurrentFrame() || baseline
          collectedFramesRef.current.push(actionFrame1)
          setProgressPercent(75)

          setTimeout(() => {
            const actionFrame2 = grabCurrentFrame() || actionFrame1
            collectedFramesRef.current.push(actionFrame2)
            setProgressPercent(90)

            setTimeout(() => {
              const actionFrame3 = grabCurrentFrame() || actionFrame2
              collectedFramesRef.current.push(actionFrame3)
              setProgressPercent(100)

              // Finished sequence
              setChallengeStep(0)
              setCountdown(0)
              setCapturedImage(baseline)
              stopTracks()

              if (onCapture) {
                onCapture({
                  base64: baseline,
                  challenge: activeChallenge.id,
                  frames: collectedFramesRef.current,
                })
              }
            }, 350)
          }, 350)
        }, 350)
      }, 1000)
    }, 1000)
  }

  const retakeFrame = () => {
    setError(null)
    setCapturedImage(null)
    baselineFrameRef.current = null
    collectedFramesRef.current = []
    setChallengeStep(0)
    setCountdown(0)
    setProgressPercent(0)
    setStatusMessage('')
    if (onClear) onClear()
    startCamera(facingMode)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = reader.result
      if (b64 && b64.length > 500) {
        setCapturedImage(b64)
        stopTracks()
        setError(null)
        if (onCapture) {
          onCapture({
            base64: b64,
            challenge: null,
            frames: [b64],
          })
        }
      } else {
        setError('Uploaded file appears empty or unreadable.')
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-700 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <span>📷</span> Biometric Liveness Challenge
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Active motion challenge • Sequential multi-frame verification • Prototype demonstration
          </p>
        </div>
        <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-full font-medium">
          Prototype Mode (Uncertified)
        </span>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="bg-red-950/60 border border-red-700/60 rounded-xl p-3 text-xs text-red-200">
          <p className="font-semibold mb-1">⚠️ Camera Guidance</p>
          <p>{error}</p>
        </div>
      )}

      {/* Active Challenge Prompt Card */}
      {streamActive && !capturedImage && (
        <div className="bg-sky-950/80 border border-sky-500/60 rounded-xl p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{activeChallenge.icon}</span>
              <div>
                <span className="text-sky-300 font-bold uppercase tracking-wider block text-xs">
                  Challenge: {activeChallenge.title}
                </span>
                <p className="text-slate-200 font-medium text-xs mt-0.5">{activeChallenge.instruction}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={pickRandomChallenge}
              disabled={challengeStep > 0}
              className="text-[11px] text-sky-300 hover:text-white underline ml-3 flex-shrink-0 disabled:opacity-40"
            >
              Change 🎲
            </button>
          </div>
          <p className="text-[11px] text-sky-200/80 border-t border-sky-800/60 pt-1.5 flex items-center gap-1.5">
            <span>ℹ️</span> {activeChallenge.hint} (Preview is mirrored: directions match your own body).
          </p>
        </div>
      )}

      {/* Main View Area */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video max-h-80 flex items-center justify-center border border-slate-800">
        {capturedImage ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              src={capturedImage}
              alt="Captured frame"
              className="max-h-full max-w-full object-contain"
            />
            <div className="absolute top-3 right-3 bg-green-900/90 text-green-200 border border-green-500 text-xs px-2.5 py-1 rounded-lg font-medium shadow-lg">
              ✓ Challenge Frames Captured
            </div>
          </div>
        ) : streamActive ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              ref={setVideoElement}
              autoPlay
              playsInline
              webkit-playsinline="true"
              muted
              onLoadedMetadata={handleVideoLoadedMetadata}
              onCanPlay={() => setVideoReady(true)}
              style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
              className="w-full h-full object-cover"
            />

            {/* Face Position Oval Guide with Boundary Margins */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`w-52 h-64 border-2 border-dashed rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
                  challengeStep === 2
                    ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20'
                    : challengeStep === 1
                    ? 'border-blue-400 bg-blue-500/10'
                    : 'border-sky-400/70'
                }`}
              >
                <span className="text-sky-200 text-[11px] bg-black/75 px-2.5 py-1 rounded-full font-medium shadow">
                  {challengeStep === 2
                    ? `${activeChallenge.icon} ${activeChallenge.title}`
                    : challengeStep === 1
                    ? 'Look Straight'
                    : 'Center Face Inside Guide'}
                </span>
                <span className="text-[9px] text-slate-300/80 mt-1 bg-black/60 px-1.5 py-0.5 rounded">
                  Remain inside oval
                </span>
              </div>
            </div>

            {/* Directional Overlay Indicators */}
            {challengeStep === 2 && activeChallenge.direction === 'left' && (
              <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-amber-500/80 text-black font-extrabold px-3 py-2 rounded-xl animate-pulse flex items-center gap-1.5 shadow-xl">
                <span className="text-2xl">👈</span>
                <span className="text-xs uppercase">Turn to your Left</span>
              </div>
            )}
            {challengeStep === 2 && activeChallenge.direction === 'right' && (
              <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-amber-500/80 text-black font-extrabold px-3 py-2 rounded-xl animate-pulse flex items-center gap-1.5 shadow-xl">
                <span className="text-xs uppercase">Turn to your Right</span>
                <span className="text-2xl">👉</span>
              </div>
            )}
            {challengeStep === 2 && activeChallenge.direction === 'blink' && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-amber-500/80 text-black font-extrabold px-4 py-1.5 rounded-xl animate-pulse flex items-center gap-1.5 shadow-xl">
                <span className="text-lg">👁️</span>
                <span className="text-xs uppercase">Blink your eyes now</span>
              </div>
            )}

            {/* In-video challenge instruction & countdown overlay */}
            {challengeStep > 0 && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center pointer-events-none p-4">
                {countdown > 0 && (
                  <div className="text-5xl font-extrabold text-amber-400 mb-2 animate-bounce">
                    {countdown}
                  </div>
                )}
                <div className="bg-slate-900/95 text-white text-xs sm:text-sm px-4 py-2.5 rounded-xl border border-amber-500/70 font-semibold flex items-center gap-2 shadow-2xl max-w-sm text-center">
                  <span>{activeChallenge.icon}</span>
                  <span>{statusMessage}</span>
                </div>
                {/* Progress bar */}
                <div className="w-48 bg-slate-800 h-2 rounded-full mt-3 overflow-hidden border border-slate-700">
                  <div
                    className="bg-amber-400 h-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="absolute bottom-2 left-3 text-xs text-slate-300 bg-black/70 px-2 py-1 rounded flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  videoReady ? 'bg-red-500 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span>{videoReady ? 'Live Preview (Mirrored)' : 'Initializing Feed…'}</span>
            </div>
          </div>
        ) : (
          <div className="text-center p-6 space-y-3">
            <div className="text-4xl text-slate-500">📹</div>
            <p className="text-sm text-slate-300 font-medium">Camera is inactive</p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Click &quot;Start Camera&quot; to begin your biometric liveness verification challenge.
            </p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-2 pt-1 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          {!streamActive && !capturedImage && (
            <button
              type="button"
              onClick={() => startCamera(facingMode)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <span>▶️</span> Start Camera
            </button>
          )}

          {streamActive && !capturedImage && (
            <>
              <button
                type="button"
                onClick={runChallengeFlow}
                disabled={challengeStep > 0 || !videoReady}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-900/40 disabled:opacity-50"
              >
                <span>🎯</span>{' '}
                {challengeStep > 0 ? 'Recording Challenge…' : `Start Challenge (${activeChallenge.title})`}
              </button>

              <button
                type="button"
                onClick={captureSingleFrame}
                disabled={challengeStep > 0 || !videoReady}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700"
              >
                Snapshot Only
              </button>

              {hasMultipleCameras && (
                <button
                  type="button"
                  onClick={switchCamera}
                  disabled={challengeStep > 0}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700 flex items-center gap-1"
                >
                  <span>🔄</span> Switch Camera
                </button>
              )}

              <button
                type="button"
                onClick={stopTracks}
                disabled={challengeStep > 0}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </>
          )}

          {capturedImage && (
            <>
              <button
                type="button"
                onClick={retakeFrame}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <span>🔄</span> Retake Challenge
              </button>
              <button
                type="button"
                onClick={() => {
                  setCapturedImage(null)
                  if (onClear) onClear()
                }}
                className="px-3 py-2 text-red-400 hover:text-red-300 text-xs"
              >
                Remove
              </button>
            </>
          )}
        </div>

        {/* Fallback upload for headless / camera-less testing */}
        <label className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer underline flex items-center gap-1">
          <span>📁</span> Or upload sample photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
        🛡️ <strong>Prototype Limitation & Spoof Notice:</strong> This prototype evaluates facial presence and simple
        challenge-response head movements. It does <strong>NOT</strong> prevent photo presentation, screen replays, or deepfakes.
        Production identity verification requires an ISO/IEC 30107 certified liveness provider.
      </p>
    </div>
  )
}
