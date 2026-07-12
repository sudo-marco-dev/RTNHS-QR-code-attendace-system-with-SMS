import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent } from '../ui/Card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { startOfDay, endOfDay, isWithinInterval, startOfWeek, addDays, format, isSameDay } from 'date-fns'
import { transformLogsToExportRows, downloadCsv } from '../../lib/exportFormatter'

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
    if (status === 'PRESENT') return <span className="px-2 py-0.5 text-xs font-semibold text-green-800 bg-green-100 rounded-full">Present</span>
    if (status === 'LATE') return <span className="px-2 py-0.5 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full">Late</span>
    if (status === 'ABSENT') return <span className="px-2 py-0.5 text-xs font-semibold text-red-800 bg-red-100 rounded-full">Absent</span>
    return <span className="text-gray-300 text-xs">—</span>
  }

  if (loading) return <div className="py-8 text-center text-gray-500">Loading attendance data...</div>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Attendance Analytics</h2>

      {fetchError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {fetchError}
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
                  className="px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time Scanned</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-12 text-center">
                          <div className="text-3xl mb-2">📋</div>
                          <div className="text-gray-500 font-medium">No logs for this date.</div>
                          <div className="text-xs text-gray-400 mt-1">Try selecting a different date.</div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      dailyLogs.map((log, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="whitespace-nowrap">{format(new Date(log.scanned_at), 'hh:mm a')}</TableCell>
                          <TableCell className="font-medium">{log.student.full_name}</TableCell>
                          <TableCell className="whitespace-nowrap">{log.student.sections.grade_level} {log.student.sections.name}</TableCell>
                          <TableCell>{renderBadge(log.status)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Section</TableHead>
                      {weeklyHeaders.map(day => (
                        <TableHead key={day.toISOString()} className="text-center whitespace-nowrap">
                          {format(day, 'EEE MM/dd')}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center">
                          <div className="text-3xl mb-2">📅</div>
                          <div className="text-gray-500 font-medium">No scans recorded this week.</div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      weeklyData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium whitespace-nowrap">{row.name}</TableCell>
                          <TableCell className="text-sm text-gray-500 whitespace-nowrap">{row.section}</TableCell>
                          {weeklyHeaders.map(day => {
                            const dateKey = format(day, 'yyyy-MM-dd')
                            return (
                              <TableCell key={dateKey} className="text-center">
                                {renderBadge(row.logs[dateKey])}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <p className="text-sm text-gray-500">Research-ready CSV with arrival times and window types.</p>
                <Button onClick={handleExportCsv} variant="outline">
                  ↓ Download CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead className="text-center text-green-700">Present</TableHead>
                      <TableHead className="text-center text-yellow-700">Late</TableHead>
                      <TableHead className="text-center text-red-700">Absent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-12 text-center">
                          <div className="text-3xl mb-2">📊</div>
                          <div className="text-gray-500 font-medium">No attendance data to aggregate yet.</div>
                          <div className="text-xs text-gray-400 mt-1">Logs will appear once students start scanning in.</div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      monthlyData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>{row.section}</TableCell>
                          <TableCell className="text-center font-bold text-green-700">{row.present}</TableCell>
                          <TableCell className="text-center font-bold text-yellow-700">{row.late}</TableCell>
                          <TableCell className="text-center font-bold text-red-700">{row.absent}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
