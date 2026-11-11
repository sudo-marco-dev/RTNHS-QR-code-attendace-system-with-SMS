import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  fetchTextBeeQuota,
  sendDirectSms,
  formatPhilippinePhoneNumber,
  type TextBeeQuotaInfo
} from '../../lib/sms'
import {
  MessageSquare,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Download,
  Users,
  Check,
  Loader2,
  Clock,
  Smartphone,
  RotateCcw,
  Trash2,
  Eye,
  Megaphone,
  History,
  Info,
  X
} from 'lucide-react'

interface Section {
  id: string
  name: string
  grade_level: string
}

interface Student {
  id: string
  full_name: string
  lrn: string | null
  parent_phone: string | null
  section_id: string
  sections?: {
    id: string
    name: string
    grade_level: string
  }
}

interface SmsLogEntry {
  id: string
  student_id: string | null
  attendance_log_id: string | null
  parent_phone: string | null
  message_content: string
  status: string
  sms_type?: string | null
  error_message?: string | null
  batch_id?: string | null
  created_at: string
  students?: {
    full_name: string
    sections?: {
      name: string
      grade_level: string
    }
  } | null
}

const PRESET_TEMPLATES = [
  {
    label: 'Custom Announcement',
    text: ''
  },
  {
    label: 'Suspension of Classes (Weather / Typhoon)',
    text: '[RTNHS Notice] Good day. Please be informed that classes in RTNHS are officially suspended today due to inclement weather conditions. Stay safe!'
  },
  {
    label: 'Suspension of Classes (Specific Date)',
    text: '[RTNHS Notice] Good day. Please be informed that classes for {student_name} ({section}) are suspended on [Date] due to [Reason]. Classes resume on [Date].'
  },
  {
    label: 'Parent-Teacher Conference (PTA)',
    text: '[RTNHS Notice] Dear parent of {student_name}, you are cordially invited to our General PTA Assembly on [Date] at 8:00 AM at the RTNHS Gymnasium. Your attendance is highly appreciated.'
  },
  {
    label: 'Early Dismissal Notice',
    text: '[RTNHS Notice] Dear parent of {student_name}, students will be dismissed early today at [Time] due to an emergency faculty meeting.'
  },
  {
    label: 'School Activity / Holiday Notice',
    text: '[RTNHS Notice] Greetings! There will be no regular classes on [Date] in celebration of [Holiday/Event]. Have a wonderful and safe holiday!'
  }
]

export default function MessagesHub() {
  const [activeTab, setActiveTab] = useState<'compose' | 'logs'>('compose')
  const [quota, setQuota] = useState<TextBeeQuotaInfo | null>(null)
  const [loadingQuota, setLoadingQuota] = useState<boolean>(false)

  // Students & Sections data
  const [sections, setSections] = useState<Section[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState<boolean>(true)

  // Filters for Recipient Selection
  const [selectedGrade, setSelectedGrade] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [studentSearch, setStudentSearch] = useState<string>('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

  // Message Composer
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number>(0)
  const [messageContent, setMessageContent] = useState<string>('')

  // Dispatch state
  const [isSending, setIsSending] = useState<boolean>(false)
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number; success: number; failed: number; queued: number } | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // In-app Modals (replacing browser native dialogs)
  const [broadcastModalOpen, setBroadcastModalOpen] = useState<boolean>(false)
  const [deleteTargetLogId, setDeleteTargetLogId] = useState<string | null>(null)
  const [dispatchQueuedModalOpen, setDispatchQueuedModalOpen] = useState<boolean>(false)

  // Logs state
  const [logs, setLogs] = useState<SmsLogEntry[]>([])
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false)
  const [logSearch, setLogSearch] = useState<string>('')
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all')
  const [logTypeFilter, setLogTypeFilter] = useState<string>('all')
  const [selectedLogPreview, setSelectedLogPreview] = useState<SmsLogEntry | null>(null)
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null)

  // Load initial quota
  const refreshQuota = useCallback(async () => {
    setLoadingQuota(true)
    const q = await fetchTextBeeQuota()
    if (q) setQuota(q)
    setLoadingQuota(false)
  }, [])

  useEffect(() => {
    refreshQuota()
  }, [refreshQuota])

  // Fetch sections and students
  const fetchData = async () => {
    setLoadingStudents(true)
    try {
      const [secRes, stuRes] = await Promise.all([
        supabase.from('sections').select('id, name, grade_level').order('grade_level'),
        supabase.from('students').select('id, full_name, lrn, parent_phone, section_id, sections(id, name, grade_level)').order('full_name')
      ])

      if (secRes.data) setSections(secRes.data)
      if (stuRes.data) {
        const studentList = stuRes.data as unknown as Student[]
        setStudents(studentList)
        // Default select all with valid phones
        const validIds = new Set(
          studentList
            .filter(s => s.parent_phone && formatPhilippinePhoneNumber(s.parent_phone))
            .map(s => s.id)
        )
        setSelectedStudentIds(validIds)
      }
    } catch (err: any) {
      console.error('[MESSAGES] Data fetch error:', err)
      setFeedback({ type: 'error', text: 'Failed to load students and sections.' })
    } finally {
      setLoadingStudents(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const { data, error } = await supabase
        .from('sms_logs')
        .select(`
          id,
          student_id,
          attendance_log_id,
          parent_phone,
          message_content,
          status,
          sms_type,
          error_message,
          batch_id,
          created_at,
          students (
            full_name,
            sections (
              name,
              grade_level
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(300)

      if (error) throw error
      if (data) setLogs(data as unknown as SmsLogEntry[])
    } catch (err: any) {
      console.error('[MESSAGES] Logs fetch error:', err)
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs()
    }
  }, [activeTab, fetchLogs])

  // Grade levels list
  const gradeLevels = useMemo(() => {
    const set = new Set<string>()
    sections.forEach(s => {
      if (s.grade_level) set.add(s.grade_level)
    })
    return Array.from(set).sort()
  }, [sections])

  // Filtered sections based on grade
  const filteredSections = useMemo(() => {
    if (selectedGrade === 'all') return sections
    return sections.filter(s => s.grade_level.toLowerCase() === selectedGrade.toLowerCase())
  }, [sections, selectedGrade])

  // Filtered students for recipient selector
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Grade filter
      if (selectedGrade !== 'all') {
        const studentGrade = student.sections?.grade_level || ''
        if (studentGrade.toLowerCase() !== selectedGrade.toLowerCase()) return false
      }
      // Section filter
      if (selectedSection !== 'all') {
        if (student.section_id !== selectedSection) return false
      }
      // Search
      if (studentSearch.trim()) {
        const q = studentSearch.toLowerCase()
        const matchName = student.full_name.toLowerCase().includes(q)
        const matchLrn = (student.lrn || '').toLowerCase().includes(q)
        const matchPhone = (student.parent_phone || '').includes(q)
        if (!matchName && !matchLrn && !matchPhone) return false
      }
      return true
    })
  }, [students, selectedGrade, selectedSection, studentSearch])

  // Pinned selected students at top, secondary sort alphabetical
  const displayedStudents = useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      const aSel = selectedStudentIds.has(a.id) ? 1 : 0
      const bSel = selectedStudentIds.has(b.id) ? 1 : 0
      if (aSel !== bSel) {
        return bSel - aSel // 1 comes before 0, pinning selected students to top
      }
      return a.full_name.localeCompare(b.full_name)
    })
  }, [filteredStudents, selectedStudentIds])

  // Stats for current selection
  const selectionStats = useMemo(() => {
    const selectedStudentsList = filteredStudents.filter(s => selectedStudentIds.has(s.id))
    const withValidPhone = selectedStudentsList.filter(s => s.parent_phone && formatPhilippinePhoneNumber(s.parent_phone))
    const remainingQuota = quota ? Math.max(0, quota.dailyLimit - quota.processedSmsToday) : 50
    const exceedsQuota = withValidPhone.length > remainingQuota
    const sendTodayCount = Math.min(withValidPhone.length, remainingQuota)
    const queueTomorrowCount = Math.max(0, withValidPhone.length - remainingQuota)

    return {
      totalFiltered: filteredStudents.length,
      selectedCount: selectedStudentsList.length,
      validPhoneCount: withValidPhone.length,
      remainingQuota,
      exceedsQuota,
      sendTodayCount,
      queueTomorrowCount,
      validStudentsList: withValidPhone
    }
  }, [filteredStudents, selectedStudentIds, quota])

  // Checkbox handlers
  const handleSelectAllFiltered = () => {
    const next = new Set(selectedStudentIds)
    filteredStudents.forEach(s => {
      if (s.parent_phone && formatPhilippinePhoneNumber(s.parent_phone)) {
        next.add(s.id)
      }
    })
    setSelectedStudentIds(next)
  }

  const handleDeselectAllFiltered = () => {
    const next = new Set(selectedStudentIds)
    filteredStudents.forEach(s => next.delete(s.id))
    setSelectedStudentIds(next)
  }

  const handleToggleStudent = (id: string) => {
    const next = new Set(selectedStudentIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedStudentIds(next)
  }

  // Template change
  const handleTemplateChange = (idx: number) => {
    setSelectedTemplateIndex(idx)
    setMessageContent(PRESET_TEMPLATES[idx].text)
  }

  // Live preview message
  const previewSampleMessage = useMemo(() => {
    const sample = selectionStats.validStudentsList[0] || students[0]
    if (!messageContent) return 'Type your message above or select a preset template.'
    return messageContent
      .replace(/{student_name}/gi, sample ? sample.full_name : 'JUAN DELA CRUZ')
      .replace(/{section}/gi, sample?.sections?.name ? `${sample.sections.grade_level} - ${sample.sections.name}` : 'Grade 12 - Resilience')
  }, [messageContent, selectionStats.validStudentsList, students])

  // Character calculation
  const charCount = messageContent.length
  const smsSegments = Math.ceil(charCount / 160) || 1

  // Open Broadcast Confirmation Modal
  const handleOpenBroadcastModal = () => {
    if (!messageContent.trim()) {
      setFeedback({ type: 'error', text: 'Please write a message or select a template before sending.' })
      return
    }

    const recipients = selectionStats.validStudentsList
    if (recipients.length === 0) {
      setFeedback({ type: 'error', text: 'No students with valid phone numbers are selected.' })
      return
    }

    setBroadcastModalOpen(true)
  }

  // Execute Send Broadcast
  const executeSendBroadcast = async () => {
    const recipients = selectionStats.validStudentsList
    const { sendTodayCount } = selectionStats

    setIsSending(true)
    setFeedback(null)
    const batchId = `bcast_${Date.now()}`

    setSendProgress({
      current: 0,
      total: recipients.length,
      success: 0,
      failed: 0,
      queued: 0
    })

    let successCount = 0
    let failedCount = 0
    let queuedCount = 0

    // 1. Process immediate quota batch
    for (let i = 0; i < recipients.length; i++) {
      const student = recipients[i]
      const phone = formatPhilippinePhoneNumber(student.parent_phone)!
      const personalizedMessage = messageContent
        .replace(/{student_name}/gi, student.full_name)
        .replace(/{section}/gi, student.sections?.name || 'RTNHS')

      if (i < sendTodayCount) {
        // Send immediately via TextBee
        try {
          const res = await sendDirectSms(phone, personalizedMessage)
          const isDeliveredOrSent = res.status === 'delivered' || res.status === 'sent' || res.status === 'queued'

          if (isDeliveredOrSent) {
            successCount++
          } else {
            failedCount++
          }

          // Record in sms_logs
          await supabase.from('sms_logs').insert({
            student_id: student.id,
            parent_phone: phone,
            message_content: personalizedMessage,
            status: isDeliveredOrSent ? (res.status === 'delivered' ? 'delivered' : 'sent') : 'failed',
            sms_type: 'broadcast',
            error_message: res.errorMessage || null,
            batch_id: batchId
          })
        } catch (err: any) {
          failedCount++
          await supabase.from('sms_logs').insert({
            student_id: student.id,
            parent_phone: phone,
            message_content: personalizedMessage,
            status: 'failed',
            sms_type: 'broadcast',
            error_message: err?.message || 'Network dispatch error',
            batch_id: batchId
          })
        }

        // Small delay to prevent Android burst throttling
        await new Promise(r => setTimeout(r, 300))
      } else {
        // Queue excess for tomorrow
        queuedCount++
        await supabase.from('sms_logs').insert({
          student_id: student.id,
          parent_phone: phone,
          message_content: personalizedMessage,
          status: 'queued',
          sms_type: 'broadcast',
          error_message: 'Deferred: Exceeded TextBee 50-SMS daily limit. Ready for tomorrow.',
          batch_id: batchId
        })
      }

      setSendProgress({
        current: i + 1,
        total: recipients.length,
        success: successCount,
        failed: failedCount,
        queued: queuedCount
      })
    }

    setIsSending(false)
    await refreshQuota()
    setFeedback({
      type: 'success',
      text: `Broadcast complete! ${successCount} sent/delivered${queuedCount > 0 ? `, ${queuedCount} queued for tomorrow` : ''}${failedCount > 0 ? `, ${failedCount} failed` : ''}.`
    })
  }

  // Retry individual log entry
  const handleRetryLog = async (log: SmsLogEntry) => {
    if (!log.parent_phone) return
    setRetryingLogId(log.id)

    try {
      const res = await sendDirectSms(log.parent_phone, log.message_content)
      const isOk = res.status === 'delivered' || res.status === 'sent' || res.status === 'queued'
      const newStatus = isOk ? (res.status === 'delivered' ? 'delivered' : 'sent') : (res.status === 'quota_exceeded' ? 'queued' : 'failed')

      await supabase
        .from('sms_logs')
        .update({
          status: newStatus,
          error_message: res.errorMessage || null
        })
        .eq('id', log.id)

      await fetchLogs()
      await refreshQuota()
      setFeedback({ type: 'success', text: `Message retry finished with status: ${newStatus}` })
    } catch (err: any) {
      console.error('[MESSAGES] Retry failed:', err)
      setFeedback({ type: 'error', text: 'Message retry failed.' })
    } finally {
      setRetryingLogId(null)
    }
  }

  // Execute delete log
  const executeDeleteLog = async (id: string) => {
    try {
      await supabase.from('sms_logs').delete().eq('id', id)
      setLogs(prev => prev.filter(l => l.id !== id))
      setFeedback({ type: 'info', text: 'SMS delivery record deleted.' })
    } catch (err: any) {
      console.error('[MESSAGES] Delete log failed:', err)
      setFeedback({ type: 'error', text: 'Failed to delete SMS delivery record.' })
    }
  }

  // Dispatch all queued logs
  const handlePromptDispatchQueued = () => {
    const queuedLogs = logs.filter(l => l.status === 'queued')
    if (queuedLogs.length === 0) return

    const remaining = quota ? Math.max(0, quota.dailyLimit - quota.processedSmsToday) : 50
    if (remaining <= 0) {
      setFeedback({
        type: 'error',
        text: "Today's SMS quota has already been reached. Please wait for the daily quota reset or check your TextBee dashboard."
      })
      return
    }

    setDispatchQueuedModalOpen(true)
  }

  const executeDispatchQueued = async () => {
    const queuedLogs = logs.filter(l => l.status === 'queued')
    const remaining = quota ? Math.max(0, quota.dailyLimit - quota.processedSmsToday) : 50
    const batch = queuedLogs.slice(0, remaining)

    setLoadingLogs(true)
    for (const log of batch) {
      if (!log.parent_phone) continue
      try {
        const res = await sendDirectSms(log.parent_phone, log.message_content)
        const isOk = res.status === 'delivered' || res.status === 'sent' || res.status === 'queued'
        await supabase
          .from('sms_logs')
          .update({
            status: isOk ? (res.status === 'delivered' ? 'delivered' : 'sent') : 'failed',
            error_message: res.errorMessage || null
          })
          .eq('id', log.id)
        await new Promise(r => setTimeout(r, 300))
      } catch (err) {
        console.error('[MESSAGES] Queued dispatch error:', err)
      }
    }
    await fetchLogs()
    await refreshQuota()
    setLoadingLogs(false)
    setFeedback({ type: 'success', text: `Successfully dispatched ${batch.length} queued messages!` })
  }

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Status
      if (logStatusFilter !== 'all' && log.status.toLowerCase() !== logStatusFilter.toLowerCase()) {
        return false
      }
      // Type
      if (logTypeFilter !== 'all') {
        const type = (log.sms_type || 'attendance').toLowerCase()
        if (type !== logTypeFilter.toLowerCase()) return false
      }
      // Search
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase()
        const studentName = log.students?.full_name?.toLowerCase() || ''
        const phone = log.parent_phone || ''
        const content = log.message_content.toLowerCase()
        if (!studentName.includes(q) && !phone.includes(q) && !content.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [logs, logStatusFilter, logTypeFilter, logSearch])

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      setFeedback({ type: 'info', text: 'No logs available to export for the selected filter.' })
      return
    }

    const headers = ['Date & Time', 'Student Name', 'Grade & Section', 'Parent Phone', 'Type', 'Status', 'Message Content', 'Error Details']
    const rows = filteredLogs.map(l => [
      new Date(l.created_at).toLocaleString('en-PH'),
      l.students?.full_name || 'N/A',
      l.students?.sections ? `${l.students.sections.grade_level} - ${l.students.sections.name}` : 'N/A',
      l.parent_phone || 'None',
      l.sms_type || 'attendance',
      l.status,
      `"${l.message_content.replace(/"/g, '""')}"`,
      `"${(l.error_message || '').replace(/"/g, '""')}"`
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `RTNHS_SMS_Delivery_Audit_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const queuedCountInLogs = logs.filter(l => l.status === 'queued').length
  const queuedBatchCount = Math.min(
    queuedCountInLogs,
    quota ? Math.max(0, quota.dailyLimit - quota.processedSmsToday) : 50
  )

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 1. Header & Live Quota Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--card-border)]">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-emerald-100 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Messages & Broadcasts Hub
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-emerald-200/70 mt-1">
            Disseminate school announcements, manage bulk SMS, and audit real-time carrier delivery receipts.
          </p>
        </div>

        {/* Live Quota Pill */}
        <div className="flex items-center gap-2 bg-[var(--row-alt)] border border-[var(--card-border)] p-2.5 px-4 rounded-xl shadow-sm text-xs">
          <Smartphone className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-emerald-100">
              <span>TextBee Quota:</span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                {quota ? `${quota.processedSmsToday} / ${quota.dailyLimit}` : 'Loading...'}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-emerald-300/70">today</span>
            </div>
            <div className="text-[10px] text-gray-500 dark:text-emerald-300/70">
              {quota ? `${Math.max(0, quota.dailyLimit - quota.processedSmsToday)} credits remaining today` : 'Checking quota...'}
            </div>
          </div>
          <button
            onClick={refreshQuota}
            disabled={loadingQuota}
            className="ml-2 p-1.5 text-gray-500 dark:text-emerald-300 hover:text-gray-900 dark:hover:text-emerald-100 hover:bg-[var(--card-border)] rounded-lg transition-all"
            title="Refresh Quota"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingQuota ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Feedback Notification */}
      {feedback && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm animate-in fade-in ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            : feedback.type === 'info'
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
            : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
        }`}>
          {feedback.type === 'success' ? <Check className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <span className="flex-1 font-medium">{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-xs font-semibold opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-[var(--card-border)] pb-2 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('compose')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
            activeTab === 'compose'
              ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-emerald-200/70 hover:text-gray-900 dark:hover:text-emerald-100 hover:bg-[var(--row-alt)]'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          Compose Bulk Broadcast
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all relative ${
            activeTab === 'logs'
              ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-emerald-200/70 hover:text-gray-900 dark:hover:text-emerald-100 hover:bg-[var(--row-alt)]'
          }`}
        >
          <History className="w-4 h-4" />
          Message History & Delivery Logs
          {queuedCountInLogs > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-black">
              {queuedCountInLogs}
            </span>
          )}
        </button>
      </div>

      {/* 4. Tab 1: Compose Bulk Broadcast */}
      {activeTab === 'compose' && (
        <div className="space-y-6">
          {/* Top Info Banner for Quota */}
          {selectionStats.exceedsQuota && (
            <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-amber-900 dark:text-amber-100">Smart 50-SMS Quota Management Active</div>
                <p className="leading-relaxed">
                  You have selected <strong className="font-semibold">{selectionStats.validPhoneCount} recipients</strong>, but TextBee has <strong className="font-semibold">{selectionStats.remainingQuota} credits remaining today</strong>.
                  The system will automatically dispatch <strong className="font-semibold">{selectionStats.sendTodayCount} messages now</strong>, and place the remaining <strong className="font-semibold">{selectionStats.queueTomorrowCount} recipients into the queue</strong> ready for 1-click dispatch tomorrow.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Filter & Recipient Selector (7 cols) */}
            <div className="lg:col-span-7 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-2 font-bold text-sm text-gray-900 dark:text-emerald-100">
                  <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Select Target Recipients
                </div>
                <div className="text-xs text-gray-600 dark:text-emerald-200/80">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectionStats.selectedCount}</span> of {selectionStats.totalFiltered} selected
                </div>
              </div>

              {/* Filters: Grade, Section, Search */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {/* Grade Level Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-emerald-200 mb-1.5">
                    Grade Level
                  </label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => {
                      setSelectedGrade(e.target.value)
                      setSelectedSection('all')
                    }}
                    className="w-full p-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-gray-900 dark:text-emerald-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="all">All Grade Levels</option>
                    {gradeLevels.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Section Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-emerald-200 mb-1.5">
                    Section
                  </label>
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="w-full p-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-gray-900 dark:text-emerald-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="all">All Sections ({filteredSections.length})</option>
                    {filteredSections.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.grade_level})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-emerald-200 mb-1.5">
                    Search Student / LRN
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-emerald-300/50 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Name, LRN, phone..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-xs text-gray-900 dark:text-emerald-100 placeholder:text-gray-400 dark:placeholder:text-emerald-300/40 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Bulk Select / Deselect Bar */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectAllFiltered}
                    className="px-2.5 py-1 bg-[var(--row-alt)] hover:bg-emerald-500/10 border border-[var(--card-border)] rounded-md font-medium text-gray-800 dark:text-emerald-100 transition-all"
                  >
                    Select All in Filter
                  </button>
                  <button
                    onClick={handleDeselectAllFiltered}
                    className="px-2.5 py-1 bg-[var(--row-alt)] hover:bg-[var(--card-border)] border border-[var(--card-border)] rounded-md font-medium text-gray-600 dark:text-emerald-300 hover:text-gray-900 dark:hover:text-emerald-100 transition-all"
                  >
                    Deselect All
                  </button>
                </div>

                <div className="text-[11px] text-gray-600 dark:text-emerald-200/80 font-medium">
                  {selectionStats.validPhoneCount} have valid numbers
                </div>
              </div>

              {/* Student Checklist Table */}
              <div className="border border-[var(--card-border)] rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                {loadingStudents ? (
                  <div className="p-8 text-center text-xs text-gray-600 dark:text-emerald-200/70 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                    Loading students...
                  </div>
                ) : displayedStudents.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-600 dark:text-emerald-200/70">
                    No students match the selected filter.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--row-alt)] border-b border-[var(--card-border)] text-gray-700 dark:text-emerald-200/90 sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 w-8">
                          <input
                            type="checkbox"
                            checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.has(s.id))}
                            onChange={(e) => e.target.checked ? handleSelectAllFiltered() : handleDeselectAllFiltered()}
                            className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
                          />
                        </th>
                        <th className="p-2.5 font-semibold">Student Name</th>
                        <th className="p-2.5 font-semibold">Grade & Section</th>
                        <th className="p-2.5 font-semibold">Parent Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--card-border)]">
                      {displayedStudents.map(student => {
                        const formatted = formatPhilippinePhoneNumber(student.parent_phone)
                        const isSelected = selectedStudentIds.has(student.id)
                        const hasPhone = !!formatted

                        return (
                          <tr
                            key={student.id}
                            onClick={() => hasPhone && handleToggleStudent(student.id)}
                            className={`cursor-pointer transition-colors ${
                              !hasPhone
                                ? 'opacity-40 cursor-not-allowed bg-red-500/5'
                                : isSelected
                                ? 'bg-emerald-500/10 dark:bg-emerald-500/20 font-medium'
                                : 'hover:bg-[var(--row-alt)]'
                            }`}
                          >
                            <td className="p-2.5">
                              <input
                                type="checkbox"
                                disabled={!hasPhone}
                                checked={isSelected}
                                onChange={() => handleToggleStudent(student.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
                              />
                            </td>
                            <td className="p-2.5 text-gray-900 dark:text-emerald-100 font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{student.full_name}</span>
                                {isSelected && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-600/20 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-300 font-semibold uppercase tracking-wider">
                                    Selected
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-2.5 text-gray-600 dark:text-emerald-200/70">
                              {student.sections?.grade_level} - {student.sections?.name}
                            </td>
                            <td className="p-2.5 font-mono text-[11px]">
                              {formatted ? (
                                <span className="text-emerald-700 dark:text-emerald-300 font-medium">{formatted}</span>
                              ) : (
                                <span className="text-red-500 font-sans italic">No phone</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Right Column: Compose Announcement & Live Preview (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
                  <div className="font-bold text-sm text-gray-900 dark:text-emerald-100 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Compose Announcement
                  </div>
                  <div className="text-xs text-gray-600 dark:text-emerald-200/80 font-mono">
                    {charCount} / 160 chars ({smsSegments} SMS)
                  </div>
                </div>

                {/* Preset Templates Dropdown */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-emerald-200 mb-1.5">
                    Quick Announcement Preset
                  </label>
                  <select
                    value={selectedTemplateIndex}
                    onChange={(e) => handleTemplateChange(Number(e.target.value))}
                    className="w-full p-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-xs text-gray-900 dark:text-emerald-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {PRESET_TEMPLATES.map((tmpl, idx) => (
                      <option key={idx} value={idx}>{tmpl.label}</option>
                    ))}
                  </select>
                </div>

                {/* Message Textarea */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-semibold text-gray-700 dark:text-emerald-200">
                      Message Content
                    </label>
                    <div className="text-[10px] text-cyan-700 dark:text-cyan-300 font-mono">
                      Placeholders: <code className="bg-[var(--row-alt)] px-1 rounded">{'{student_name}'}</code>, <code className="bg-[var(--row-alt)] px-1 rounded">{'{section}'}</code>
                    </div>
                  </div>
                  <textarea
                    rows={5}
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder="Enter school announcement to parents..."
                    className="w-full p-3 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-xl text-xs text-gray-900 dark:text-emerald-100 placeholder:text-gray-400 dark:placeholder:text-emerald-300/40 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed resize-none"
                  />
                </div>

                {/* Live Message Preview Card */}
                <div className="p-3.5 bg-emerald-950/5 dark:bg-black/40 border border-emerald-900/10 dark:border-white/10 rounded-xl space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300/80 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    Parent SMS Preview
                  </div>
                  <p className="text-xs text-gray-900 dark:text-emerald-100 font-mono leading-relaxed bg-white/90 dark:bg-black/60 p-3 rounded-lg border border-emerald-900/10 dark:border-white/10 shadow-sm">
                    {previewSampleMessage}
                  </p>
                </div>

                {/* Progress Bar during active send */}
                {isSending && sendProgress && (
                  <div className="p-3.5 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-xl space-y-2 animate-in fade-in">
                    <div className="flex justify-between text-xs font-semibold text-gray-900 dark:text-emerald-100">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                        Dispatching messages...
                      </span>
                      <span>{sendProgress.current} / {sendProgress.total}</span>
                    </div>
                    <div className="w-full bg-[var(--card-border)] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{ width: `${Math.round((sendProgress.current / sendProgress.total) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ {sendProgress.success} sent</span>
                      {sendProgress.queued > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold">⏳ {sendProgress.queued} queued</span>}
                      {sendProgress.failed > 0 && <span className="text-red-600 dark:text-red-400 font-semibold">✕ {sendProgress.failed} failed</span>}
                    </div>
                  </div>
                )}

                {/* Dispatch Button */}
                <button
                  onClick={handleOpenBroadcastModal}
                  disabled={isSending || selectionStats.validPhoneCount === 0 || !messageContent.trim()}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${
                    isSending || selectionStats.validPhoneCount === 0 || !messageContent.trim()
                      ? 'bg-gray-500/20 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                  }`}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending Broadcast...
                    </>
                  ) : selectionStats.queueTomorrowCount > 0 ? (
                    <>
                      <Send className="w-4 h-4" />
                      Send Broadcast ({selectionStats.sendTodayCount} Today, {selectionStats.queueTomorrowCount} Queued)
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Broadcast to {selectionStats.validPhoneCount} Parent(s)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Message History & Delivery Logs */}
      {activeTab === 'logs' && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm space-y-4">
          {/* Action & Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--card-border)]">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Search */}
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-emerald-300/50 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search student, phone, text..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-xs text-gray-900 dark:text-emerald-100 placeholder:text-gray-400 dark:placeholder:text-emerald-300/40 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Status Filter */}
              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="p-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-xs text-gray-900 dark:text-emerald-100 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="delivered">Delivered ✓</option>
                <option value="sent">Sent / Dispatched</option>
                <option value="queued">Queued / Quota Reset</option>
                <option value="failed">Failed</option>
              </select>

              {/* Type Filter */}
              <select
                value={logTypeFilter}
                onChange={(e) => setLogTypeFilter(e.target.value)}
                className="p-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-xs text-gray-900 dark:text-emerald-100 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="attendance">Attendance Scans</option>
                <option value="broadcast">Announcements</option>
              </select>
            </div>

            {/* Actions: Refresh, Dispatch Queued, Export */}
            <div className="flex items-center gap-2 shrink-0">
              {queuedCountInLogs > 0 && (
                <button
                  onClick={handlePromptDispatchQueued}
                  disabled={loadingLogs}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  title="Dispatch queued messages waiting for quota reset"
                >
                  <Send className="w-3.5 h-3.5" />
                  Dispatch Queued ({queuedCountInLogs})
                </button>
              )}

              <button
                onClick={handleExportCsv}
                className="px-3 py-1.5 bg-[var(--row-alt)] hover:bg-[var(--card-border)] text-gray-800 dark:text-emerald-100 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-all active:scale-95 border border-[var(--card-border)]"
                title="Export filtered logs to CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>

              <button
                onClick={fetchLogs}
                disabled={loadingLogs}
                className="p-2 bg-[var(--row-alt)] hover:bg-[var(--card-border)] text-gray-800 dark:text-emerald-100 rounded-lg transition-all"
                title="Refresh Logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Logs Table */}
          <div className="border border-[var(--card-border)] rounded-xl overflow-hidden overflow-x-auto">
            {loadingLogs ? (
              <div className="p-12 text-center text-xs text-gray-600 dark:text-emerald-200/70 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                Loading message history...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-600 dark:text-emerald-200/70">
                No SMS delivery records found.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--row-alt)] border-b border-[var(--card-border)] text-gray-700 dark:text-emerald-200/90 font-semibold">
                  <tr>
                    <th className="p-3 font-semibold">Date & Time</th>
                    <th className="p-3 font-semibold">Student & Section</th>
                    <th className="p-3 font-semibold">Parent Phone</th>
                    <th className="p-3 font-semibold">Type</th>
                    <th className="p-3 font-semibold">Message Preview</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {filteredLogs.map(log => {
                    const isRetrying = retryingLogId === log.id
                    const statusLower = log.status.toLowerCase()

                    return (
                      <tr key={log.id} className="hover:bg-[var(--row-alt)] transition-colors">
                        {/* Date */}
                        <td className="p-3 text-gray-600 dark:text-emerald-200/80 whitespace-nowrap font-mono text-[11px]">
                          {new Date(log.created_at).toLocaleString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </td>

                        {/* Student & Section */}
                        <td className="p-3 font-medium text-gray-900 dark:text-emerald-100">
                          <div>{log.students?.full_name || 'Direct Recipient'}</div>
                          {log.students?.sections && (
                            <div className="text-[10px] text-gray-500 dark:text-emerald-300/70">
                              {log.students.sections.grade_level} - {log.students.sections.name}
                            </div>
                          )}
                        </td>

                        {/* Phone */}
                        <td className="p-3 font-mono text-[11px] text-gray-700 dark:text-emerald-200 whitespace-nowrap">
                          {log.parent_phone || 'None'}
                        </td>

                        {/* Type Badge */}
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.sms_type === 'broadcast'
                              ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20'
                              : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                          }`}>
                            {log.sms_type === 'broadcast' ? 'Broadcast' : 'Attendance'}
                          </span>
                        </td>

                        {/* Content */}
                        <td className="p-3 max-w-xs truncate text-gray-900 dark:text-emerald-100 font-sans" title={log.message_content}>
                          <button
                            onClick={() => setSelectedLogPreview(log)}
                            className="text-left truncate hover:underline hover:text-emerald-600 dark:hover:text-emerald-400 w-full block"
                          >
                            {log.message_content}
                          </button>
                        </td>

                        {/* Status Badge */}
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            statusLower === 'delivered'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                              : statusLower === 'sent'
                              ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                              : statusLower === 'queued'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                              : 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30'
                          }`}>
                            {statusLower === 'delivered' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                            {statusLower === 'sent' && <Check className="w-3 h-3 text-cyan-500" />}
                            {statusLower === 'queued' && <Clock className="w-3 h-3 text-amber-500" />}
                            {statusLower === 'failed' && <XCircle className="w-3 h-3 text-red-500" />}
                            {statusLower === 'delivered' ? 'Delivered ✓' :
                             statusLower === 'sent' ? 'Dispatched' :
                             statusLower === 'queued' ? 'Queued' : 'Failed'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Retry button for failed or queued */}
                            {(statusLower === 'failed' || statusLower === 'queued') && (
                              <button
                                onClick={() => handleRetryLog(log)}
                                disabled={isRetrying}
                                className="p-1.5 bg-[var(--row-alt)] hover:bg-[var(--card-border)] text-cyan-600 dark:text-cyan-400 rounded-lg transition-all"
                                title="Retry sending via TextBee"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                              </button>
                            )}

                            {/* Delete log */}
                            <button
                              onClick={() => setDeleteTargetLogId(log.id)}
                              className="p-1.5 bg-[var(--row-alt)] hover:bg-red-500/20 text-gray-500 hover:text-red-500 rounded-lg transition-all"
                              title="Delete record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 6. Message Preview Modal */}
      {selectedLogPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
              <h3 className="font-bold text-sm text-gray-900 dark:text-emerald-100 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Message Details
              </h3>
              <button
                onClick={() => setSelectedLogPreview(null)}
                className="text-xs p-1 rounded-lg text-gray-500 dark:text-emerald-300 hover:text-gray-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[var(--card-border)]">
                <span className="text-gray-500 dark:text-emerald-200/70">Recipient</span>
                <span className="font-semibold text-gray-900 dark:text-emerald-100">
                  {selectedLogPreview.students?.full_name || 'N/A'} ({selectedLogPreview.parent_phone})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--card-border)]">
                <span className="text-gray-500 dark:text-emerald-200/70">Type</span>
                <span className="font-semibold text-gray-900 dark:text-emerald-100 capitalize">
                  {selectedLogPreview.sms_type || 'attendance'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--card-border)]">
                <span className="text-gray-500 dark:text-emerald-200/70">Status</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 capitalize">
                  {selectedLogPreview.status}
                </span>
              </div>
              {selectedLogPreview.error_message && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-[11px]">
                  <strong>Error details:</strong> {selectedLogPreview.error_message}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-emerald-200 mb-1">
                Full Message Text
              </label>
              <div className="p-3 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-xl text-xs font-mono text-gray-900 dark:text-emerald-100 leading-relaxed select-all">
                {selectedLogPreview.message_content}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedLogPreview(null)}
                className="px-4 py-2 bg-[var(--row-alt)] text-gray-800 dark:text-emerald-100 rounded-xl font-semibold text-xs hover:bg-[var(--card-border)] transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal: In-App Broadcast Confirmation Modal */}
      {broadcastModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-[var(--card-border)]">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-emerald-100">
                  Confirm Bulk Broadcast
                </h3>
                <p className="text-xs text-gray-500 dark:text-emerald-200/70">
                  Review audience and delivery split before dispatching SMS.
                </p>
              </div>
            </div>

            {/* Recipient / Quota Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-xl text-center">
                <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-emerald-300/70">Total Selected</div>
                <div className="text-lg font-bold text-gray-900 dark:text-emerald-100 font-mono">
                  {selectionStats.validPhoneCount}
                </div>
              </div>
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300">Sending Today</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {selectionStats.sendTodayCount}
                </div>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300">Queued for Tomorrow</div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono">
                  {selectionStats.queueTomorrowCount}
                </div>
              </div>
            </div>

            {/* Warning if queued */}
            {selectionStats.queueTomorrowCount > 0 && (
              <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Due to the TextBee daily limit ({quota?.dailyLimit || 50} SMS/day), {selectionStats.queueTomorrowCount} messages will be queued. You can dispatch them tomorrow from the logs tab once the limit resets.
                </span>
              </div>
            )}

            {/* Sample Message Preview */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-gray-700 dark:text-emerald-200">
                Personalized Preview Sample:
              </div>
              <div className="p-3 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-xl text-xs font-mono text-gray-900 dark:text-emerald-100 leading-relaxed max-h-32 overflow-y-auto">
                {previewSampleMessage}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setBroadcastModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-gray-700 dark:text-emerald-200 hover:bg-[var(--row-alt)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setBroadcastModalOpen(false)
                  executeSendBroadcast()
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
              >
                <Send className="w-4 h-4" />
                Confirm & Dispatch SMS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: In-App Delete Confirmation Modal */}
      {deleteTargetLogId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/15 text-red-500">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-emerald-100">
                  Delete SMS Log Record
                </h3>
                <p className="text-xs text-gray-500 dark:text-emerald-200/70">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-emerald-200/80 leading-relaxed">
              Are you sure you want to permanently remove this SMS delivery receipt from the database?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTargetLogId(null)}
                className="px-3.5 py-2 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-gray-700 dark:text-emerald-200 hover:bg-[var(--row-alt)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = deleteTargetLogId
                  setDeleteTargetLogId(null)
                  executeDeleteLog(id)
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all active:scale-95"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Modal: In-App Dispatch Queued Confirmation Modal */}
      {dispatchQueuedModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-emerald-100">
                  Dispatch Queued Messages
                </h3>
                <p className="text-xs text-gray-500 dark:text-emerald-200/70">
                  Send deferred announcements using available quota.
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-emerald-200/80 leading-relaxed">
              Dispatch <strong className="text-gray-900 dark:text-emerald-100">{queuedBatchCount}</strong> queued messages now? You currently have <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">{quota ? Math.max(0, quota.dailyLimit - quota.processedSmsToday) : 50}</strong> slots remaining today on TextBee.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDispatchQueuedModalOpen(false)}
                className="px-3.5 py-2 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-gray-700 dark:text-emerald-200 hover:bg-[var(--row-alt)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDispatchQueuedModalOpen(false)
                  executeDispatchQueued()
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Dispatch {queuedBatchCount} Messages
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
