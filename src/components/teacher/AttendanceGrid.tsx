import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent } from '../ui/Card'
import { AttendanceBadge } from '../ui/AttendanceBadge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { startOfDay, endOfDay, isWithinInterval, startOfWeek, addDays, format, isSameDay } from 'date-fns'
import { transformLogsToExportRows, downloadCsv } from '../../lib/exportFormatter'
import { ClipboardList, Calendar, BarChart3, AlertTriangle, Download } from 'lucide-react'

interface LogEntry {
  status: string
  scanned_at: string
  offline_sync: boolean
  student: {
    id: string
    full_name: string
    sections: { name: string; grade_level: string }
  }
  scan_window?: { window_type: string }
}

export default function AttendanceGrid() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('attendance_logs')
          .select(`
            status, 
            scanned_at,
            offline_sync,
            student:students!student_id(
              id,
              full_name, 
              sections!section_id(name, grade_level)
            ),
            scan_window:scan_windows!scan_window_id(window_type)
          `)
          .order('scanned_at', { ascending: false })

        if (error) throw error
        if (data) setLogs(data as unknown as LogEntry[])
      } catch {
        setFetchError('Could not load attendance records. Please check your connection.')
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [])

  const dailyLogs = useMemo(() => {
    if (!selectedDate) return []
    const targetDate = new Date(selectedDate + 'T00:00:00')
    const start = startOfDay(targetDate)
    const end = endOfDay(targetDate)
    return logs.filter(log => isWithinInterval(new Date(log.scanned_at), { start, end }))
  }, [logs, selectedDate])

  const weeklyHeaders = useMemo(() => {
    const today = new Date()
    const start = startOfWeek(today, { weekStartsOn: 1 })
    return Array.from({ length: 5 }).map((_, i) => addDays(start, i))
  }, [])

  const weeklyData = useMemo(() => {
    const studentMap: Record<string, { name: string; section: string; logs: Record<string, string> }> = {}
    logs.forEach(log => {
      const sId = log.student.id
      if (!studentMap[sId]) {
        studentMap[sId] = {
          name: log.student.full_name,
          section: `${log.student.sections.grade_level} ${log.student.sections.name}`,
          logs: {}
        }
      }
      const logDate = new Date(log.scanned_at)
      weeklyHeaders.forEach(day => {
        if (isSameDay(logDate, day)) {
          studentMap[sId].logs[format(day, 'yyyy-MM-dd')] = log.status
        }
      })
    })
    return Object.values(studentMap)
  }, [logs, weeklyHeaders])

  const monthlyData = useMemo(() => {
    const aggMap: Record<string, { name: string; section: string; present: number; late: number; absent: number }> = {}
    logs.forEach(log => {
      const sId = log.student.id
      if (!aggMap[sId]) {
        aggMap[sId] = {
          name: log.student.full_name,
          section: `${log.student.sections.grade_level} ${log.student.sections.name}`,
          present: 0, late: 0, absent: 0
        }
      }
      if (log.status === 'PRESENT') aggMap[sId].present++
      if (log.status === 'LATE') aggMap[sId].late++
      if (log.status === 'ABSENT') aggMap[sId].absent++
    })
    return Object.values(aggMap).sort((a, b) => a.name.localeCompare(b.name))
  }, [logs])

  const handleExportCsv = () => {
    const exportRows = transformLogsToExportRows(logs as any)
    downloadCsv(exportRows, `attendance_research_${format(new Date(), 'yyyy-MM')}`)
  }

  const renderBadge = (status: string | undefined) => {
    if (status === 'PRESENT') return <AttendanceBadge status="PRESENT" />
    if (status === 'LATE') return <AttendanceBadge status="LATE" />
    if (status === 'ABSENT') return <AttendanceBadge status="ABSENT" />
    return <span style={{ fontSize: 11, color: 'var(--muted-text)' }}>—</span>
  }

  if (loading) return <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted-text)' }}>Loading attendance data...</div>

  return (
    <div className="space-y-6">
      <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Attendance Analytics</h2>

      {fetchError && (
        <div style={{ padding: '16px', background: 'var(--row-alt)', border: '0.5px solid var(--danger)', borderRadius: 10, fontSize: 13, color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle className="w-4 h-4" /> {fetchError}
        </div>
      )}

      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="daily">Daily List</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Grid</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Aggregates</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <Card>
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium">Select Date:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  style={{ borderRadius: 6 }}
                />
              </div>
              <div className="overflow-x-auto">
                <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden', minWidth: 600 }}>
                  <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', padding: '12px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)' }}>Time Scanned</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)' }}>Student Name</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)' }}>Section</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)' }}>Status</span>
                  </div>

                  {dailyLogs.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                      <ClipboardList className="w-12 h-12 mx-auto mb-2 text-[var(--sidebar-muted)]" />
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--body-text)' }}>No logs for this date.</div>
                      <div style={{ fontSize: 12, color: 'var(--muted-text)', marginTop: 4 }}>Try selecting a different date.</div>
                    </div>
                  ) : (
                    dailyLogs.map((log, idx) => (
                      <div key={idx} style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 2fr 1fr 1fr',
                        padding: '9px 14px',
                        borderTop: '0.5px solid var(--card-border)',
                        background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{format(new Date(log.scanned_at), 'hh:mm a')}</span>
                        <span style={{ fontSize: 12, color: 'var(--body-text)', fontWeight: 500 }}>{log.student.full_name}</span>
                        <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{log.student.sections.grade_level} {log.student.sections.name}</span>
                        <span>{renderBadge(log.status)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden', minWidth: 800 }}>
                  <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1fr', padding: '12px 14px', gap: '8px' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)' }}>Student</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)' }}>Section</span>
                    {weeklyHeaders.map(day => (
                      <span key={day.toISOString()} style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)', textAlign: 'center' }}>
                        {format(day, 'EEE MM/dd')}
                      </span>
                    ))}
                  </div>

                  {weeklyData.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                      <Calendar className="w-12 h-12 mx-auto mb-2 text-[var(--sidebar-muted)]" />
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--body-text)' }}>No scans recorded this week.</div>
                    </div>
                  ) : (
                    weeklyData.map((row, idx) => (
                      <div key={idx} style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1fr',
                        padding: '9px 14px',
                        gap: '8px',
                        borderTop: '0.5px solid var(--card-border)',
                        background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 12, color: 'var(--body-text)', fontWeight: 500 }}>{row.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted-text)' }}>{row.section}</span>
                        {weeklyHeaders.map(day => {
                          const dateKey = format(day, 'yyyy-MM-dd')
                          return (
                            <span key={dateKey} style={{ textAlign: 'center' }}>
                              {renderBadge(row.logs[dateKey])}
                            </span>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <p style={{ fontSize: 12, color: 'var(--muted-text)' }}>Research-ready CSV with arrival times and window types.</p>
                <Button onClick={handleExportCsv} variant="outline" className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden', minWidth: 600 }}>
                  <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)' }}>Student Name</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)' }}>Section</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)', textAlign: 'center' }}>Present</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)', textAlign: 'center' }}>Late</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--table-header-text)', textAlign: 'center' }}>Absent</span>
                  </div>

                  {monthlyData.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                      <BarChart3 className="w-12 h-12 mx-auto mb-2 text-[var(--sidebar-muted)]" />
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--body-text)' }}>No attendance data to aggregate yet.</div>
                      <div style={{ fontSize: 12, color: 'var(--muted-text)', marginTop: 4 }}>Logs will appear once students start scanning in.</div>
                    </div>
                  ) : (
                    monthlyData.map((row, idx) => (
                      <div key={idx} style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                        padding: '9px 14px',
                        borderTop: '0.5px solid var(--card-border)',
                        background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 12, color: 'var(--body-text)', fontWeight: 500 }}>{row.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{row.section}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textAlign: 'center' }}>{row.present}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#b35c00', textAlign: 'center' }}>{row.late}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', textAlign: 'center' }}>{row.absent}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
