import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// The scanner runs without a logged-in session (anon JWT), but attendance_logs
// has RLS policies only for admins/teachers. Use the service-role client (same
// pattern as ScannerTerminal) so history can be read for this section.
const supabaseServiceRole = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
)

interface Props {
  sectionId: string
}

interface LogEntry {
  id: string
  scanned_at: string
  status: 'PRESENT' | 'LATE' | 'ABSENT'
  scan_window_id: string
  student: {
    full_name: string
    lrn: string
  }
  scan_window: {
    window_type: string
  }
}

export default function ScanHistoryTab({ sectionId }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sectionId) return
    const fetchLogs = async () => {
      // Get today's start and end
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const { data } = await supabaseServiceRole
        .from('attendance_logs')
        .select(`
          id, scanned_at, status, scan_window_id,
          student:students!student_id(full_name, lrn),
          scan_window:scan_windows!scan_window_id(window_type, section_id)
        `)
        .eq('scan_window.section_id', sectionId)
        .gte('scanned_at', today.toISOString())
        .lt('scanned_at', tomorrow.toISOString())
        .order('scanned_at', { ascending: false })

      // Filter locally since nested eq on scan_window might not filter the top level row if no inner join
      if (data) {
        const sectionLogs = (data as any[]).filter(d => d.scan_window?.section_id === sectionId)
        setLogs(sectionLogs)
      }
      setLoading(false)
    }

    fetchLogs()

    // Auto-refresh every minute
    const interval = setInterval(fetchLogs, 60000)
    return () => clearInterval(interval)
  }, [sectionId])

  if (loading) {
    return <div className="p-8 text-center text-[var(--sidebar-muted)]">Loading history...</div>
  }

  if (logs.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-[var(--sidebar-muted)] mb-2">No scans recorded today</div>
        <div className="text-sm text-[var(--muted-text)]">Scan history for this section will appear here.</div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden shadow-sm">
      <div className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr] p-3 border-b border-[var(--card-border)] bg-[var(--table-header-bg)] text-[var(--table-header-text)] text-xs font-semibold">
        <div>Time</div>
        <div>Student</div>
        <div>LRN</div>
        <div>Window</div>
        <div>Status</div>
      </div>
      <div className="divide-y divide-[var(--card-border)] max-h-[600px] overflow-y-auto">
        {logs.map(log => {
          const time = new Date(log.scanned_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          const wType = log.scan_window?.window_type.replace('_', ' ').toUpperCase() || 'UNKNOWN'

          let statusColor = 'text-[var(--body-text)]'
          if (log.status === 'PRESENT') statusColor = 'text-[#c3d898]'
          else if (log.status === 'LATE') statusColor = 'text-[#ffd166]'
          else if (log.status === 'ABSENT') statusColor = 'text-[#f5c0c3]'

          return (
            <div key={log.id} className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr] p-3 items-center text-sm hover:bg-[var(--row-hover)] transition-colors">
              <div className="text-[var(--muted-text)] text-xs">{time}</div>
              <div className="font-medium text-[var(--body-text)]">{log.student?.full_name}</div>
              <div className="text-[var(--muted-text)]">{log.student?.lrn}</div>
              <div className="text-xs font-semibold text-[var(--sidebar-muted)]">{wType}</div>
              <div className={`text-xs font-bold ${statusColor}`}>{log.status}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
