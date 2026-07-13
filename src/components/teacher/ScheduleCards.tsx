import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

interface Assignment {
  id: string
  time_slot: string
  days_of_week: string[]
  subject: { name: string; code: string }
  section: { name: string; grade_level: string }
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
        .eq('teacher_id', user.id)

      if (data && !error) setAssignments(data as any)
      setLoading(false)
    }
    fetchSchedules()
  }, [user])

  if (loading) return (
    <div style={{ fontSize: 13, color: 'var(--muted-text)', padding: '24px' }}>
      Loading schedules...
    </div>
  )

  return (
    <div className="space-y-6">
      <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>My Schedules</h2>

      {assignments.length === 0 ? (
        <div style={{
          padding: '32px', textAlign: 'center', borderRadius: 10,
          fontSize: 13, color: 'var(--muted-text)',
          background: 'var(--row-alt)', border: '0.5px solid var(--card-border)',
        }}>
          No schedules assigned to you yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map(a => (
            <div key={a.id} style={{
              background: 'var(--card-bg)',
              border: '0.5px solid var(--card-border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{
                background: 'var(--stat-primary-bg)',
                padding: '12px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--stat-primary-num)' }}>
                  {a.subject?.code}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 500, padding: '3px 10px',
                  background: 'rgba(195,216,152,0.18)',
                  color: 'var(--stat-primary-num)',
                  borderRadius: 20,
                  border: '0.5px solid rgba(195,216,152,0.3)',
                }}>
                  {a.section?.grade_level} - {a.section?.name}
                </span>
              </div>

              {/* Card body */}
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subject</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--body-text)', marginTop: 2 }}>{a.subject?.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time Slot</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--body-text)', marginTop: 2 }}>{a.time_slot}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Days</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {a.days_of_week.map(day => (
                      <span key={day} style={{
                        fontSize: 11, padding: '2px 8px',
                        background: 'var(--row-alt)',
                        border: '0.5px solid var(--card-border)',
                        borderRadius: 5,
                        color: 'var(--body-text)',
                      }}>
                        {day.substring(0, 3)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
