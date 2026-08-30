import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { Camera, CameraOff, Search, ChevronLeft, ChevronRight, X, Filter, RefreshCw } from 'lucide-react'

const supabaseServiceRole = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
)

interface Section {
  id: string
  name: string
  grade_level: string
}

interface AttendanceLog {
  id: string
  student_id: string
  scan_window_id: string
  status: string
  scanned_at: string
  verification_photo_url: string | null
  students: { full_name: string; lrn: string } | null
  scan_windows: { window_type: string; opened_at: string } | null
}

const WINDOW_LABELS: Record<string, string> = {
  morning_in: 'Morning IN',
  afternoon_in: 'Afternoon IN',
  afternoon_out: 'Afternoon OUT',
}

export default function PhotoVerification() {
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedWindow, setSelectedWindow] = useState<string>('all')
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const PAGE_SIZE = 20

  // Fetch sections
  useEffect(() => {
    const fetchSections = async () => {
      const { data } = await supabase.from('sections').select('id, name, grade_level').order('grade_level').order('name')
      if (data) setSections(data)
    }
    fetchSections()
  }, [])

  // Fetch attendance logs with photos
  const fetchLogs = useCallback(async (silent = false) => {
    if (!selectedSection) {
      setLogs([])
      return
    }
    if (!silent) {
      setLoading(true)
      setPage(0)
    }

    // Get scan windows for this section on the selected date
    const startOfDay = `${selectedDate}T00:00:00.000Z`
    const endOfDay = `${selectedDate}T23:59:59.999Z`

    let query = supabaseServiceRole
      .from('attendance_logs')
      .select(`
        id,
        student_id,
        scan_window_id,
        status,
        scanned_at,
        verification_photo_url,
        students!inner(full_name, lrn),
        scan_windows!inner(window_type, opened_at)
      `)
      .gte('scanned_at', startOfDay)
      .lte('scanned_at', endOfDay)
      .eq('scan_windows.section_id', selectedSection)
      .neq('status', 'ABSENT')
      .order('scanned_at', { ascending: true })

    if (selectedWindow !== 'all') {
      query = query.eq('scan_windows.window_type', selectedWindow)
    }

    const { data, error } = await query

    if (error) {
      console.error('[PHOTO VERIFY] Error fetching logs:', error)
      if (!silent) setLogs([])
    } else {
      setLogs((data as unknown as AttendanceLog[]) || [])
    }
    if (!silent) setLoading(false)
  }, [selectedSection, selectedDate, selectedWindow])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Auto-refresh polling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (autoRefresh && selectedSection) {
      interval = setInterval(() => {
        fetchLogs(true) // Silent refresh
      }, 3000) // Poll every 3 seconds
    }
    return () => clearInterval(interval)
  }, [autoRefresh, selectedSection, fetchLogs])

  // Filter by search
  const filteredLogs = logs.filter(log => {
    if (!search) return true
    const name = log.students?.full_name?.toLowerCase() || ''
    const lrn = log.students?.lrn?.toLowerCase() || ''
    const q = search.toLowerCase()
    return name.includes(q) || lrn.includes(q)
  })

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE)
  const paginatedLogs = filteredLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const withPhoto = filteredLogs.filter(l => l.verification_photo_url).length
  const withoutPhoto = filteredLogs.filter(l => !l.verification_photo_url).length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg md:text-xl font-semibold text-[var(--page-title)]">
          Photo Verification
        </h2>
        <p className="text-xs text-[var(--sidebar-muted)] mt-1">
          Review face verification photos captured during QR scans
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedSection}
          onChange={e => setSelectedSection(e.target.value)}
          className="px-3 py-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-sm text-[var(--body-text)] min-h-[44px]"
        >
          <option value="">Select Section</option>
          {sections.map(s => (
            <option key={s.id} value={s.id}>
              {s.grade_level} - {s.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="px-3 py-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-sm text-[var(--body-text)] min-h-[44px]"
        />

        <select
          value={selectedWindow}
          onChange={e => setSelectedWindow(e.target.value)}
          className="px-3 py-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-sm text-[var(--body-text)] min-h-[44px]"
        >
          <option value="all">All Windows</option>
          <option value="morning_in">Morning IN</option>
          <option value="afternoon_in">Afternoon IN</option>
          <option value="afternoon_out">Afternoon OUT</option>
        </select>

        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sidebar-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student name or LRN..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-sm text-[var(--body-text)] placeholder:text-[var(--sidebar-muted)] min-h-[44px]"
          />
        </div>
      </div>

      {/* Stats & Controls bar */}
      {selectedSection && !loading && (
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--row-alt)] rounded-lg text-xs font-semibold">
              <Filter className="w-3.5 h-3.5 text-[var(--sidebar-muted)]" />
              <span className="text-[var(--body-text)]">{filteredLogs.length} scans</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-semibold text-emerald-400">
              <Camera className="w-3.5 h-3.5" />
              {withPhoto} with photo
            </div>
            {withoutPhoto > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs font-semibold text-amber-400">
                <CameraOff className="w-3.5 h-3.5" />
                {withoutPhoto} no photo
              </div>
            )}
          </div>

          {/* Refresh Controls */}
          <div className="flex items-center gap-4 border border-[var(--card-border)] bg-[var(--row-alt)] rounded-lg p-1.5">
            <label className="flex items-center gap-2 cursor-pointer pl-2">
              <input 
                type="checkbox" 
                checked={autoRefresh} 
                onChange={e => setAutoRefresh(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[var(--card-border)] text-[var(--primary)] focus:ring-[var(--primary)] bg-black/20"
              />
              <span className="text-xs font-semibold text-[var(--body-text)]">Auto-Refresh</span>
            </label>
            <div className="w-px h-4 bg-[var(--card-border)]" />
            <button
              onClick={() => fetchLogs()}
              disabled={autoRefresh}
              className="p-1.5 rounded hover:bg-black/10 text-[var(--sidebar-muted)] hover:text-[var(--body-text)] transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              title="Manual Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin opacity-50' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Photo grid */}
      {loading ? (
        <div className="py-12 text-center text-[var(--sidebar-muted)] text-sm">
          Loading attendance records...
        </div>
      ) : !selectedSection ? (
        <div className="py-12 text-center text-[var(--sidebar-muted)] text-sm">
          Select a section to view verification photos
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="py-12 text-center text-[var(--sidebar-muted)] text-sm">
          No attendance records found for this date
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {paginatedLogs.map(log => (
              <div
                key={log.id}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Photo area */}
                <div
                  className="aspect-[4/3] bg-[var(--row-alt)] flex items-center justify-center cursor-pointer relative overflow-hidden"
                  onClick={() => log.verification_photo_url && setEnlargedPhoto(log.verification_photo_url)}
                >
                  {log.verification_photo_url ? (
                    <img
                      src={log.verification_photo_url}
                      alt={`Verification photo for ${log.students?.full_name}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-[var(--sidebar-muted)]">
                      <CameraOff className="w-8 h-8 opacity-30" />
                      <span className="text-[10px] font-semibold opacity-60">No Photo</span>
                    </div>
                  )}
                  {/* Status badge */}
                  <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    log.status === 'PRESENT'
                      ? 'bg-emerald-500/80 text-white'
                      : 'bg-amber-500/80 text-white'
                  }`}>
                    {log.status === 'PRESENT' ? 'P' : 'L'}
                  </div>
                </div>

                {/* Info */}
                <div className="p-2.5 space-y-0.5">
                  <div className="text-sm font-semibold text-[var(--body-text)] truncate" title={log.students?.full_name}>
                    {log.students?.full_name || 'Unknown'}
                  </div>
                  <div className="text-[10px] text-[var(--sidebar-muted)]">
                    {log.students?.lrn || '—'}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[var(--sidebar-muted)]">
                      {WINDOW_LABELS[log.scan_windows?.window_type || ''] || log.scan_windows?.window_type}
                    </span>
                    <span className="text-[10px] text-[var(--sidebar-muted)]">
                      {new Date(log.scanned_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-lg border border-[var(--card-border)] text-[var(--sidebar-muted)] hover:text-[var(--body-text)] hover:bg-[var(--row-alt)] disabled:opacity-30 transition-colors min-h-[44px]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-[var(--sidebar-muted)]">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 rounded-lg border border-[var(--card-border)] text-[var(--sidebar-muted)] hover:text-[var(--body-text)] hover:bg-[var(--row-alt)] disabled:opacity-30 transition-colors min-h-[44px]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Enlarged photo modal */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setEnlargedPhoto(null)}
        >
          <div className="relative max-w-lg w-full">
            <button
              onClick={() => setEnlargedPhoto(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white p-2"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={enlargedPhoto}
              alt="Enlarged verification photo"
              className="w-full rounded-xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
