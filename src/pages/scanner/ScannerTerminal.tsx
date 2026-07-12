import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import PinScreen from '../../components/scanner/PinScreen'
import CameraStream from '../../components/scanner/CameraStream'
import StateControls from '../../components/scanner/StateControls'
import type { ScanWindow, WindowType } from '../../components/scanner/StateControls'
import { playSuccess, playDuplicate, playError } from '../../components/scanner/AudioFeedback'
import { Zap } from 'lucide-react'

interface Student {
  id: string
  full_name: string
  lrn: string
  qr_code: string
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
  const [manualLrn, setManualLrn] = useState('')
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushingRef = useRef(false)

  // Load section roster after authentication
  useEffect(() => {
    if (!sectionId) return
    const fetchStudents = async () => {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, lrn, qr_code')
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

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return
    const queue = loadOfflineQueue()
    if (queue.length === 0) return
    flushingRef.current = true

    const remaining: OfflineEntry[] = []
    for (const entry of queue) {
      const { error } = await supabase.from('attendance_logs').insert(entry)
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

  const processCode = useCallback(async (code: string) => {
    // Find student by qr_code first, then lrn
    const student = students.find(s => s.qr_code === code || s.lrn === code)

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

    const status: 'PRESENT' | 'LATE' = scanWindow.status === 'open' ? 'PRESENT' : 'LATE'
    const entry: OfflineEntry = {
      student_id: student.id,
      scan_window_id: scanWindow.id,
      status,
      scanned_at: new Date().toISOString(),
      offline_sync: false
    }

    const { error } = await supabase.from('attendance_logs').insert(entry)

    if (error) {
      // Queue offline
      const newQueue = [...loadOfflineQueue(), { ...entry, offline_sync: true }]
      saveOfflineQueue(newQueue)
      setOfflineQueue(newQueue)
    }

    playSuccess()
    setScannedIds(prev => new Set([...prev, student.id]))
    showFeedback({ studentName: student.full_name, lrn: student.lrn, status, message: status === 'PRESENT' ? 'Attendance recorded' : 'Marked as Late' })
  }, [students, scanWindow, scannedIds])

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

  const handleSimulateScan = () => {
    const unscanned = students.filter(s => !scannedIds.has(s.id))
    if (unscanned.length === 0) {
      playError()
      showFeedback({ studentName: '—', lrn: '—', status: 'ERROR', message: 'All students have already been scanned.' })
      return
    }
    const random = unscanned[Math.floor(Math.random() * unscanned.length)]
    processCode(random.qr_code)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualLrn.trim()) return
    processCode(manualLrn.trim())
    setManualLrn('')
  }

  const statusStyles: Record<string, string> = {
    PRESENT: 'text-tea border-l-2 border-tea',
    LATE: 'text-[#ffd166] border-l-2 border-[#ffd166]',
    ABSENT: 'text-[#f5c0c3] border-l-2 border-burgundy',
    DUPLICATE: 'text-[#ffd166] border-l-2 border-[#ffd166]',
    ERROR: 'text-[#f5c0c3] border-l-2 border-burgundy'
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
    <div className="min-h-screen bg-evergreen text-text-on-dark flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-evergreen border-b border-[rgba(195,216,152,0.2)]">
        <div>
          <h1 className="text-tea text-4xl font-medium tracking-wide">RTNHS Scanner</h1>
          <p className="text-sm text-muted-on-dark mt-1">{sectionName}</p>
        </div>
        <div className="flex items-center gap-4">
          {offlineQueue.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-orange-900 border border-orange-600 rounded-full text-xs font-semibold text-orange-300">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              {offlineQueue.length} Pending Sync
            </div>
          )}
          <button
            onClick={() => { setPhase('pin'); setSectionId(''); setSectionName(''); setStudents([]); setScanWindow(null); setScannedIds(new Set()) }}
            className="text-xs text-muted-on-dark hover:text-tea transition-colors"
          >
            Change Section
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-w-6xl mx-auto w-full">
        
        {/* Left Column: Camera + Manual Input */}
        <div className="space-y-4">
          {/* Window type selector */}
          {!scanWindow && (
            <div className="flex gap-2">
              {(['morning_in', 'afternoon_in', 'afternoon_out'] as WindowType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setWindowType(t)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    windowType === t
                      ? 'bg-forest-mid border-[rgba(195,216,152,0.3)] text-tea'
                      : 'bg-transparent border-[rgba(195,216,152,0.2)] text-muted-on-dark hover:border-[rgba(195,216,152,0.3)]'
                  }`}
                >
                  {t === 'morning_in' ? 'Morning IN' : t === 'afternoon_in' ? 'Afternoon IN' : 'Afternoon OUT'}
                </button>
              ))}
            </div>
          )}

          <CameraStream onScan={processCode} active={phase === 'scanning'} />

          {/* Feedback Card */}
          {feedback && (
            <div className={`p-4 border border-[rgba(195,216,152,0.2)] bg-[rgba(195,216,152,0.08)] rounded-xl transition-all duration-300 ${statusStyles[feedback.status]}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-medium text-text-on-dark">{feedback.studentName}</div>
                  <div className="text-sm text-muted-on-dark">LRN: {feedback.lrn}</div>
                  <div className="text-sm mt-1">{feedback.message}</div>
                </div>
                <div className={`text-2xl font-extrabold tracking-widest`}>
                  {feedback.status}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Controls + Stats */}
        <div className="space-y-4">
          <StateControls
            sectionId={sectionId}
            scanWindow={scanWindow}
            windowType={windowType}
            onWindowChange={setScanWindow}
            onBatchAbsent={handleBatchAbsent}
          />

          {/* Scan stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-[rgba(195,216,152,0.08)] border border-[rgba(195,216,152,0.2)] rounded-xl text-center">
              <div className="text-2xl font-bold text-tea">{scannedIds.size}</div>
              <div className="text-xs text-muted-on-dark mt-1">Scanned</div>
            </div>
            <div className="p-3 bg-[rgba(195,216,152,0.08)] border border-[rgba(195,216,152,0.2)] rounded-xl text-center">
              <div className="text-2xl font-bold text-tea">{students.length - scannedIds.size}</div>
              <div className="text-xs text-muted-on-dark mt-1">Remaining</div>
            </div>
            <div className="p-3 bg-[rgba(195,216,152,0.08)] border border-[rgba(195,216,152,0.2)] rounded-xl text-center">
              <div className="text-2xl font-bold text-tea">{students.length}</div>
              <div className="text-xs text-muted-on-dark mt-1">Total</div>
            </div>
          </div>

          {/* Manual LRN Entry */}
          <form onSubmit={handleManualSubmit} className="p-4 bg-[rgba(195,216,152,0.08)] border border-[rgba(195,216,152,0.2)] rounded-xl space-y-3">
            <label className="block text-xs uppercase tracking-widest text-muted-on-dark font-semibold">
              Manual LRN Entry
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualLrn}
                onChange={e => setManualLrn(e.target.value)}
                placeholder="Type or paste student LRN..."
                className="flex-1 px-3 py-2 bg-transparent border border-[rgba(195,216,152,0.3)] rounded-lg text-sm text-text-on-dark focus:outline-none focus:border-tea placeholder:text-muted-on-dark"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-forest hover:bg-forest-mid text-tea rounded-lg text-sm font-semibold transition-colors"
              >
                Submit
              </button>
            </div>
          </form>

          {/* Simulate Scan */}
          <button
            onClick={handleSimulateScan}
            className="w-full py-3 bg-forest hover:bg-forest-mid active:scale-95 border border-[rgba(195,216,152,0.3)] rounded-xl font-semibold tracking-wide transition-all flex justify-center items-center gap-2 text-tea"
          >
            <Zap className="w-5 h-5 text-tea fill-tea" /> Simulate Scan
          </button>

          {/* Student roster preview */}
          <div className="p-4 bg-[rgba(195,216,152,0.08)] border border-[rgba(195,216,152,0.2)] rounded-xl">
            <div className="text-xs uppercase tracking-widest text-muted-on-dark font-semibold mb-3">
              Section Roster ({students.length})
            </div>
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {students.map(s => (
                <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-transparent border border-[rgba(195,216,152,0.1)]">
                  <div className="text-sm truncate text-text-on-dark">{s.full_name}</div>
                  <div className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    scannedIds.has(s.id) ? 'bg-forest text-tea border-none' : 'text-muted-on-dark'
                  }`}>
                    {scannedIds.has(s.id) ? '✓' : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
