import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import jsQR from 'jsqr'
import {
  Loader2,
  Bug,
  AlertTriangle,
  SwitchCamera,
  RotateCw,
  RefreshCw,
  Columns2,
  ArrowLeftRight,
  GripHorizontal,
  LayoutGrid
} from 'lucide-react'

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
  const scanCooldownUntil = useRef<number>(0)

  // ---- Native BarcodeDetector (hardware-accelerated GPU QR decoding) ----
  const barcodeDetectorRef = useRef<any>(null)
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      try {
        // @ts-ignore
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] })
      } catch (e) {
        console.warn('Native BarcodeDetector not available:', e)
      }
    }
  }, [])

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

  // ---- Face Stream (phone camera for verification photo — only in active production with ESP32) ----
  const faceVideoRef = useRef<HTMLVideoElement>(null)
  const faceCanvasRef = useRef<HTMLCanvasElement>(null)
  const faceStreamRef = useRef<MediaStream | null>(null)
  const [faceError, setFaceError] = useState<string | null>(null)
  const [faceActive, setFaceActive] = useState(false)

  // ---- Dual Camera Layout States ----
  const [viewMode, setViewMode] = useState<'pip' | 'split'>(() => {
    return (localStorage.getItem('rtnhs_dualcam_view_mode') as 'pip' | 'split') || 'pip'
  })
  const [primaryCam, setPrimaryCam] = useState<'esp32' | 'phone'>(() => {
    return (localStorage.getItem('rtnhs_dualcam_primary') as 'esp32' | 'phone') || 'esp32'
  })

  // ---- Draggable PiP State ----
  const containerRef = useRef<HTMLDivElement>(null)
  const pipRef = useRef<HTMLDivElement>(null)
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ pointerX: 0, pointerY: 0, initX: 0, initY: 0 })

  const handleToggleViewMode = () => {
    setViewMode(prev => {
      const next = prev === 'pip' ? 'split' : 'pip'
      localStorage.setItem('rtnhs_dualcam_view_mode', next)
      return next
    })
  }

  const handleSwapCameras = () => {
    setPrimaryCam(prev => {
      const next = prev === 'esp32' ? 'phone' : 'esp32'
      localStorage.setItem('rtnhs_dualcam_primary', next)
      return next
    })
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    const pip = pipRef.current
    const container = containerRef.current
    if (!pip || !container) return

    const containerRect = container.getBoundingClientRect()
    const pipRect = pip.getBoundingClientRect()

    const currentX = pipPos ? pipPos.x : (pipRect.left - containerRect.left)
    const currentY = pipPos ? pipPos.y : (pipRect.top - containerRect.top)

    dragStart.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initX: currentX,
      initY: currentY
    }
    isDragging.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    const container = containerRef.current
    const pip = pipRef.current
    if (!container || !pip) return

    const containerRect = container.getBoundingClientRect()
    const pipRect = pip.getBoundingClientRect()

    const dx = e.clientX - dragStart.current.pointerX
    const dy = e.clientY - dragStart.current.pointerY

    const maxX = Math.max(0, containerRect.width - pipRect.width)
    const maxY = Math.max(0, containerRect.height - pipRect.height)

    const nextX = Math.min(Math.max(0, dragStart.current.initX + dx), maxX)
    const nextY = Math.min(Math.max(0, dragStart.current.initY + dy), maxY)

    setPipPos({ x: nextX, y: nextY })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      isDragging.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !pipRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const pipRect = pipRef.current.getBoundingClientRect()
      const maxX = Math.max(0, containerRect.width - pipRect.width)
      const maxY = Math.max(0, containerRect.height - pipRect.height)

      setPipPos(prev => {
        if (!prev) return null
        return {
          x: Math.min(Math.max(0, prev.x), maxX),
          y: Math.min(Math.max(0, prev.y), maxY),
        }
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Keep the latest onScan in a ref so it never invalidates effects
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  // ---- QR decode helper: Hardware BarcodeDetector with jsQR fallback and rotation compensation ----
  const tryDecodeQR = useCallback(async (canvas: HTMLCanvasElement, source: HTMLImageElement | HTMLVideoElement) => {
    const now = Date.now()
    if (now < scanCooldownUntil.current) return // Respect cooldown during active scan feedback
    if (now - lastScanTime.current < 75) return // Fast scanning throttle (~13fps)
    lastScanTime.current = now

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight

    if (!ctx || width === 0 || height === 0) return

    // 1. First attempt: Native BarcodeDetector (instant GPU decode)
    if (barcodeDetectorRef.current) {
      try {
        const barcodes = await barcodeDetectorRef.current.detect(source)
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const rawCode = barcodes[0].rawValue
          const isSameCode = rawCode === lastCode.current
          const isRecent = (now - lastCodeTime.current) < 1500
          if (!isSameCode || !isRecent) {
            lastCode.current = rawCode
            lastCodeTime.current = now
            scanCooldownUntil.current = now + 2000 // 2s cooldown for clean OLED display
            onScanRef.current(rawCode)
            return
          }
        }
      } catch {
        // Fall through to canvas + jsQR
      }
    }

    // 2. Align canvas with physical camera rotation
    const rot = (source instanceof HTMLImageElement) ? esp32Rotation : 0
    if (rot === 90 || rot === 270) {
      canvas.width = height
      canvas.height = width
    } else {
      canvas.width = width
      canvas.height = height
    }

    ctx.save()
    if (rot === 90) {
      ctx.translate(height, 0)
      ctx.rotate((90 * Math.PI) / 180)
    } else if (rot === 180) {
      ctx.translate(width, height)
      ctx.rotate((180 * Math.PI) / 180)
    } else if (rot === 270) {
      ctx.translate(0, width)
      ctx.rotate((270 * Math.PI) / 180)
    }
    ctx.drawImage(source, 0, 0, width, height)
    ctx.restore()

    // 3. Fallback: jsQR with both standard and inverted attempts
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    })
    if (code?.data) {
      const isSameCode = code.data === lastCode.current
      const isRecent = (now - lastCodeTime.current) < 1500
      if (!isSameCode || !isRecent) {
        lastCode.current = code.data
        lastCodeTime.current = now
        scanCooldownUntil.current = now + 2000 // 2s cooldown for clean OLED display
        onScanRef.current(code.data)
      }
    }
  }, [esp32Rotation])

  // ---- Expose face photo capture to parent ----
  useImperativeHandle(ref, () => ({
    captureFacePhoto: (): string | null => {
      const video = faceVideoRef.current
      const canvas = faceCanvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        return null
      }
      const ratio = video.videoWidth / video.videoHeight
      let targetWidth = 320
      let targetHeight = 320 / ratio
      if (targetHeight > 320) {
        targetHeight = 320
        targetWidth = 320 * ratio
      }

      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
      return canvas.toDataURL('image/jpeg', 0.5)
    }
  }))

  // ======================================================================
  // MODE A: ESP32 QR Stream — poll /capture and decode
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
      // When cooldown is active, throttle polling to 350ms to keep ESP32 CPU & WiFi free for OLED display
      const isCooldown = Date.now() < scanCooldownUntil.current
      const delay = isCooldown ? 350 : 60
      setTimeout(() => fetchEsp32Frame(), delay)
    }
  }, [fetchEsp32Frame, tryDecodeQR])

  const retryEsp32Connection = useCallback(() => {
    setEsp32Error(null)
    setEsp32FrameOk(false)
    if (esp32Polling.current && esp32Url && esp32ImgRef.current) {
      esp32ImgRef.current.src = `${esp32Url}/capture?t=${Date.now()}`
    } else {
      fetchEsp32Frame()
    }
  }, [esp32Url, fetchEsp32Frame])

  const handleEsp32Error = useCallback(() => {
    setEsp32FrameOk(false)
    setEsp32Error('Failed to load frame from ESP32')
    if (esp32Polling.current) {
      setTimeout(() => {
        if (esp32Polling.current) fetchEsp32Frame()
      }, 1500)
    }
  }, [fetchEsp32Frame])

  // Start/stop ESP32 polling & reset state on URL change
  useEffect(() => {
    setEsp32Error(null)
    setEsp32FrameOk(false)
    if (!active || !esp32Url) {
      esp32Polling.current = false
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
  // Face Camera (verification photo — only in active production when ESP32 is QR source)
  // Face camera facing mode (front vs rear)
  const faceFacingModeRef = useRef<'user' | 'environment'>('user')
  const [faceFacingMode, setFaceFacingMode] = useState<'user' | 'environment'>('user')

  const startFaceCamera = useCallback(async (facing: 'user' | 'environment' = faceFacingModeRef.current) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setFaceError('Camera not supported')
      return
    }
    try {
      faceStreamRef.current?.getTracks().forEach(t => t.stop())
      faceStreamRef.current = null
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } }
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

  const flipFaceCamera = async () => {
    const next = faceFacingModeRef.current === 'user' ? 'environment' : 'user'
    faceFacingModeRef.current = next
    setFaceFacingMode(next)
    await startFaceCamera(next)
  }

  useEffect(() => {
    // Suspend face camera if not active or if no ESP32
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

  // Ensure face video element stays attached
  useEffect(() => {
    if (faceStreamRef.current && faceVideoRef.current && faceVideoRef.current.srcObject !== faceStreamRef.current) {
      faceVideoRef.current.srcObject = faceStreamRef.current
      faceVideoRef.current.play().catch(console.error)
    }
  })

  const scanBorder = debug ? 'border-amber-400' : 'border-blue-400'

  // ======================================================================
  // RENDER
  // ======================================================================

  // MODE B: No ESP32 — single device camera for QR
  if (!esp32Url) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
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

  // MODE A: ESP32 connected — Dual camera (Split Screen or Draggable PiP)
  const isEsp32PiP = viewMode === 'pip' && primaryCam === 'phone'
  const isPhonePiP = viewMode === 'pip' && primaryCam === 'esp32'
  const isSplit = viewMode === 'split'

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-black ${
        isSplit ? 'flex flex-col md:flex-row gap-2 p-2' : ''
      }`}
    >
      {/* 1. ESP32 Camera Pane */}
      <div
        ref={isEsp32PiP ? pipRef : undefined}
        onPointerDown={isEsp32PiP ? handlePointerDown : undefined}
        onPointerMove={isEsp32PiP ? handlePointerMove : undefined}
        onPointerUp={isEsp32PiP ? handlePointerUp : undefined}
        onPointerCancel={isEsp32PiP ? handlePointerUp : undefined}
        className={`group relative overflow-hidden bg-black flex items-center justify-center transition-all ${
          isSplit
            ? `flex-1 w-full h-full rounded-2xl border border-white/10 min-h-[240px] ${
                primaryCam === 'esp32' ? 'order-1' : 'order-2'
              }`
            : isEsp32PiP
            ? 'absolute z-20 touch-none select-none rounded-2xl border-2 border-white/25 shadow-2xl bg-zinc-950 w-52 sm:w-64 aspect-[4/3] cursor-grab active:cursor-grabbing hover:border-emerald-400/60'
            : 'absolute inset-0 z-0'
        }`}
        style={
          isEsp32PiP && pipPos
            ? { left: `${pipPos.x}px`, top: `${pipPos.y}px` }
            : isEsp32PiP
            ? { left: '16px', bottom: '100px' }
            : undefined
        }
      >
        {/* Header bar on PiP */}
        {isEsp32PiP && (
          <div className="absolute top-0 inset-x-0 z-30 px-2.5 py-1.5 bg-black/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-1.5 text-white/90 text-[11px] font-semibold">
              <GripHorizontal className="w-3.5 h-3.5 text-white/50" />
              <span>ESP32 Cam</span>
              <div className={`w-2 h-2 rounded-full ${esp32FrameOk ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSwapCameras}
                className="p-1 hover:bg-white/20 text-white/70 hover:text-white rounded transition-colors"
                title="Make Main Fullscreen"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Split Screen Header Badge — bottom center to avoid parent header overlap */}
        {isSplit && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-white/80 text-xs font-semibold flex items-center gap-1.5 pointer-events-none whitespace-nowrap">
            <div className={`w-2 h-2 rounded-full ${esp32FrameOk ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span>ESP32 QR Scanner</span>
          </div>
        )}

        {/* ESP32 Image element ALWAYS remains mounted in the DOM to prevent ref null deadlock */}
        <img
          ref={esp32ImgRef}
          onLoad={handleEsp32Load}
          onError={handleEsp32Error}
          className="w-full h-full object-contain transition-transform duration-300 pointer-events-none"
          alt="ESP32-CAM QR Stream"
          crossOrigin="anonymous"
          style={{
            display: esp32FrameOk ? 'block' : 'none',
            transform: `rotate(${esp32Rotation}deg)`
          }}
        />

        {/* Connecting state */}
        {!esp32FrameOk && !esp32Error && (
          <div className="flex items-center gap-2 text-[var(--sidebar-muted)] p-4 text-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs sm:text-sm">Connecting to ESP32-CAM...</span>
          </div>
        )}

        {/* Error overlay on top of mounted image */}
        {esp32Error && !esp32FrameOk && (
          <div className="text-red-400 text-xs sm:text-sm text-center p-4 flex flex-col items-center gap-2 z-10 bg-black/85 backdrop-blur-sm rounded-2xl border border-red-500/20 max-w-xs mx-4">
            <AlertTriangle className="w-8 h-8 opacity-70" />
            <div>
              <p className="font-semibold text-sm">Stream Disconnected</p>
              <p className="text-[11px] mt-0.5 text-red-300/80">{esp32Error}</p>
            </div>
            <button
              type="button"
              onClick={retryEsp32Connection}
              className="mt-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 border border-red-500/30 shadow-md"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}
        <canvas ref={qrCanvasRef} className="hidden" />

        {/* QR targeting overlay */}
        {esp32FrameOk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative">
              <div
                className={`${
                  isEsp32PiP
                    ? 'w-24 h-24 border'
                    : isSplit
                    ? 'w-36 h-36 sm:w-44 sm:h-44 border-2'
                    : 'w-44 h-44 sm:w-52 sm:h-52 border-2'
                } ${scanBorder} rounded-lg`}
                style={{ boxShadow: isEsp32PiP ? undefined : '0 0 0 9999px rgba(0,0,0,0.45)' }}
              />
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br'
              ].map((cls, i) => (
                <div key={i} className={`absolute ${isEsp32PiP ? 'w-4 h-4' : 'w-6 h-6'} ${debug ? 'border-amber-400' : 'border-blue-400'} ${cls}`} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Device Face Camera Pane */}
      <div
        ref={isPhonePiP ? pipRef : undefined}
        onPointerDown={isPhonePiP ? handlePointerDown : undefined}
        onPointerMove={isPhonePiP ? handlePointerMove : undefined}
        onPointerUp={isPhonePiP ? handlePointerUp : undefined}
        onPointerCancel={isPhonePiP ? handlePointerUp : undefined}
        className={`group relative overflow-hidden bg-black flex items-center justify-center transition-all ${
          isSplit
            ? `flex-1 w-full h-full rounded-2xl border border-white/10 min-h-[240px] ${
                primaryCam === 'phone' ? 'order-1' : 'order-2'
              }`
            : isPhonePiP
            ? 'absolute z-20 touch-none select-none rounded-2xl border-2 border-white/25 shadow-2xl bg-zinc-950 w-36 sm:w-48 aspect-[3/4] cursor-grab active:cursor-grabbing hover:border-emerald-400/60'
            : 'absolute inset-0 z-0'
        }`}
        style={
          isPhonePiP && pipPos
            ? { left: `${pipPos.x}px`, top: `${pipPos.y}px` }
            : isPhonePiP
            ? { left: '16px', bottom: '100px' }
            : undefined
        }
      >
        {/* Header bar on PiP */}
        {isPhonePiP && (
          <div className="absolute top-0 inset-x-0 z-30 px-2.5 py-1.5 bg-black/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-1.5 text-white/90 text-[11px] font-semibold">
              <GripHorizontal className="w-3.5 h-3.5 text-white/50" />
              <span>Face Cam</span>
              <div className={`w-2 h-2 rounded-full ${faceActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={flipFaceCamera}
                className="p-1 hover:bg-white/20 text-white/70 hover:text-white rounded transition-colors"
                title="Switch Camera (Front/Rear)"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleSwapCameras}
                className="p-1 hover:bg-white/20 text-white/70 hover:text-white rounded transition-colors"
                title="Make Main Fullscreen"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Split Screen Header Badge — bottom center to avoid parent header overlap */}
        {isSplit && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-white/80 text-xs font-semibold flex items-center gap-1.5 pointer-events-none whitespace-nowrap">
            <div className={`w-2 h-2 rounded-full ${faceActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span>Face Verification Cam</span>
          </div>
        )}

        {/* Split Screen flip button — bottom left to avoid dual cam toolbar overlap */}
        {isSplit && (
          <button
            type="button"
            onClick={flipFaceCamera}
            className="absolute bottom-3 left-3 z-20 p-2 bg-black/60 backdrop-blur-md text-white rounded-full hover:bg-black/80 transition-colors"
            title="Switch Camera (Front/Rear)"
          >
            <SwitchCamera className="w-4 h-4" />
          </button>
        )}

        {faceError ? (
          <div className="p-3 text-center z-10">
            <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-1" />
            <span className="text-xs text-amber-400 leading-tight block">Face Cam Error: {faceError}</span>
          </div>
        ) : (
          <video
            ref={faceVideoRef}
            className="w-full h-full object-cover pointer-events-none"
            muted
            playsInline
            style={{ transform: faceFacingMode === 'user' ? 'scaleX(-1)' : 'none' }}
          />
        )}
        <canvas ref={faceCanvasRef} className="hidden" />
      </div>

      {/* 3. Floating Dual Camera Toolbar — centered vertically on right edge to avoid header overlap */}
      <div className="absolute top-1/2 -translate-y-1/2 right-4 md:right-6 z-20 flex flex-col items-center gap-1.5 p-1 bg-black/60 backdrop-blur-md border border-white/15 rounded-full shadow-2xl pointer-events-auto">
        {/* Split Screen / PiP Toggle */}
        <button
          type="button"
          onClick={handleToggleViewMode}
          className={`p-2 rounded-full transition-all text-xs font-semibold flex items-center gap-1.5 ${
            viewMode === 'split'
              ? 'bg-[var(--primary)] text-white shadow-md'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
          title={viewMode === 'pip' ? 'Switch to Split Screen View' : 'Switch to Picture-in-Picture View'}
        >
          {viewMode === 'pip' ? <Columns2 className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
        </button>

        {/* Swap Cameras */}
        <button
          type="button"
          onClick={handleSwapCameras}
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          title={
            viewMode === 'split'
              ? 'Swap Left / Right Camera Feeds'
              : `Swap Main & PiP Feeds (Currently ${primaryCam === 'esp32' ? 'ESP32 Main' : 'Phone Main'})`
          }
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>

        {/* Rotate ESP32 Camera (only when frame is ok) */}
        {esp32FrameOk && (
          <button
            type="button"
            onClick={() => {
              const next = (esp32Rotation + 90) % 360
              setEsp32Rotation(next)
              localStorage.setItem('rtnhs_esp32_rotation', next.toString())
            }}
            className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Rotate ESP32 Camera (90°)"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 4. Debug Badge — centered vertically on left edge */}
      {debug && (
        <div className="absolute top-1/2 -translate-y-1/2 left-4 md:left-6 z-20 px-2.5 py-1 bg-amber-500/90 text-black text-xs font-bold rounded-full flex items-center gap-1 backdrop-blur-sm shadow-lg pointer-events-none">
          <Bug className="w-3.5 h-3.5" /> DEBUG MODE
        </div>
      )}

      {/* 5. Bottom Status Label */}
      {viewMode === 'pip' && (
        <div className="absolute bottom-20 left-0 right-0 text-center z-20 pointer-events-none">
          <span className="text-xs text-white/70 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
            {debug
              ? 'Debug mode — no attendance recorded'
              : primaryCam === 'esp32'
              ? 'ESP32-CAM (QR) • Device Face Cam (PiP)'
              : 'Device Face Cam (Main) • ESP32-CAM (PiP)'}
          </span>
        </div>
      )}
    </div>
  )
})

export default CameraStream
