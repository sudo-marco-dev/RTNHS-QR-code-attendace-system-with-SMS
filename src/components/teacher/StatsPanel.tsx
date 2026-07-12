import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { startOfDay, endOfDay, isWithinInterval } from 'date-fns'



export default function StatsPanel() {
  const [loading, setLoading] = useState(true)
  
  // Metrics
  const [todayStats, setTodayStats] = useState({ present: 0, late: 0, absent: 0 })
  const [globalRate, setGlobalRate] = useState(0)
  const [topAbsentees, setTopAbsentees] = useState<{name: string, section: string, count: number}[]>([])

  useEffect(() => {
    const fetchStats = async () => {
      // Fetch all attendance logs accessible to this teacher (RLS restricted automatically)
      const { data, error } = await supabase
        .from('attendance_logs')
        .select(`
          status, 
          scanned_at, 
          student:students!student_id(
            full_name, 
            sections!section_id(name, grade_level)
          )
        `)

      if (data && !error) {
        const logs = data as any[]
        
        // 1. Today's Overview
        const now = new Date()
        const start = startOfDay(now)
        const end = endOfDay(now)
        
        const todayLogs = logs.filter(log => 
          isWithinInterval(new Date(log.scanned_at), { start, end })
        )
        
        let p = 0, l = 0, a = 0
        todayLogs.forEach(log => {
          if (log.status === 'PRESENT') p++
          if (log.status === 'LATE') l++
          if (log.status === 'ABSENT') a++
        })
        setTodayStats({ present: p, late: l, absent: a })

        // 2. Overall Attendance Rate
        const totalRecords = logs.length
        if (totalRecords > 0) {
          const presentLate = logs.filter(log => log.status === 'PRESENT' || log.status === 'LATE').length
          setGlobalRate(Math.round((presentLate / totalRecords) * 100))
        }

        // 3. Top 5 Absentees
        const absenteeMap: Record<string, {name: string, section: string, count: number}> = {}
        logs.filter(log => log.status === 'ABSENT').forEach(log => {
          const studentName = log.student?.full_name
          const sectionLabel = log.student?.sections ? `${log.student.sections.grade_level} ${log.student.sections.name}` : 'Unknown'
          const key = `${studentName}-${sectionLabel}`
          
          if (!absenteeMap[key]) {
            absenteeMap[key] = { name: studentName, section: sectionLabel, count: 0 }
          }
          absenteeMap[key].count++
        })

        const sortedAbsentees = Object.values(absenteeMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
        
        setTopAbsentees(sortedAbsentees)
      }
      setLoading(false)
    }

    fetchStats()
  }, [])

  if (loading) return <div>Loading dashboard stats...</div>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard Statistics</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-blue-600 text-white border-none shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase opacity-80">Global Attendance Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{globalRate}%</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase">Today's Present</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{todayStats.present}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase">Today's Late</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{todayStats.late}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase">Today's Absent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{todayStats.absent}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Top 5 Absentee Leaderboard (Highest Risk)</CardTitle>
        </CardHeader>
        <CardContent>
          {topAbsentees.length === 0 ? (
            <div className="text-sm text-gray-500">No absences recorded yet!</div>
          ) : (
            <div className="space-y-4">
              {topAbsentees.map((student, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-md bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-8 h-8 font-bold text-red-700 bg-red-100 rounded-full">
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="font-medium">{student.name}</div>
                      <div className="text-xs text-gray-500">{student.section}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-lg font-bold text-red-600">{student.count}</span>
                    <span className="text-xs text-gray-500">absences</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
