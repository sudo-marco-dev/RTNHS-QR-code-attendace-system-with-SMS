import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent } from '../ui/Card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { startOfDay, endOfDay, isWithinInterval, startOfWeek, addDays, format, isSameDay } from 'date-fns'

interface LogEntry {
  status: string
  scanned_at: string
  student: {
    id: string
    full_name: string
    sections: { name: string, grade_level: string }
  }
}

export default function AttendanceGrid() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select(`
          status, 
          scanned_at, 
          student:students!student_id(
            id,
            full_name, 
            sections!section_id(name, grade_level)
          )
        `)
        .order('scanned_at', { ascending: false })

      if (data && !error) {
        setLogs(data as unknown as LogEntry[])
      }
      setLoading(false)
    }

    fetchLogs()
  }, [])

  // 1. Daily View Logic
  const dailyLogs = useMemo(() => {
    if (!selectedDate) return []
    const targetDate = new Date(selectedDate)
    const start = startOfDay(targetDate)
    const end = endOfDay(targetDate)
    
    return logs.filter(log => isWithinInterval(new Date(log.scanned_at), { start, end }))
  }, [logs, selectedDate])

  // 2. Weekly View Logic
  const weeklyHeaders = useMemo(() => {
    const today = new Date()
    const start = startOfWeek(today, { weekStartsOn: 1 }) // Monday
    return Array.from({ length: 5 }).map((_, i) => addDays(start, i))
  }, [])

  const weeklyData = useMemo(() => {
    const studentMap: Record<string, { name: string, section: string, logs: Record<string, string> }> = {}
    
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
      // Check if it matches any of the 5 days
      weeklyHeaders.forEach(day => {
        if (isSameDay(logDate, day)) {
          studentMap[sId].logs[format(day, 'yyyy-MM-dd')] = log.status
        }
      })
    })

    return Object.values(studentMap)
  }, [logs, weeklyHeaders])

  // 3. Monthly Aggregates Logic
  const monthlyData = useMemo(() => {
    const aggMap: Record<string, { name: string, section: string, present: number, late: number, absent: number }> = {}
    logs.forEach(log => {
      const sId = log.student.id
      if (!aggMap[sId]) {
        aggMap[sId] = {
          name: log.student.full_name,
          section: `${log.student.sections.grade_level} ${log.student.sections.name}`,
          present: 0,
          late: 0,
          absent: 0
        }
      }
      if (log.status === 'PRESENT') aggMap[sId].present++
      if (log.status === 'LATE') aggMap[sId].late++
      if (log.status === 'ABSENT') aggMap[sId].absent++
    })
    return Object.values(aggMap).sort((a, b) => a.name.localeCompare(b.name))
  }, [logs])

  const handleExportCsv = () => {
    const headers = ['Student Name', 'Section', 'Present', 'Late', 'Absent']
    const rows = monthlyData.map(r => `"${r.name}","${r.section}",${r.present},${r.late},${r.absent}`)
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "monthly_attendance_aggregates.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const renderBadge = (status: string) => {
    if (status === 'PRESENT') return <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">Present</span>
    if (status === 'LATE') return <span className="px-2 py-1 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full">Late</span>
    if (status === 'ABSENT') return <span className="px-2 py-1 text-xs font-semibold text-red-800 bg-red-100 rounded-full">Absent</span>
    return <span className="text-gray-300">-</span>
  }

  if (loading) return <div>Loading attendance data...</div>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Attendance Analytics</h2>

      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="daily">Daily List</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Grid</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Aggregates</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium">Select Date:</label>
                <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={e => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                />
              </div>
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
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-500">No logs for this date.</TableCell></TableRow>
                  ) : (
                    dailyLogs.map((log, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{format(new Date(log.scanned_at), 'hh:mm a')}</TableCell>
                        <TableCell className="font-medium">{log.student.full_name}</TableCell>
                        <TableCell>{log.student.sections.grade_level} {log.student.sections.name}</TableCell>
                        <TableCell>{renderBadge(log.status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Section</TableHead>
                    {weeklyHeaders.map(day => (
                      <TableHead key={day.toISOString()} className="text-center">
                        {format(day, 'EEE (MM/dd)')}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyData.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-gray-500">No weekly data found.</TableCell></TableRow>
                  ) : (
                    weeklyData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-sm text-gray-500">{row.section}</TableCell>
                        {weeklyHeaders.map(day => {
                          const dateKey = format(day, 'yyyy-MM-dd')
                          const stat = row.logs[dateKey]
                          return (
                            <TableCell key={dateKey} className="text-center">
                              {renderBadge(stat)}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-end">
                <Button onClick={handleExportCsv} variant="outline">
                  Download CSV
                </Button>
              </div>
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
                    <TableRow><TableCell colSpan={5} className="text-center text-gray-500">No data to aggregate.</TableCell></TableRow>
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
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
