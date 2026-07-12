import { useEffect, useRef, useCallback } from 'react'
import jsQR from 'jsqr'

interface Props {
  onScan: (code: string) => void
  active: boolean
}

export default function CameraStream({ onScan, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number | null>(null)
  const lastScanTime = useRef<number>(0)
  const lastCode = useRef<string>('')
  const lastCodeTime = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

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
            onScan(code.data)
          }
        }
      }
    }

    animRef.current = requestAnimationFrame(scanFrame)
  }, [onScan])

  useEffect(() => {
    if (!active) return
    let mounted = true

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(console.error)
        }
        animRef.current = requestAnimationFrame(scanFrame)
      })
      .catch(err => console.error('Camera access error:', err))

    return () => {
      mounted = false
      if (animRef.current) cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [active, scanFrame])

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Scan targeting overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <div
            className="w-52 h-52 border-2 border-blue-400 rounded-lg"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
          />
          {/* Corner brackets */}
          {[
            'top-0 left-0 border-t-4 border-l-4 rounded-tl',
            'top-0 right-0 border-t-4 border-r-4 rounded-tr',
            'bottom-0 left-0 border-b-4 border-l-4 rounded-bl',
            'bottom-0 right-0 border-b-4 border-r-4 rounded-br'
          ].map((cls, i) => (
            <div key={i} className={`absolute w-6 h-6 border-blue-400 ${cls}`} />
          ))}
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 text-center">
        <span className="text-xs text-white/70 bg-black/40 px-3 py-1 rounded-full">
          Point camera at QR code
        </span>
      </div>
    </div>
  )
}
