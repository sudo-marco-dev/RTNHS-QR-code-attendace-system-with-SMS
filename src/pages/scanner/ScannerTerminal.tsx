import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import PinScreen from '../../components/scanner/PinScreen'
import CameraStream from '../../components/scanner/CameraStream'
import StateControls from '../../components/scanner/StateControls'
import type { ScanWindow, WindowType } from '../../components/scanner/StateControls'
import { playSuccess, playDuplicate, playError } from '../../components/scanner/AudioFeedback'
import { Home, Bug, QrCode, CheckCircle2, XCircle, Zap } from 'lucide-react'
import { sendAttendanceSms } from '../../lib/sms'
import { useNavigate } from 'react-router-dom'
import ManualEntry from '../../components/scanner/ManualEntry'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/Tabs'
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
  const [currentTime, setCurrentTime] = useState(new Date())
  const navigate = useNavigate()

  type SmsStatus = 'idle' | 'sending' | 'sent' | 'failed' | 'no_phone';
  const [smsStatus, setSmsStatus] = useState<SmsStatus>('idle');
  const [lastSmsSentTo, setLastSmsSentTo] = useState<string | null>(null);
  const [sendSms, setSendSms] = useState(true);

  const [completedWindows, setCompletedWindows] = useState<WindowType[]>([])
  const [confirmReopenType, setConfirmReopenType] = useState<WindowType | null>(null)

  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushingRef = useRef(false)

  const handleWindowChange = useCallback((window: ScanWindow | null) => {
    if (!window && scanWindow) {
      setCompletedWindows(prev => {
        if (!prev.includes(scanWindow.window_type)) {
          return [...prev, scanWindow.window_type]
        }
        return prev
      })
      const order: WindowType[] = ['morning_in', 'afternoon_in', 'afternoon_out']
      const currIdx = order.indexOf(scanWindow.window_type)
      if (currIdx < order.length - 1 && !completedWindows.includes(order[currIdx + 1])) {
        setWindowType(order[currIdx + 1])
      }
    }
    setScanWindow(window)
  }, [scanWindow, completedWindows])

  const handleWindowTabClick = (type: WindowType) => {
    if (scanWindow) return
    if (completedWindows.includes(type)) {
      setConfirmReopenType(type)
    } else {
      setWindowType(type)
    }
  }

  // Load section roster after authentication
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
    fetchStudents()
  }, [sectionId])

  // Auto-flush offline queue on mount and every 30 seconds
  useEffect(() => {
    flushQueue()
    const interval = setInterval(flushQueue, 30000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clock timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

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

    if (scannedIds.has(student.id)) {
      playDuplicate()
      showFeedback({ studentName: student.full_name, lrn: student.lrn, status: 'DUPLICATE', message: 'Already scanned in this window' })
      return
    }

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
        setLastSmsSentTo(student.parent_phone)

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
    setScannedIds(prev => new Set([...prev, student.id]))
    showFeedback({ studentName: student.full_name, lrn: student.lrn, status, message: status === 'PRESENT' ? 'Attendance recorded' : 'Marked as Late' })
  }, [students, scanWindow, scannedIds, debugMode, processDebugCode, sendSms])

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
    setScannedIds(new Set())
  }, [students, scannedIds])

  const statusStyles: Record<string, string> = {
    PRESENT: 'text-[#c3d898] border-l-2 border-[#c3d898]',
    LATE: 'text-[#ffd166] border-l-2 border-[#ffd166]',
    ABSENT: 'text-[#f5c0c3] border-l-2 border-[#f5c0c3]',
    DUPLICATE: 'text-[#ffd166] border-l-2 border-[#ffd166]',
    ERROR: 'text-[#f5c0c3] border-l-2 border-[#f5c0c3]'
  }

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
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--body-text)] flex flex-col transition-colors">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-[var(--card-bg)] border-b border-[var(--card-border)] shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/login')}
            className="p-2 -ml-2 rounded-lg text-[var(--sidebar-muted)] hover:text-[var(--primary)] hover:bg-[var(--row-alt)] transition-colors"
            title="Exit to Login"
          >
            <Home className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-[var(--page-title)] text-lg md:text-2xl font-semibold tracking-wide">Scanner Terminal</h1>
            <p className="text-xs md:text-sm text-[var(--sidebar-muted)] mt-0.5">{sectionName || 'No Section Selected'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right mr-2">
            <div className="text-sm font-medium text-[var(--body-text)]">{currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
            <div className="text-xs text-[var(--sidebar-muted)]">{currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </div>
          {offlineQueue.length > 0 && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-orange-900/40 border border-orange-600 rounded-full text-xs font-semibold text-orange-400">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              {offlineQueue.length} Pending
            </div>
          )}
          <button
            onClick={() => { setPhase('pin'); setSectionId(''); setSectionName(''); setStudents([]); handleWindowChange(null); setScannedIds(new Set()); setCompletedWindows([]) }}
            className="text-xs px-3 py-1.5 rounded-md border border-[var(--card-border)] text-[var(--sidebar-muted)] hover:text-[var(--body-text)] hover:bg-[var(--row-alt)] transition-colors"
          >
            Change
          </button>
        </div>
      </header>

      <Tabs defaultValue="scanner" className="flex-1 flex flex-col">
        <div className="px-4 md:px-6 pt-4 pb-2 bg-[var(--page-bg)]">
          <TabsList>
            <TabsTrigger value="scanner">Live Scanner</TabsTrigger>
            <TabsTrigger value="history">Scan History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="scanner" className="flex-1 flex flex-col m-0 mt-0">
          <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-6 p-4 md:p-6 pt-2 max-w-[1400px] mx-auto w-full">

            {/* Left Column: Camera + Feedback */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4 min-h-[400px]">
              {/* Window type selector */}
              {!scanWindow && (
                <div className="flex gap-2 p-1 bg-[var(--row-alt)] rounded-lg">
                  {(['morning_in', 'afternoon_in', 'afternoon_out'] as WindowType[]).map(t => {
                    const isCompleted = completedWindows.includes(t)
                    const isActive = windowType === t
                    return (
                      <button
                        key={t}
                        onClick={() => handleWindowTabClick(t)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${isActive
                          ? 'bg-[var(--card-bg)] text-[var(--body-text)] shadow-sm'
                          : isCompleted
                            ? 'text-[var(--sidebar-muted)] opacity-60 hover:opacity-100 hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.05)]'
                            : 'text-[var(--sidebar-muted)] hover:text-[var(--body-text)] hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.05)]'
                          }`}
                      >
                        {t === 'morning_in' ? 'Morning IN' : t === 'afternoon_in' ? 'Afternoon IN' : 'Afternoon OUT'}
                        {isCompleted && !isActive && ' (Done)'}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Inline Live / Debug mode toggle (shared camera stream) */}
              <div className="p-1 bg-[var(--row-alt)] rounded-xl flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setDebugMode(false); setDebugResult(null) }}
                  className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${!debugMode
                    ? 'bg-[var(--card-bg)] text-[var(--body-text)] shadow-sm'
                    : 'text-[var(--sidebar-muted)] hover:text-[var(--body-text)] hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.05)]'
                    }`}
                >
                  <QrCode className={`w-4 h-4 ${!debugMode ? 'text-[var(--primary)]' : ''}`} />
                  Live Mode
                </button>
                <button
                  type="button"
                  onClick={() => { setDebugMode(true); setFeedback(null) }}
                  className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${debugMode
                    ? 'bg-[var(--card-bg)] text-[var(--body-text)] shadow-sm ring-1 ring-amber-500/40'
                    : 'text-[var(--sidebar-muted)] hover:text-[var(--body-text)] hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.05)]'
                    }`}
                >
                  <Bug className={`w-4 h-4 ${debugMode ? 'text-amber-500' : ''}`} />
                  Debug Mode
                </button>
              </div>

              <CameraStream onScan={processCode} active={phase === 'scanning'} debug={debugMode} />

              {/* Inline Debug Feedback Overlay */}
              {debugMode && debugResult && (
                <div className={`p-4 border rounded-xl shadow-sm transition-all duration-300 ${debugResult.found
                  ? 'border-[rgba(195,216,152,0.4)] bg-[rgba(195,216,152,0.08)]'
                  : 'border-[rgba(112,22,30,0.4)] bg-[rgba(112,22,30,0.12)]'
                  }`}>
                  <div className="flex items-start gap-3">
                    {debugResult.found ? (
                      <CheckCircle2 className="w-6 h-6 text-[#c3d898] shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-6 h-6 text-[#f5c0c3] shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-2">
                      <div className={`font-semibold text-sm ${debugResult.found ? 'text-[#c3d898]' : 'text-[#f5c0c3]'}`}>
                        {debugResult.found ? 'Valid Student Match Found' : 'No Student Match in Section'}
                      </div>

                      {/* Raw String */}
                      <div className="text-xs text-[var(--body-text)]">
                        <span className="text-[var(--sidebar-muted)] font-semibold">Raw Payload: </span>
                        <span className="break-all font-mono">{debugResult.rawPayload}</span>
                      </div>

                      {/* Student Name Match */}
                      <div className="text-xs text-[var(--body-text)]">
                        <span className="text-[var(--sidebar-muted)] font-semibold">Student Name Match: </span>
                        <span className={debugResult.found ? 'text-[#c3d898] font-semibold' : 'text-[#f5c0c3] font-semibold'}>
                          {debugResult.found ? `✓ ${debugResult.student?.full_name}` : '✗ None'}
                        </span>
                      </div>

                      {/* Validation Status */}
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-[var(--sidebar-muted)] font-semibold">Validation Status: </span>
                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${debugResult.found
                          ? 'bg-[#c3d898]/20 text-[#c3d898] border border-[#c3d898]/40'
                          : 'bg-[#f5c0c3]/20 text-[#f5c0c3] border border-[#f5c0c3]/40'
                          }`}>
                          {debugResult.found ? 'Valid' : 'Invalid'}
                        </span>
                        <span className="text-[var(--sidebar-muted)] ml-1">— no database write (debug only)</span>
                      </div>

                      {debugResult.student && (
                        <div className="text-xs text-[var(--body-text)]">
                          <span className="text-[var(--sidebar-muted)] font-semibold">LRN: </span>
                          {debugResult.student.lrn}
                        </div>
                      )}
                    </div>
                    <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  </div>
                </div>
              )}

              {/* Feedback Card */}
              {feedback && (
                <div className={`p-4 border border-[var(--card-border)] bg-[var(--card-bg)] rounded-xl shadow-sm transition-all duration-300 ${statusStyles[feedback.status]}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-medium text-[var(--body-text)]">{feedback.studentName}</div>
                      <div className="text-sm text-[var(--sidebar-muted)]">LRN: {feedback.lrn}</div>
                      <div className="text-sm mt-1 text-[var(--body-text)] opacity-90">{feedback.message}</div>
                    </div>
                    <div className={`text-2xl font-extrabold tracking-widest`}>
                      {feedback.status}
                    </div>
                  </div>
                </div>
              )}

              {/* SMS Status Indicator */}
              {smsStatus !== 'idle' && (
                <div style={{
                  marginTop: 10,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  ...(smsStatus === 'sending' && {
                    background: 'rgba(195,216,152,0.08)',
                    borderColor: 'rgba(195,216,152,0.25)',
                    color: '#9fc98a',
                  }),
                  ...(smsStatus === 'sent' && {
                    background: 'rgba(195,216,152,0.12)',
                    borderColor: 'rgba(195,216,152,0.4)',
                    color: '#c3d898',
                  }),
                  ...(smsStatus === 'failed' && {
                    background: 'rgba(112,22,30,0.15)',
                    borderColor: 'rgba(112,22,30,0.4)',
                    color: '#f5c0c3',
                  }),
                  ...(smsStatus === 'no_phone' && {
                    background: 'rgba(195,216,152,0.05)',
                    borderColor: 'rgba(195,216,152,0.15)',
                    color: '#6b9e5e',
                  }),
                }}>
                  <i
                    className={
                      smsStatus === 'sending' ? 'ti ti-loader-2 animate-spin' :
                        smsStatus === 'sent' ? 'ti ti-check' :
                          smsStatus === 'failed' ? 'ti ti-alert-triangle' :
                            'ti ti-phone-off'
                    }
                    style={{ fontSize: 16 }}
                    aria-hidden
                  />
                  <span>
                    {smsStatus === 'sending' && 'Sending SMS to parent...'}
                    {smsStatus === 'sent' && `SMS sent to parent (${lastSmsSentTo})`}
                    {smsStatus === 'failed' && 'SMS failed — check API key or phone connection'}
                    {smsStatus === 'no_phone' && 'No parent phone number on record for this student'}
                  </span>
                </div>
              )}
            </div>

            {/* Right Column: Controls + Stats + Manual Entry */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4 h-full">
              <StateControls
                sectionId={sectionId}
                scanWindow={scanWindow}
                windowType={windowType}
                onWindowChange={handleWindowChange}
                onBatchAbsent={handleBatchAbsent}
              />

              {/* Scan stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-center shadow-sm">
                  <div className="text-2xl font-bold text-[var(--primary)]">{scannedIds.size}</div>
                  <div className="text-xs text-[var(--sidebar-muted)] mt-1">Scanned</div>
                </div>
                <div className="p-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-center shadow-sm">
                  <div className="text-2xl font-bold text-[var(--primary)]">{students.length - scannedIds.size}</div>
                  <div className="text-xs text-[var(--sidebar-muted)] mt-1">Remaining</div>
                </div>
                <div className="p-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-center shadow-sm">
                  <div className="text-2xl font-bold text-[var(--primary)]">{students.length}</div>
                  <div className="text-xs text-[var(--sidebar-muted)] mt-1">Total</div>
                </div>
              </div>

              {/* SMS Notifications Toggle */}
              <div className="p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--body-text)]">SMS Notifications</div>
                    <div className="text-xs text-[var(--sidebar-muted)] mt-0.5">
                      {sendSms ? 'Parent SMS will be sent on each scan' : 'No SMS will be sent on scans'}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sendSms}
                    onClick={() => setSendSms(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${sendSms ? 'bg-[var(--primary)]' : 'bg-[var(--row-alt)] border border-[var(--card-border)]'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${sendSms ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </div>
              </div>

              {/* Manual Entry */}
              <div className="p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm space-y-3">
                <label className="block text-xs uppercase tracking-widest text-[var(--sidebar-muted)] font-semibold">
                  Manual Entry
                </label>
                <ManualEntry students={students} onSubmit={processCode} />
              </div>

              {/* Student roster preview */}
              <div className="p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm flex-1 flex flex-col min-h-[250px] lg:min-h-[150px]">
                <div className="text-xs uppercase tracking-widest text-[var(--sidebar-muted)] font-semibold mb-3">
                  Section Roster ({students.length})
                </div>
                <div className="space-y-1 overflow-y-auto pr-1 flex-1">
                  {students.map(s => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[var(--row-alt)] transition-colors">
                      <div className="text-sm truncate text-[var(--body-text)]">{s.full_name}</div>
                      <div className={`text-xs px-2 py-0.5 rounded-full font-semibold ${scannedIds.has(s.id) ? 'bg-[#c3d898] text-[#04471c]' : 'bg-[var(--row-alt)] text-[var(--sidebar-muted)]'
                        }`}>
                        {scannedIds.has(s.id) ? '✓' : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="history" className="flex-1 p-4 md:p-6 pt-2 max-w-[1400px] mx-auto w-full m-0 mt-0">
          <ScanHistoryTab sectionId={sectionId} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirmReopenType} onOpenChange={(open) => !open && setConfirmReopenType(null)}>
        <DialogContent>
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
