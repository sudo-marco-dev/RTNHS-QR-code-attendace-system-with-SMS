import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { useAuth } from '../../context/AuthContext'

interface Assignment {
  id: string
  time_slot: string
  days_of_week: string[]
  subject: { name: string, code: string }
  section: { name: string, grade_level: string }
}

export default function ScheduleCards() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSchedules = async () => {
      if (!user) return
      
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select(`
          id, time_slot, days_of_week,
          subject:subjects!subject_id(name, code),
          section:sections!section_id(name, grade_level)
        `)
        // The RLS policy inherently restricts this, but adding eq is good practice.
        .eq('teacher_id', user.id)

      if (data && !error) {
        setAssignments(data as any)
      }
      setLoading(false)
    }

    fetchSchedules()
  }, [user])

  if (loading) return <div>Loading schedules...</div>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">My Schedules</h2>
      
      {assignments.length === 0 ? (
        <div className="p-8 text-center bg-gray-50 rounded-lg text-gray-500">
          No schedules assigned to you yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map(a => (
            <Card key={a.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="bg-blue-50/50 pb-4 border-b">
                <CardTitle className="flex justify-between items-center text-lg">
                  <span className="font-bold text-blue-900">{a.subject?.code}</span>
                  <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                    {a.section?.grade_level} - {a.section?.name}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <div className="text-sm text-gray-500 font-medium">Subject</div>
                  <div className="font-medium text-gray-900">{a.subject?.name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 font-medium">Time Slot</div>
                  <div className="font-medium text-gray-900">{a.time_slot}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 font-medium mb-1">Days</div>
                  <div className="flex flex-wrap gap-1">
                    {a.days_of_week.map(day => (
                      <span key={day} className="text-xs px-2 py-1 bg-gray-100 border rounded text-gray-700">
                        {day.substring(0, 3)}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
