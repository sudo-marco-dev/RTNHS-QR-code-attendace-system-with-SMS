import { useEffect, useRef, useCallback, useState } from 'react'
import jsQR from 'jsqr'
import { SwitchCamera, Loader2, Bug } from 'lucide-react'

interface Props {
  onScan: (code: string) => void
  active: boolean
  debug?: boolean
}

export default function CameraStream({ onScan, active, debug = false }: Props) {
  const [, forceRefresh] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number | null>(null)
  const lastScanTime = useRef<number>(0)
  const lastCode = useRef<string>('')
  const lastCodeTime = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const facingModeRef = useRef<'environment' | 'user'>('environment')
  const flippingRef = useRef(false)

  // Keep the latest onScan in a ref so it never invalidates the camera effect below.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [flipping, setFlipping] = useState(false)

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animRef.current = requestAnimationFrame(scanFrame)
      return
    }

    const now = Date.now()
    if (now - lastScanTime.current >= 100) { // ~10fps
      lastScanTime.current = now
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx && video.videoWidth > 0) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        })
        if (code?.data) {
          // Debounce: same code within 2 seconds is ignored
          const isSameCode = code.data === lastCode.current
          const isRecent = (now - lastCodeTime.current) < 2000
          if (!isSameCode || !isRecent) {
            lastCode.current = code.data
            lastCodeTime.current = now
            onScanRef.current(code.data)
          }
        }
      }
    }

    animRef.current = requestAnimationFrame(scanFrame)
  }, [])

  // Starts/attaches the camera stream, stopping any existing tracks first.
  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera access requires a Secure Context (HTTPS or localhost). Please use https://... or run vite with --host and a basic SSL plugin.')
      return false
    }

    try {
      // Cleanly stop any currently active stream before requesting a new one.
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(console.error)
      }
      setErrorMsg(null)
      return true
    } catch (err) {
      console.error('Camera access error:', err)
      setErrorMsg(`Camera error: ${(err as Error).message || 'Unknown error'}`)
      return false
    }
  }, [])

  // Flip between rear (environment) and front (user) cameras.
  const flipCamera = useCallback(async () => {
    if (flippingRef.current) return
    flippingRef.current = true
    setFlipping(true)
    const newMode = facingModeRef.current === 'environment' ? 'user' : 'environment'
    facingModeRef.current = newMode
    setFacingMode(newMode)
    await startCamera(newMode)
    flippingRef.current = false
    setFlipping(false)
  }, [startCamera])

  // The camera effect only depends on `active` + stable callbacks, so it
  // never re-fires when the parent's onScan identity changes (e.g. toggling
  // Live/Debug mode). This prevents re-prompting for camera permission.
  useEffect(() => {
    if (!active) return
    let disposed = false

    startCamera(facingModeRef.current).then(ok => {
      if (!disposed && ok) {
        animRef.current = requestAnimationFrame(scanFrame)
      }
    })

    return () => {
      disposed = true
      if (animRef.current) cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [active, scanFrame, startCamera])

  const scanBorder = debug ? 'border-amber-400' : 'border-blue-400'

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
      {errorMsg ? (
        <div className="text-red-400 text-sm text-center p-6 border border-red-900/50 bg-red-950/20 rounded-lg max-w-sm">
          <p className="font-semibold mb-2">Camera Unavailable</p>
          <p>{errorMsg}</p>
          <button
            type="button"
            onClick={async () => {
              setErrorMsg(null)
              forceRefresh(v => v + 1)
              const ok = await startCamera(facingModeRef.current)
              if (ok) {
                if (animRef.current) cancelAnimationFrame(animRef.current)
                animRef.current = requestAnimationFrame(scanFrame)
              }
            }}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Grant / Retry Camera Access
          </button>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
      )}
      <canvas ref={canvasRef} className="hidden" />

      {/* Debug mode badge */}
      {debug && (
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 bg-amber-500/90 text-black text-xs font-bold rounded-full flex items-center gap-1 backdrop-blur-sm">
          <Bug className="w-3.5 h-3.5" /> DEBUG
        </div>
      )}

      {/* Flip camera control */}
      <button
        type="button"
        onClick={flipCamera}
        disabled={flipping || !!errorMsg}
        className="absolute top-3 right-3 z-10 p-2.5 bg-black/50 backdrop-blur-sm text-white rounded-full hover:bg-black/70 transition-colors disabled:opacity-50"
        title={facingMode === 'environment' ? 'Switch to Front Camera' : 'Switch to Rear Camera'}
      >
        {flipping ? <Loader2 className="w-5 h-5 animate-spin" /> : <SwitchCamera className="w-5 h-5" />}
      </button>

      {/* Scan targeting overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <div
            className={`w-52 h-52 border-2 ${scanBorder} rounded-lg`}
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
          />
          {/* Corner brackets */}
          {[
            'top-0 left-0 border-t-4 border-l-4 rounded-tl',
            'top-0 right-0 border-t-4 border-r-4 rounded-tr',
            'bottom-0 left-0 border-b-4 border-l-4 rounded-bl',
            'bottom-0 right-0 border-b-4 border-r-4 rounded-br'
          ].map((cls, i) => (
            <div key={i} className={`absolute w-6 h-6 ${debug ? 'border-amber-400' : 'border-blue-400'} ${cls}`} />
          ))}
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 text-center">
        <span className="text-xs text-white/70 bg-black/40 px-3 py-1 rounded-full">
          {debug
            ? 'Debug mode — no attendance recorded'
            : `Point camera at QR code • ${facingMode === 'environment' ? 'Rear' : 'Front'} camera`}
        </span>
      </div>
    </div>
  )
}