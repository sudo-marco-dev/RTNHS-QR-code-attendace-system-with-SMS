import React from 'react'
import type { FaceValidationResult } from '../../lib/faceDetector'
import { ShieldAlert, AlertCircle, CheckCircle2, Eye } from 'lucide-react'

interface Props {
  result: FaceValidationResult | null
  enabled: boolean
  mirrored?: boolean
}

export default function FaceDetectionOverlay({ result, enabled, mirrored = false }: Props) {
  if (!enabled) return null

  const status = result?.status || 'NO_FACE'
  const isVerified = result?.isVerified ?? false
  const box = result?.box
  const message = result?.message || 'Position face within frame'

  // Determine HUD accent color palette
  const getTheme = () => {
    switch (status) {
      case 'VERIFIED':
        return {
          border: 'border-emerald-500',
          bg: 'bg-emerald-500/10',
          glow: 'shadow-[0_0_20px_rgba(16,185,129,0.35)]',
          badgeBg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
          reticleColor: '#10b981',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        }
      case 'FACING_AWAY':
      case 'NO_FACE':
        return {
          border: 'border-red-500',
          bg: 'bg-red-500/10',
          glow: 'shadow-[0_0_20px_rgba(239,68,68,0.35)]',
          badgeBg: 'bg-red-950/80 border-red-500/40 text-red-300',
          reticleColor: '#ef4444',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
        }
      case 'TOO_FAR':
      case 'TOO_CLOSE':
      case 'OFF_CENTER':
      case 'MULTIPLE_FACES':
      default:
        return {
          border: 'border-amber-500',
          bg: 'bg-amber-500/10',
          glow: 'shadow-[0_0_20px_rgba(245,158,11,0.35)]',
          badgeBg: 'bg-amber-950/80 border-amber-500/40 text-amber-300',
          reticleColor: '#f59e0b',
          icon: <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        }
    }
  }

  const theme = getTheme()

  // Calculate box position, taking CSS mirror transform into account if camera is flipped
  const getBoxStyle = (): React.CSSProperties => {
    if (!box) return {}
    const left = mirrored ? `${100 - box.x - box.width}%` : `${box.x}%`
    return {
      left,
      top: `${box.y}%`,
      width: `${box.width}%`,
      height: `${box.height}%`,
      transition: 'all 0.08s ease-out'
    }
  }

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-20">
      {/* 1. Top Biometric Indicator Badge */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-semibold tracking-wide">
        <span className={`w-2 h-2 rounded-full ${isVerified ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        <span className="text-white/90">Face Verification</span>
        <span className={isVerified ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
          {isVerified ? 'ACTIVE' : 'GATED'}
        </span>
      </div>

      {/* 2. Dynamic Face Bounding Box & Viewfinder Corners */}
      {box ? (
        <div
          style={getBoxStyle()}
          className={`absolute rounded-2xl border-2 ${theme.border} ${theme.bg} ${theme.glow}`}
        >
          {/* Top-Left Corner Accent */}
          <div
            className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-2 border-l-2 rounded-tl-md"
            style={{ borderColor: theme.reticleColor }}
          />
          {/* Top-Right Corner Accent */}
          <div
            className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-2 border-r-2 rounded-tr-md"
            style={{ borderColor: theme.reticleColor }}
          />
          {/* Bottom-Left Corner Accent */}
          <div
            className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-2 border-l-2 rounded-bl-md"
            style={{ borderColor: theme.reticleColor }}
          />
          {/* Bottom-Right Corner Accent */}
          <div
            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-2 border-r-2 rounded-br-md"
            style={{ borderColor: theme.reticleColor }}
          />

          {/* Biometric Status Tag anchored over box */}
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold border backdrop-blur-md shadow-lg flex items-center gap-1 ${theme.badgeBg}`}>
              {theme.icon}
              <span>{isVerified ? 'Face Verified' : status === 'FACING_AWAY' ? 'Look at Camera' : 'Align Face'}</span>
            </div>
          </div>
        </div>
      ) : (
        /* Default Guide Silhouette when no face is detected */
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-36 h-48 sm:w-44 sm:h-56 rounded-[45%] border-2 border-dashed border-white/25 flex flex-col items-center justify-center gap-2">
            <Eye className="w-6 h-6 text-white/30 animate-pulse" />
            <span className="text-[10px] font-medium text-white/50 tracking-wider uppercase">
              Face Here
            </span>
          </div>
        </div>
      )}

      {/* 3. Bottom HUD Floating Guidance Pill */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-auto max-w-[90%] z-20">
        <div className={`px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-xl flex items-center gap-2 text-xs font-semibold transition-all ${theme.badgeBg}`}>
          {theme.icon}
          <span className="truncate">{message}</span>
        </div>
      </div>
    </div>
  )
}
