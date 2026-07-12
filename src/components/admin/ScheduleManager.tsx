import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'
import { Select } from '../ui/Select'

interface Assignment {
  id: string
  time_slot: string
  days_of_week: string[]
  teacher: { full_name: string }
  subject: { name: string; code: string }
  section: { name: string; grade_level: string }
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const TIME_OPTIONS = [
  '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
  '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM'
]

export default function ScheduleManager() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [teachers, setTeachers] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])

  const [teacherId, setTeacherId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    const { data: assignData } = await supabase
      .from('teacher_assignments')
      .select(`
        id, time_slot, days_of_week,
        teacher:profiles!teacher_id(full_name),
        subject:subjects!subject_id(name, code),
        section:sections!section_id(name, grade_level)
      `)
    if (assignData) setAssignments(assignData as any)

    const [tRes, subRes, secRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'teacher'),
      supabase.from('subjects').select('id, name, code'),
      supabase.from('sections').select('id, name, grade_level')
    ])
    if (tRes.data) setTeachers(tRes.data)
    if (subRes.data) setSubjects(subRes.data)
    if (secRes.data) setSections(secRes.data)
  }

  useEffect(() => { fetchData() }, [])

  const handleToggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedDays.length === 0) { setError('Please select at least one day of the week.'); return }

    const startIndex = TIME_OPTIONS.indexOf(startTime)
    const endIndex = TIME_OPTIONS.indexOf(endTime)
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      setError('End Time must be later than Start Time.'); return
    }

    setLoading(true)
    setError(null)

    const { error: insertError } = await supabase.from('teacher_assignments').insert({
      teacher_id: teacherId, subject_id: subjectId, section_id: sectionId,
      time_slot: `${startTime} - ${endTime}`, days_of_week: selectedDays
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setIsAddOpen(false)
      setTeacherId(''); setSubjectId(''); setSectionId('')
      setStartTime(''); setEndTime(''); setSelectedDays([])
      fetchData()
    }
    setLoading(false)
  }

  const COL_TEMPLATE = '2fr 2fr 1.5fr 2fr 2fr'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Schedule &amp; Assignments</h2>
        <Button onClick={() => setIsAddOpen(true)}>Create Assignment</Button>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: COL_TEMPLATE, padding: '9px 16px' }}>
          {['Teacher', 'Subject', 'Section', 'Time Slot', 'Days'].map(c => (
            <span key={c} style={{ fontSize: 11, fontWeight: 500, color: 'var(--table-header-text)' }}>{c}</span>
          ))}
        </div>
        {assignments.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted-text)' }}>No schedules assigned.</div>
        ) : assignments.map((a, idx) => (
          <div key={a.id} style={{
            display: 'grid', gridTemplateColumns: COL_TEMPLATE,
            padding: '9px 16px', alignItems: 'center',
            borderTop: '0.5px solid var(--card-border)',
            background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--body-text)' }}>{a.teacher?.full_name}</span>
            <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{a.subject?.code} - {a.subject?.name}</span>
            <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{a.section?.grade_level} {a.section?.name}</span>
            <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{a.time_slot}</span>
            <span style={{ fontSize: 11, color: 'var(--muted-text)' }}>{a.days_of_week.join(', ')}</span>
          </div>
        ))}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Schedule Assignment</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          <form onSubmit={handleAddAssignment} className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Teacher</label>
              <Select required value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="" disabled>Select a teacher...</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Subject</label>
              <Select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="" disabled>Select a subject...</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Section</label>
              <Select required value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="" disabled>Select a section...</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.grade_level} - {s.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Start Time</label>
                <Select required value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                  <option value="" disabled>Select start time...</option>
                  {TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>End Time</label>
                <Select required value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                  <option value="" disabled>Select end time...</option>
                  {TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>Days of Week</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(day => (
                  <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--body-text)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day)}
                      onChange={() => handleToggleDay(day)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-4 space-x-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Assignment'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
