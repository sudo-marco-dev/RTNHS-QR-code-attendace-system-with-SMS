import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import PinScreen from '../../components/scanner/PinScreen'
import CameraStream from '../../components/scanner/CameraStream'
import type { CameraStreamHandle } from '../../components/scanner/CameraStream'
import ESP32Settings from '../../components/scanner/ESP32Settings'
import StateControls from '../../components/scanner/StateControls'
import type { ScanWindow, WindowType } from '../../components/scanner/StateControls'
import { playSuccess, playDuplicate, playError } from '../../components/scanner/AudioFeedback'
import { Bug, QrCode, CheckCircle2, XCircle, Zap, Settings, Keyboard, History, Loader2, Maximize, Minimize, ArrowLeft } from 'lucide-react'
import { sendAttendanceSms } from '../../lib/sms'
import { useNavigate } from 'react-router-dom'
import ManualEntry from '../../components/scanner/ManualEntry'
import ScanHistoryTab from '../../components/scanner/ScanHistoryTab'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'

const supabaseServiceRole = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
)

interface Student {
  id: string
  full_name: string
  lrn: string
  qr_code: string
  parent_phone: string | null
}

interface OfflineEntry {
  student_id: string
  scan_window_id: string
  status: 'PRESENT' | 'LATE' | 'ABSENT'
  scanned_at: string
  offline_sync: boolean
}

interface FeedbackCard {
  studentName: string
  lrn: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'DUPLICATE' | 'ERROR'
  message: string
}

interface DebugResult {
  rawPayload: string
  found: boolean
  student: Student | null
}

interface SectionSettings {
  morning_in_start: string
  morning_in_end: string
  afternoon_in_start: string
  afternoon_in_end: string
  afternoon_out_start: string
  afternoon_out_end: string
}

const OFFLINE_KEY = 'rtnhs_offline_queue'

function loadOfflineQueue(): OfflineEntry[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]')
  } catch { return [] }
}

function saveOfflineQueue(q: OfflineEntry[]) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(q))
}

export default function ScannerTerminal() {
  const [phase, setPhase] = useState<'pin' | 'scanning'>('pin')
  const [sectionId, setSectionId] = useState('')
  const [sectionName, setSectionName] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [scanWindow, setScanWindow] = useState<ScanWindow | null>(null)
  const [windowType, setWindowType] = useState<WindowType>('morning_in')
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null)
  const [offlineQueue, setOfflineQueue] = useState<OfflineEntry[]>(loadOfflineQueue())
  const [debugMode, setDebugMode] = useState(false)
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null)
  const [sectionSettings, setSectionSettings] = useState<SectionSettings | null>(null)
  const [isHydrating, setIsHydrating] = useState(false)
  const navigate = useNavigate()

  type SmsStatus = 'idle' | 'sending' | 'sent' | 'failed' | 'no_phone';
  const [smsStatus, setSmsStatus] = useState<SmsStatus>('idle');

  const [sendSms, setSendSms] = useState(true);

  const [completedWindows, setCompletedWindows] = useState<WindowType[]>([])
  const [confirmReopenType, setConfirmReopenType] = useState<WindowType | null>(null)

  // ESP32-CAM state
  const [esp32Url, setEsp32Url] = useState<string | null>(null)
  const cameraStreamRef = useRef<CameraStreamHandle>(null)

  // Admin Settings State
  const [showSettingsPin, setShowSettingsPin] = useState(false)
  const [settingsPin, setSettingsPin] = useState('')
  const [settingsPinError, setSettingsPinError] = useState(false)
  const [verifyingPin, setVerifyingPin] = useState(false)
  const [showAdminDrawer, setShowAdminDrawer] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showManualModal, setShowManualModal] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushingRef = useRef(false)
  const scannedIdsRef = useRef<Set<string>>(new Set())

  // Fullscreen management
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`)
      })
    } else {
      document.exitFullscreen()
    }
  }

  const verifyAdminPin = async () => {
    setVerifyingPin(true)
    setSettingsPinError(false)
    const { data } = await supabase.from('sections').select('scanner_pin').eq('id', sectionId).single()
    if (data && data.scanner_pin === settingsPin) {
      setShowSettingsPin(false)
      setSettingsPin('')
      setShowAdminDrawer(true)
    } else {
      setSettingsPinError(true)
      setSettingsPin('')
    }
    setVerifyingPin(false)
  }

  const handleWindowChange = useCallback((window: ScanWindow | null) => {
    if (!window && scanWindow) {
      setIsHydrating(false)
      setCompletedWindows(prev => {
        if (!prev.includes(scanWindow.window_type)) {
          return [...prev, scanWindow.window_type]
        }
        return prev
      })
      // Auto-suggest next window based on current time
      if (sectionSettings) {
        const now = new Date()
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        let nextType: WindowType = 'morning_in'
        
        if (timeStr >= sectionSettings.afternoon_out_start) {
          nextType = 'afternoon_out'
        } else if (timeStr >= sectionSettings.afternoon_in_start) {
          nextType = 'afternoon_in'
        }
        
        if (!completedWindows.includes(nextType) && nextType !== scanWindow.window_type) {
          setWindowType(nextType)
        } else {
          // fallback to chronological
          const order: WindowType[] = ['morning_in', 'afternoon_in', 'afternoon_out']
          const currIdx = order.indexOf(scanWindow.window_type)
          if (currIdx < order.length - 1 && !completedWindows.includes(order[currIdx + 1])) {
            setWindowType(order[currIdx + 1])
          }
        }
      } else {
        const order: WindowType[] = ['morning_in', 'afternoon_in', 'afternoon_out']
        const currIdx = order.indexOf(scanWindow.window_type)
        if (currIdx < order.length - 1 && !completedWindows.includes(order[currIdx + 1])) {
          setWindowType(order[currIdx + 1])
        }
      }
    }
    setScanWindow(window)
  }, [scanWindow, completedWindows, sectionSettings])

  const handleWindowTabClick = (type: WindowType) => {
    if (scanWindow) return
    if (completedWindows.includes(type)) {
      setConfirmReopenType(type)
    } else {
      setWindowType(type)
    }
  }

  // Load section roster and settings after authentication
  useEffect(() => {
    if (!sectionId) return
    const fetchStudents = async () => {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, lrn, qr_code, parent_phone')
        .eq('section_id', sectionId)
        .order('full_name')
      if (data) setStudents(data as Student[])
    }
    const fetchSection = async () => {
      const { data } = await supabase.from('sections').select('*').eq('id', sectionId).single()
      if (data) {
        setSectionSettings(data as SectionSettings)
        
        // Initial window suggestion
        const now = new Date()
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        if (timeStr >= data.afternoon_out_start) setWindowType('afternoon_out')
        else if (timeStr >= data.afternoon_in_start) setWindowType('afternoon_in')
        else setWindowType('morning_in')
      }
    }
    const hydrateScanWindow = async () => {
      const startOfDay = new Date()
      startOfDay.setHours(0,0,0,0)
      
      const { data } = await supabase
        .from('scan_windows')
        .select('*')
        .eq('section_id', sectionId)
        .gte('opened_at', startOfDay.toISOString())
        .in('status', ['open', 'late'])
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        
      if (data) {
        setScanWindow(data as ScanWindow)
        setWindowType(data.window_type)
        setIsHydrating(true) // Start hydrating when an existing window is found
      }
    }
    fetchStudents()
    fetchSection()
    hydrateScanWindow()
  }, [sectionId])

  // Hydrate scannedIds when a scanWindow becomes active
  useEffect(() => {
    if (!scanWindow) {
      // Don't clear scannedIds on window close immediately if you want to see them, 
      // but usually we want a fresh state for the next window.
      // Wait, we DO clear it when batch absent is called, or on change.
      // Let's only fetch when we get a new scan window.
      return
    }
    const fetchLogs = async () => {
      setIsHydrating(true)
      const { data } = await supabaseServiceRole
        .from('attendance_logs')
        .select('student_id')
        .eq('scan_window_id', scanWindow.id)
      
      if (data) {
        const newSet = new Set(data.map(d => d.student_id))
        setScannedIds(newSet)
        scannedIdsRef.current = newSet
      }
      setIsHydrating(false)
    }
    fetchLogs()
  }, [scanWindow?.id])

  // Auto-flush offline queue on mount and every 30 seconds
  useEffect(() => {
    flushQueue()
    const interval = setInterval(flushQueue, 30000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps



  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return
    const queue = loadOfflineQueue()
    if (queue.length === 0) return
    flushingRef.current = true

    const remaining: OfflineEntry[] = []
    for (const entry of queue) {
      const { error } = await supabaseServiceRole.from('attendance_logs').insert(entry)
      if (error) remaining.push(entry)
    }

    saveOfflineQueue(remaining)
    setOfflineQueue(remaining)
    flushingRef.current = false
  }, [])

  const showFeedback = (card: FeedbackCard) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback(card)
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3000)
  }

  // Debug mode: validate locally, show on-screen result, BYPASS database entirely.
  const processDebugCode = useCallback((code: string) => {
    const student = students.find(s => s.qr_code === code || s.lrn === code)
    setDebugResult({
      rawPayload: code,
      found: !!student,
      student: student || null
    })
    if (student) {
      playSuccess()
    } else {
      playError()
    }
  }, [students])

  const processCode = useCallback(async (code: string) => {
    // Prevent any scanning if we are still fetching the previous state from Supabase
    if (isHydrating) return

    // Debug mode short-circuits before any Supabase insert.
    if (debugMode) {
      processDebugCode(code)
      return
    }

    // Find student by qr_code first, then lrn
    const student = students.find(s => s.qr_code === code || s.lrn === code)
    console.log('[SCANNER] Student fetched:', student)

    if (!student) {
      playError()
      showFeedback({ studentName: 'Unknown', lrn: code, status: 'ERROR', message: 'Student not found in this section' })
      return
    }

    if (!scanWindow || scanWindow.status === 'closed') {
      playError()
      showFeedback({ studentName: student.full_name, lrn: student.lrn, status: 'ERROR', message: 'No active scan window. Please open a window first.' })
      return
    }

    if (scannedIdsRef.current.has(student.id)) {
      playDuplicate()
      showFeedback({ studentName: student.full_name, lrn: student.lrn, status: 'DUPLICATE', message: 'Already scanned in this window' })
      return
    }

    // Synchronously mark as scanned to prevent rapid double-scan race conditions
    scannedIdsRef.current.add(student.id)
    setScannedIds(new Set(scannedIdsRef.current))

    const scanTime = new Date()
    const status: 'PRESENT' | 'LATE' = scanWindow.status === 'open' ? 'PRESENT' : 'LATE'
    const entry: OfflineEntry = {
      student_id: student.id,
      scan_window_id: scanWindow.id,
      status,
      scanned_at: scanTime.toISOString(),
      offline_sync: false
    }

    let logData: { id: string } | null = null
    let error: any = null
    try {
      const result = await supabaseServiceRole.from('attendance_logs').insert(entry).select('id').single()
      console.log('[SCANNER] Attendance inserted:', result)
      logData = result.data
      error = result.error
    } catch (insertError) {
      console.error('[SCANNER] Attendance insert failed:', insertError)
      error = insertError
    }

    if (error) {
      // Queue offline
      const newQueue = [...loadOfflineQueue(), { ...entry, offline_sync: true }]
      saveOfflineQueue(newQueue)
      setOfflineQueue(newQueue)
    } else {
      // Capture & upload face verification photo (fire-and-forget)
      if (logData?.id && cameraStreamRef.current) {
        const photoData = cameraStreamRef.current.captureFacePhoto()
        if (photoData) {
          // Upload async — don't block scan feedback
          const uploadPhoto = async () => {
            try {
              const dateStr = scanTime.toISOString().split('T')[0]
              const fileName = `${sectionId}/${dateStr}/${student.id}_${windowType}_${Date.now()}.jpg`
              // Convert base64 to blob
              const base64 = photoData.split(',')[1]
              const byteString = atob(base64)
              const ab = new ArrayBuffer(byteString.length)
              const ia = new Uint8Array(ab)
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i)
              }
              const blob = new Blob([ab], { type: 'image/jpeg' })

              const { data: uploadData, error: uploadError } = await supabaseServiceRole.storage
                .from('verification-photos')
                .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })

              if (!uploadError && uploadData) {
                const { data: urlData } = supabaseServiceRole.storage
                  .from('verification-photos')
                  .getPublicUrl(fileName)
                if (urlData?.publicUrl) {
                  await supabaseServiceRole.from('attendance_logs')
                    .update({ verification_photo_url: urlData.publicUrl })
                    .eq('id', logData!.id)
                }
              } else {
                console.error('[PHOTO] Upload failed:', uploadError)
              }
            } catch (photoErr) {
              console.error('[PHOTO] Error:', photoErr)
            }
          }
          uploadPhoto() // fire-and-forget
        }
      }

      if (sendSms) {
        console.log('[SMS] Scan success, student:', student.full_name, 'parent_phone:', student.parent_phone)
        // Send SMS
        setSmsStatus('sending')
        console.log('[SMS] Calling sendAttendanceSms...')
        const smsResult = await sendAttendanceSms({
          studentName: student.full_name,
          section: sectionName,
          scanType: windowType.includes('out') ? 'TIME OUT' : 'TIME IN',
          scannedAt: scanTime,
          parentPhone: student.parent_phone
        })
        console.log('[SMS] Result:', smsResult)
        setSmsStatus(smsResult)

        if (logData?.id) {
          const timeStr = scanTime.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
          const dateStr = scanTime.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
          await supabase.from('sms_logs').insert({
            attendance_log_id: logData.id,
            student_id: student.id,
            parent_phone: student.parent_phone,
            message_content: `[RTNHS Attendance] ${student.full_name} has ${windowType.includes('out') ? 'TIME OUT' : 'TIME IN'} at ${timeStr}. Date: ${dateStr} | ${sectionName}`,
            status: smsResult
          });
        }
        setTimeout(() => setSmsStatus('idle'), 5000)
      }
    }

    playSuccess()
    showFeedback({ studentName: student.full_name, lrn: student.lrn, status, message: status === 'PRESENT' ? 'Attendance recorded' : 'Marked as Late' })
  }, [students, scanWindow, debugMode, processDebugCode, sendSms, isHydrating])

  const handleBatchAbsent = useCallback(async (windowId: string) => {
    const unscanned = students.filter(s => !scannedIds.has(s.id))
    if (unscanned.length === 0) return

    const absentEntries = unscanned.map(s => ({
      student_id: s.id,
      scan_window_id: windowId,
      status: 'ABSENT' as const,
      scanned_at: new Date().toISOString(),
      offline_sync: false
    }))

    const { error } = await supabase.from('attendance_logs').insert(absentEntries)
    if (error) {
      const newQueue = [...loadOfflineQueue(), ...absentEntries.map(e => ({ ...e, offline_sync: true }))]
      saveOfflineQueue(newQueue)
      setOfflineQueue(newQueue)
    }
    // Reset for next window
    scannedIdsRef.current.clear()
    setScannedIds(new Set())
  }, [students, scannedIds])

  if (phase === 'pin') {
    return (
      <PinScreen
        onAuthenticated={(id, name) => {
          setSectionId(id)
          setSectionName(name)
          setPhase('scanning')
        }}
      />
    )
  }

  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col relative overflow-hidden font-sans">
      
      {/* 1. Full-screen Camera Background */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <CameraStream 
          ref={cameraStreamRef} 
          onScan={processCode} 
          active={phase === 'scanning' && !isHydrating && !showAdminDrawer && !showHistoryModal && !showManualModal} 
          debug={debugMode} 
          esp32Url={esp32Url} 
        />
      </div>

      {/* 2. Top Header Overlay */}
      <div className="relative z-10 p-4 md:p-6 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-2 pointer-events-auto">
          <div className="flex items-center gap-2">
            {/* Back / Exit Button */}
            <button
              onClick={() => navigate('/login')}
              className="p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white/70 hover:text-white border border-white/10 active:scale-95 transition-all shadow-lg"
              title="Exit Terminal"
            >
              <ArrowLeft className="w-5 h-5 p-0.5" />
            </button>
            {/* Status Badge */}
            <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full text-xs font-semibold text-white border border-white/10 flex items-center gap-2 shadow-lg">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>{sectionName}</span>
              <span className="text-white/40">•</span>
              <span className="text-emerald-400">{windowType.replace('_', ' ').toUpperCase()}</span>
            </div>
          </div>
          
          {isHydrating && (
            <div className="px-3 py-1.5 bg-blue-500/20 backdrop-blur-md border border-blue-500/30 rounded-full text-blue-400 text-xs font-semibold flex items-center gap-2 shadow-lg animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading Scans...
            </div>
          )}

          {offlineQueue.length > 0 && (
            <div className="px-3 py-1.5 bg-orange-500/20 backdrop-blur-md border border-orange-500/30 rounded-full text-orange-400 text-xs font-semibold flex items-center gap-2 shadow-lg">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              {offlineQueue.length} Pending
            </div>
          )}

          {smsStatus !== 'idle' && (
            <div className={`px-3 py-1.5 backdrop-blur-md rounded-full text-xs font-semibold flex items-center gap-2 shadow-lg border ${
              smsStatus === 'sending' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' :
              smsStatus === 'sent' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' :
              smsStatus === 'failed' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
              'bg-white/10 border-white/20 text-white/70'
            }`}>
              {smsStatus === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 
               smsStatus === 'sent' ? <CheckCircle2 className="w-3.5 h-3.5" /> : 
               smsStatus === 'failed' ? <XCircle className="w-3.5 h-3.5" /> : 
               <Zap className="w-3.5 h-3.5" />}
              {smsStatus === 'sending' ? 'Sending SMS...' :
               smsStatus === 'sent' ? 'SMS Sent' :
               smsStatus === 'failed' ? 'SMS Failed' : 'No Parent Phone'}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Fullscreen Toggle */}
          <button 
            onClick={toggleFullscreen}
            className="p-3 bg-black/60 backdrop-blur-md rounded-full text-white/70 hover:text-white border border-white/10 active:scale-95 transition-all shadow-xl"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
          
          {/* Settings Button */}
          <button 
            onClick={() => setShowSettingsPin(true)}
            className="p-3 bg-black/60 backdrop-blur-md rounded-full text-white/70 hover:text-white border border-white/10 active:scale-95 transition-all shadow-xl"
            title="Admin Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 3. Debug Overlay */}
      {debugMode && debugResult && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-md pointer-events-none">
           <div className={`p-4 backdrop-blur-xl rounded-2xl shadow-2xl border ${
             debugResult.found ? 'bg-emerald-950/80 border-emerald-500/50' : 'bg-red-950/80 border-red-500/50'
           }`}>
             <div className="text-sm font-bold text-white mb-2 flex items-center gap-2">
               <Bug className="w-4 h-4" /> Debug: {debugResult.found ? 'Valid' : 'Invalid'}
             </div>
             <div className="text-xs text-white/70 font-mono break-all mb-2">{debugResult.rawPayload}</div>
             <div className="text-xs text-white/90">Match: {debugResult.student?.full_name || 'None'}</div>
           </div>
        </div>
      )}

      {/* 4. Massive Feedback Overlay */}
      <div className="flex-1 relative z-20 flex flex-col justify-end items-center pb-32 px-4 pointer-events-none">
        {feedback && (
          <div className={`w-full max-w-xl p-6 md:p-8 rounded-[2rem] shadow-2xl transition-all duration-300 animate-in slide-in-from-bottom-12 zoom-in-95 ${
            feedback.status === 'PRESENT' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 
            feedback.status === 'LATE' || feedback.status === 'DUPLICATE' ? 'bg-amber-500 text-amber-950 shadow-amber-500/20' : 
            'bg-red-500 text-white shadow-red-500/20'
          }`}>
            <div className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-2 drop-shadow-sm truncate">
              {feedback.studentName}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-2xl md:text-3xl font-bold uppercase tracking-widest opacity-90">
                {feedback.status}
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
              <div className="text-lg md:text-xl font-medium opacity-90">
                {feedback.message}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Bottom Navigation / Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-black via-black/80 to-transparent z-30 flex justify-center gap-4">
        <button 
          onClick={() => setShowManualModal(true)} 
          className="flex-1 max-w-[200px] flex items-center justify-center gap-2 px-4 py-3 md:py-4 bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/20 rounded-2xl text-white font-semibold shadow-xl transition-all"
        >
          <Keyboard className="w-5 h-5" />
          <span>Manual Entry</span>
        </button>
        <button 
          onClick={() => setShowHistoryModal(true)} 
          className="flex-1 max-w-[200px] flex items-center justify-center gap-2 px-4 py-3 md:py-4 bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/20 rounded-2xl text-white font-semibold shadow-xl transition-all"
        >
          <History className="w-5 h-5" />
          <span>History</span>
        </button>
      </div>

      {/* --- MODALS & DIALOGS --- */}

      {/* PIN Verification for Settings */}
      <Dialog open={showSettingsPin} onOpenChange={setShowSettingsPin}>
        <DialogContent className="sm:max-w-md text-[var(--body-text)]">
          <DialogHeader>
            <DialogTitle>Admin Verification</DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center">
            <div className="text-sm text-[var(--sidebar-muted)] mb-6 text-center">
              Enter the 4-digit PIN for {sectionName} to access terminal settings.
            </div>
            
            <div className="flex gap-4 mb-6">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-bold border-2 transition-all duration-150 ${
                    i < settingsPin.length
                      ? 'border-[var(--primary)] bg-[rgba(4,71,28,0.1)] text-[var(--primary)]'
                      : 'border-[var(--input-border)] bg-[var(--input-bg)] text-transparent'
                  }`}
                >
                  {i < settingsPin.length ? '●' : ''}
                </div>
              ))}
            </div>

            {settingsPinError && (
              <div className="text-red-500 text-sm font-semibold mb-4 text-center animate-in fade-in">
                Incorrect PIN. Please try again.
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, idx) =>
                key === '' ? <div key={idx} /> : key === '⌫' ? (
                  <button key={idx} onClick={() => setSettingsPin(p => p.slice(0, -1))} className="h-14 bg-[var(--row-alt)] hover:bg-[var(--card-border)] text-[var(--body-text)] active:scale-95 rounded-xl text-xl font-bold transition-all">⌫</button>
                ) : (
                  <button key={idx} onClick={() => settingsPin.length < 4 && setSettingsPin(p => p + key)} className="h-14 bg-[var(--row-alt)] hover:bg-[var(--primary)] hover:text-[var(--primary-text)] text-[var(--body-text)] active:scale-95 rounded-xl text-xl font-bold transition-all">{key}</button>
                )
              )}
            </div>

            <Button 
              onClick={verifyAdminPin}
              disabled={settingsPin.length !== 4 || verifyingPin}
              className="w-full max-w-[280px] mt-6 py-6 text-lg font-bold rounded-xl"
            >
              {verifyingPin ? 'Verifying...' : 'Unlock Settings'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Settings Drawer/Dialog */}
      <Dialog open={showAdminDrawer} onOpenChange={setShowAdminDrawer}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto text-[var(--body-text)]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Terminal Settings
              <button onClick={() => setShowAdminDrawer(false)} className="flex items-center gap-2 text-sm text-[var(--sidebar-muted)] hover:text-[var(--body-text)] hover:bg-[var(--row-alt)] px-3 py-1.5 rounded-lg transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Scanner
              </button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Window Type Selection */}
            {!scanWindow && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--sidebar-muted)] uppercase tracking-wider">Window Type</h3>
                <div className="flex gap-2 p-1 bg-[var(--row-alt)] rounded-lg">
                  {(['morning_in', 'afternoon_in', 'afternoon_out'] as WindowType[]).map(t => {
                    const isCompleted = completedWindows.includes(t)
                    const isActive = windowType === t
                    return (
                      <button
                        key={t}
                        onClick={() => handleWindowTabClick(t)}
                        className={`flex-1 py-3 text-xs md:text-sm font-bold rounded-md transition-all ${isActive
                          ? 'bg-[var(--card-bg)] text-[var(--body-text)] shadow-sm'
                          : isCompleted
                            ? 'text-[var(--sidebar-muted)] opacity-60'
                            : 'text-[var(--sidebar-muted)] hover:text-[var(--body-text)] hover:bg-[rgba(0,0,0,0.05)]'
                          }`}
                      >
                        {t === 'morning_in' ? 'Morning IN' : t === 'afternoon_in' ? 'Afternoon IN' : 'Afternoon OUT'}
                        {isCompleted && !isActive && ' (Done)'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* State Controls (Start/End) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--sidebar-muted)] uppercase tracking-wider">Session Control</h3>
              <StateControls
                sectionId={sectionId}
                scanWindow={scanWindow}
                windowType={windowType}
                onWindowChange={handleWindowChange}
                onBatchAbsent={handleBatchAbsent}
              />
            </div>

            <hr className="border-[var(--card-border)]" />

            {/* ESP32 Settings */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--sidebar-muted)] uppercase tracking-wider">Hardware Camera</h3>
              <ESP32Settings onConnectionChange={setEsp32Url} />
            </div>

            <hr className="border-[var(--card-border)]" />

            {/* Feature Toggles */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* SMS Toggle */}
              <div className="p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--body-text)]">SMS Alerts</div>
                  <div className="text-xs text-[var(--sidebar-muted)] mt-0.5">{sendSms ? 'Enabled' : 'Disabled'}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={sendSms}
                  onClick={() => setSendSms(v => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${sendSms ? 'bg-[var(--primary)]' : 'bg-[var(--row-alt)] border border-[var(--card-border)]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${sendSms ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Debug Toggle */}
              <div className="p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--body-text)]">Debug Mode</div>
                  <div className="text-xs text-[var(--sidebar-muted)] mt-0.5">{debugMode ? 'No DB Writes' : 'Production'}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={debugMode}
                  onClick={() => { setDebugMode(v => !v); setDebugResult(null); setFeedback(null); }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${debugMode ? 'bg-amber-500' : 'bg-[var(--row-alt)] border border-[var(--card-border)]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${debugMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Entry Sheet */}
      <Dialog open={showManualModal} onOpenChange={setShowManualModal}>
        <DialogContent className="sm:max-w-md text-[var(--body-text)]">
          <DialogHeader>
            <DialogTitle>Manual LRN Entry</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <ManualEntry students={students} onSubmit={(lrn) => {
              processCode(lrn)
              setShowManualModal(false)
            }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Scan History Sheet */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto text-[var(--body-text)]">
          <DialogHeader>
            <DialogTitle>Recent Scans</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <ScanHistoryTab sectionId={sectionId} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmReopenType} onOpenChange={(open) => !open && setConfirmReopenType(null)}>
        <DialogContent className="text-[var(--body-text)]">
          <DialogHeader>
            <DialogTitle>Re-open Completed Window?</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-[var(--body-text)]">
            Warning: The {confirmReopenType?.replace('_', ' ').toUpperCase()} window has already been completed today. Are you sure you want to re-open and scan under this window?
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmReopenType(null)}>Cancel</Button>
            <Button onClick={() => {
              if (confirmReopenType) setWindowType(confirmReopenType)
              setConfirmReopenType(null)
            }} style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}>Re-open Window</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
