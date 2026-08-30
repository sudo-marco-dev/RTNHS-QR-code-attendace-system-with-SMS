import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import jsQR from 'jsqr'
import { Loader2, Bug, AlertTriangle, SwitchCamera, RotateCw } from 'lucide-react'

interface Props {
  onScan: (code: string) => void
  active: boolean
  debug?: boolean
  esp32Url: string | null // null = use device camera for QR scanning (fallback mode)
}

export interface CameraStreamHandle {
  captureFacePhoto: () => string | null // returns base64 JPEG or null
}

const CameraStream = forwardRef<CameraStreamHandle, Props>(function CameraStream(
  { onScan, active, debug = false, esp32Url },
  ref
) {
  const [, forceRefresh] = useState(0)

  // ---- Shared scan timing ----
  const lastScanTime = useRef<number>(0)
  const lastCode = useRef<string>('')
  const lastCodeTime = useRef<number>(0)

  // ---- ESP32 QR Stream state ----
  const esp32ImgRef = useRef<HTMLImageElement>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const esp32Polling = useRef(false)
  const [esp32Error, setEsp32Error] = useState<string | null>(null)
  const [esp32FrameOk, setEsp32FrameOk] = useState(false)
  
  // Load saved rotation or default to 0
  const [esp32Rotation, setEsp32Rotation] = useState<number>(() => {
    const saved = localStorage.getItem('rtnhs_esp32_rotation')
    return saved ? parseInt(saved, 10) : 0
  })

  // ---- Device camera fallback QR Stream (when no ESP32) ----
  const deviceVideoRef = useRef<HTMLVideoElement>(null)
  const deviceCanvasRef = useRef<HTMLCanvasElement>(null)
  const deviceStreamRef = useRef<MediaStream | null>(null)
  const deviceAnimRef = useRef<number | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const facingModeRef = useRef<'environment' | 'user'>('environment')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [flipping, setFlipping] = useState(false)
  const flippingRef = useRef(false)

  // ---- Face Stream (phone camera for verification photo — only when ESP32 is connected) ----
  const faceVideoRef = useRef<HTMLVideoElement>(null)
  const faceCanvasRef = useRef<HTMLCanvasElement>(null)
  const faceStreamRef = useRef<MediaStream | null>(null)
  const [faceError, setFaceError] = useState<string | null>(null)
  const [faceActive, setFaceActive] = useState(false)

  // Keep the latest onScan in a ref so it never invalidates effects
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  // ---- QR decode helper (shared by ESP32 and device camera modes) ----
  const tryDecodeQR = useCallback((canvas: HTMLCanvasElement, source: HTMLImageElement | HTMLVideoElement) => {
    const now = Date.now()
    if (now - lastScanTime.current < 100) return // ~10fps throttle
    lastScanTime.current = now

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight

    if (!ctx || width === 0) return

    canvas.width = width
    canvas.height = height
    ctx.drawImage(source, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    })
    if (code?.data) {
      const isSameCode = code.data === lastCode.current
      const isRecent = (now - lastCodeTime.current) < 2000
      if (!isSameCode || !isRecent) {
        lastCode.current = code.data
        lastCodeTime.current = now
        onScanRef.current(code.data)
      }
    }
  }, [])

  // ---- Expose face photo capture to parent ----
  useImperativeHandle(ref, () => ({
    captureFacePhoto: (): string | null => {
      const video = faceVideoRef.current
      const canvas = faceCanvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        return null
      }
      // Compress: 320x240, quality 0.5
      const targetWidth = 320
      const targetHeight = 240
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
      return canvas.toDataURL('image/jpeg', 0.5)
    }
  }))

  // ======================================================================
  // MODE A: ESP32 QR Stream — poll /capture and decode with jsQR
  // ======================================================================
  const fetchEsp32Frame = useCallback(() => {
    if (!esp32Polling.current || !esp32Url) return
    const img = esp32ImgRef.current
    if (!img) {
      setTimeout(() => fetchEsp32Frame(), 100)
      return
    }
    img.src = `${esp32Url}/capture?t=${Date.now()}`
  }, [esp32Url])

  const handleEsp32Load = useCallback(() => {
    const img = esp32ImgRef.current
    const canvas = qrCanvasRef.current
    if (!img || !canvas) return

    setEsp32FrameOk(true)
    setEsp32Error(null)
    tryDecodeQR(canvas, img)

    if (esp32Polling.current) {
      setTimeout(() => fetchEsp32Frame(), 150) // Reduced framerate (150ms) to prevent overwhelming the ESP32
    }
  }, [fetchEsp32Frame, tryDecodeQR])

  const handleEsp32Error = useCallback(() => {
    setEsp32FrameOk(false)
    setEsp32Error('Failed to load frame from ESP32')
    if (esp32Polling.current) {
      setTimeout(() => fetchEsp32Frame(), 1000)
    }
  }, [fetchEsp32Frame])

  // Start/stop ESP32 polling
  useEffect(() => {
    if (!active || !esp32Url) {
      esp32Polling.current = false
      setEsp32FrameOk(false)
      return
    }
    esp32Polling.current = true
    fetchEsp32Frame()
    return () => { esp32Polling.current = false }
  }, [active, esp32Url, fetchEsp32Frame])

  // ======================================================================
  // MODE B: Device Camera QR Stream (fallback when no ESP32)
  // ======================================================================
  const startDeviceCamera = useCallback(async (mode: 'environment' | 'user') => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setDeviceError('Camera access requires HTTPS or localhost')
      return false
    }
    try {
      deviceStreamRef.current?.getTracks().forEach(t => t.stop())
      deviceStreamRef.current = null
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      deviceStreamRef.current = stream
      if (deviceVideoRef.current) {
        deviceVideoRef.current.srcObject = stream
        deviceVideoRef.current.play().catch(console.error)
      }
      setDeviceError(null)
      return true
    } catch (err) {
      setDeviceError((err as Error).message || 'Camera access denied')
      return false
    }
  }, [])

  const scanDeviceFrame = useCallback(() => {
    const video = deviceVideoRef.current
    const canvas = deviceCanvasRef.current
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      tryDecodeQR(canvas, video)
    }
    deviceAnimRef.current = requestAnimationFrame(scanDeviceFrame)
  }, [tryDecodeQR])

  const flipCamera = useCallback(async () => {
    if (flippingRef.current) return
    flippingRef.current = true
    setFlipping(true)
    const newMode = facingModeRef.current === 'environment' ? 'user' : 'environment'
    facingModeRef.current = newMode
    setFacingMode(newMode)
    await startDeviceCamera(newMode)
    flippingRef.current = false
    setFlipping(false)
  }, [startDeviceCamera])

  // Start device camera when active AND no ESP32
  useEffect(() => {
    if (!active || esp32Url) {
      // Clean up device camera when not needed
      if (deviceAnimRef.current) cancelAnimationFrame(deviceAnimRef.current)
      deviceStreamRef.current?.getTracks().forEach(t => t.stop())
      deviceStreamRef.current = null
      return
    }

    let disposed = false
    startDeviceCamera(facingModeRef.current).then(ok => {
      if (!disposed && ok) {
        deviceAnimRef.current = requestAnimationFrame(scanDeviceFrame)
      }
    })
    return () => {
      disposed = true
      if (deviceAnimRef.current) cancelAnimationFrame(deviceAnimRef.current)
      deviceStreamRef.current?.getTracks().forEach(t => t.stop())
      deviceStreamRef.current = null
    }
  }, [active, esp32Url, scanDeviceFrame, startDeviceCamera])

  // ======================================================================
  // Face Camera (verification photo — only when ESP32 is the QR source)
  // ======================================================================
  const startFaceCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setFaceError('Camera API not available (requires HTTPS)')
      return
    }
    try {
      faceStreamRef.current?.getTracks().forEach(t => t.stop())
      faceStreamRef.current = null
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } }
      })
      faceStreamRef.current = stream
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream
        faceVideoRef.current.play().catch(console.error)
      }
      setFaceActive(true)
      setFaceError(null)
    } catch (err) {
      setFaceError((err as Error).message || 'Camera access denied')
      setFaceActive(false)
    }
  }, [])

  // Start face camera only when ESP32 is connected (dual-camera mode)
  useEffect(() => {
    if (!active || !esp32Url) {
      faceStreamRef.current?.getTracks().forEach(t => t.stop())
      faceStreamRef.current = null
      setFaceActive(false)
      return
    }
    startFaceCamera()
    return () => {
      faceStreamRef.current?.getTracks().forEach(t => t.stop())
      faceStreamRef.current = null
      setFaceActive(false)
    }
  }, [active, esp32Url, startFaceCamera])

  const scanBorder = debug ? 'border-amber-400' : 'border-blue-400'

  // ======================================================================
  // RENDER
  // ======================================================================

  // MODE B: No ESP32 → single device camera for QR (original behavior)
  if (!esp32Url) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
        {deviceError ? (
          <div className="text-red-400 text-sm text-center p-6 border border-red-900/50 bg-red-950/20 rounded-lg max-w-sm">
            <p className="font-semibold mb-2">Camera Unavailable</p>
            <p>{deviceError}</p>
            <button
              type="button"
              onClick={async () => {
                setDeviceError(null)
                forceRefresh(v => v + 1)
                const ok = await startDeviceCamera(facingModeRef.current)
                if (ok) {
                  if (deviceAnimRef.current) cancelAnimationFrame(deviceAnimRef.current)
                  deviceAnimRef.current = requestAnimationFrame(scanDeviceFrame)
                }
              }}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Grant / Retry Camera Access
            </button>
          </div>
        ) : (
          <video ref={deviceVideoRef} className="w-full h-full object-cover" muted playsInline />
        )}
        <canvas ref={deviceCanvasRef} className="hidden" />

        {debug && (
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1 bg-amber-500/90 text-black text-xs font-bold rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Bug className="w-3.5 h-3.5" /> DEBUG
          </div>
        )}

        <button
          type="button"
          onClick={flipCamera}
          disabled={flipping || !!deviceError}
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

  // MODE A: ESP32 connected → ESP32 for QR + device camera for face verification (Picture-in-Picture)
  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
      
      {/* 1. Main Background: ESP32 QR Stream */}
      <div className="absolute inset-0 flex items-center justify-center">
        {esp32Error && !esp32FrameOk ? (
          <div className="text-red-400 text-sm text-center p-6 flex flex-col items-center gap-3">
            <AlertTriangle className="w-10 h-10 opacity-60" />
            <div>
              <p className="font-semibold">Stream Error</p>
              <p className="text-xs mt-1">{esp32Error}</p>
              <p className="text-xs text-[var(--sidebar-muted)] mt-1">Retrying automatically...</p>
            </div>
          </div>
        ) : (
          <>
            <img
              ref={esp32ImgRef}
              onLoad={handleEsp32Load}
              onError={handleEsp32Error}
              className="w-full h-full object-contain transition-transform duration-300"
              alt="ESP32-CAM QR Stream"
              crossOrigin="anonymous"
              style={{ 
                display: esp32FrameOk ? 'block' : 'none',
                transform: `rotate(${esp32Rotation}deg)`
              }}
            />
            {!esp32FrameOk && (
              <div className="flex items-center gap-2 text-[var(--sidebar-muted)]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Connecting to ESP32-CAM...</span>
              </div>
            )}
          </>
        )}
        <canvas ref={qrCanvasRef} className="hidden" />

        {/* QR targeting overlay */}
        {esp32FrameOk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative">
              <div
                className={`w-44 h-44 sm:w-52 sm:h-52 border-2 ${scanBorder} rounded-lg`}
                style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
              />
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
        )}
      </div>

      {/* 2. Top-Left: Debug Badge */}
      {debug && (
        <div className="absolute top-3 left-3 z-20 px-2.5 py-1 bg-amber-500/90 text-black text-xs font-bold rounded-full flex items-center gap-1 backdrop-blur-sm">
          <Bug className="w-3.5 h-3.5" /> DEBUG
        </div>
      )}

      {/* 3. Top-Right: Rotate ESP32 Camera Button */}
      {esp32FrameOk && (
        <button
          type="button"
          onClick={() => {
            const next = (esp32Rotation + 90) % 360;
            setEsp32Rotation(next);
            localStorage.setItem('rtnhs_esp32_rotation', next.toString());
          }}
          className="absolute top-3 right-3 z-20 p-2.5 bg-black/50 backdrop-blur-sm text-white rounded-full hover:bg-black/70 transition-colors"
          title="Rotate Camera"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      )}

      {/* 4. Bottom-Center: Status Label */}
      <div className="absolute bottom-3 left-0 right-0 text-center z-20 pointer-events-none">
        <span className="text-xs text-white/70 bg-black/40 px-3 py-1 rounded-full">
          {debug ? 'Debug mode — no attendance recorded' : 'ESP32-CAM · Point at QR code'}
        </span>
      </div>

      {/* 5. Bottom-Left (Picture-in-Picture): Face Verification Camera */}
      <div className="absolute bottom-3 left-3 z-30 w-28 sm:w-36 aspect-[3/4] rounded-lg overflow-hidden border-2 border-black/50 shadow-2xl bg-black flex flex-col items-center justify-center">
        {faceError ? (
          <div className="p-2 text-center">
            <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <span className="text-[9px] text-amber-500 leading-tight block">Face Cam Error</span>
          </div>
        ) : (
          <>
            <video
              ref={faceVideoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
              style={{ transform: 'scaleX(-1)' }} // Mirrored
            />
            {/* PiP Recording dot */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1 bg-black/40 rounded-full px-1.5 py-0.5">
              <div className={`w-2 h-2 rounded-full ${faceActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
            </div>
          </>
        )}
        <canvas ref={faceCanvasRef} className="hidden" />
      </div>

    </div>
  )
})

export default CameraStream