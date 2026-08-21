import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
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
      <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Dashboard Statistics</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Secondary Stat */}
        <div className="bg-[var(--stat-secondary-bg)] border border-[var(--card-border)] rounded-xl p-3 md:p-4">
          <div className="text-xl md:text-3xl font-medium text-[var(--stat-secondary-num)]">
            {globalRate}%
          </div>
          <div className="text-[10px] md:text-xs text-[var(--stat-secondary-lbl)] mt-1 md:mt-2 leading-tight uppercase">
            Global Rate
          </div>
        </div>
        
        {/* Primary Stat */}
        <div className="bg-[var(--stat-primary-bg)] border border-[rgba(195,216,152,0.25)] rounded-xl p-3 md:p-4">
          <div className="text-xl md:text-3xl font-medium text-[var(--stat-primary-num)]">
            {todayStats.present}
          </div>
          <div className="text-[10px] md:text-xs text-[var(--stat-primary-lbl)] mt-1 md:mt-2 leading-tight uppercase">
            Today's Present
          </div>
        </div>

        {/* Secondary Stat */}
        <div className="bg-[var(--stat-secondary-bg)] border border-[var(--card-border)] rounded-xl p-3 md:p-4">
          <div className="text-xl md:text-3xl font-medium text-[var(--stat-secondary-num)]">
            {todayStats.late}
          </div>
          <div className="text-[10px] md:text-xs text-[var(--stat-secondary-lbl)] mt-1 md:mt-2 leading-tight uppercase">
            Today's Late
          </div>
        </div>

        {/* Secondary Stat */}
        <div className="bg-[var(--stat-secondary-bg)] border border-[var(--card-border)] rounded-xl p-3 md:p-4">
          <div className="text-xl md:text-3xl font-medium text-[var(--stat-secondary-num)]">
            {todayStats.absent}
          </div>
          <div className="text-[10px] md:text-xs text-[var(--stat-secondary-lbl)] mt-1 md:mt-2 leading-tight uppercase">
            Today's Absent
          </div>
        </div>
      </div>

      <div style={{
        background: 'var(--card-bg)',
        border: '0.5px solid var(--card-border)',
        borderRadius: 10,
        overflow: 'hidden',
        marginTop: 24,
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--card-border)' }}>
           <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--page-title)' }}>Top 5 Absentee Leaderboard (Highest Risk)</h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {topAbsentees.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted-text)' }}>No absences recorded yet!</div>
          ) : (
            <div className="space-y-2">
              {topAbsentees.map((student, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  border: '0.5px solid var(--card-border)',
                  borderRadius: 8,
                  background: 'var(--row-alt)',
                }}>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-8 h-8 font-bold text-[var(--danger-text)] bg-[var(--danger)] rounded-full text-xs">
                      #{idx + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--body-text)' }}>{student.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-text)' }}>{student.section}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger-text)' }}>{student.count}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted-text)' }}>absences</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
