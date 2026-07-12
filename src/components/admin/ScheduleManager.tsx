import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'

import { Card, CardContent } from '../ui/Card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'
import { Select } from '../ui/Select'

interface Assignment {
  id: string
  time_slot: string
  days_of_week: string[]
  teacher: { full_name: string }
  subject: { name: string, code: string }
  section: { name: string, grade_level: string }
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const TIME_OPTIONS = [
  "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", 
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "12:00 PM", 
  "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", 
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM"
]

export default function ScheduleManager() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // Lookup data
  const [teachers, setTeachers] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])

  // Form State
  const [teacherId, setTeacherId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    // Fetch assignments with joined data
    const { data: assignData } = await supabase
      .from('teacher_assignments')
      .select(`
        id, time_slot, days_of_week,
        teacher:profiles!teacher_id(full_name),
        subject:subjects!subject_id(name, code),
        section:sections!section_id(name, grade_level)
      `)
    if (assignData) setAssignments(assignData as any)

    // Fetch lookups
    const [tRes, subRes, secRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'teacher'),
      supabase.from('subjects').select('id, name, code'),
      supabase.from('sections').select('id, name, grade_level')
    ])
    
    if (tRes.data) setTeachers(tRes.data)
    if (subRes.data) setSubjects(subRes.data)
    if (secRes.data) setSections(secRes.data)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleToggleDay = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedDays.length === 0) {
      setError('Please select at least one day of the week.')
      return
    }
    
    const startIndex = TIME_OPTIONS.indexOf(startTime)
    const endIndex = TIME_OPTIONS.indexOf(endTime)
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      setError('End Time must be later than Start Time.')
      return
    }

    setLoading(true)
    setError(null)
    
    const { error: insertError } = await supabase.from('teacher_assignments').insert({
      teacher_id: teacherId,
      subject_id: subjectId,
      section_id: sectionId,
      time_slot: `${startTime} - ${endTime}`,
      days_of_week: selectedDays
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setIsAddOpen(false)
      setTeacherId('')
      setSubjectId('')
      setSectionId('')
      setStartTime('')
      setEndTime('')
      setSelectedDays([])
      fetchData()
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Schedule & Assignments</h2>
        <Button onClick={() => setIsAddOpen(true)}>Create Assignment</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Time Slot</TableHead>
                <TableHead>Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-gray-500">No schedules assigned.</TableCell>
                </TableRow>
              ) : (
                assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.teacher?.full_name}</TableCell>
                    <TableCell>{a.subject?.code} - {a.subject?.name}</TableCell>
                    <TableCell>{a.section?.grade_level} {a.section?.name}</TableCell>
                    <TableCell>{a.time_slot}</TableCell>
                    <TableCell>{a.days_of_week.join(', ')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Schedule Assignment</DialogTitle>
          </DialogHeader>
          {error && <div className="p-3 text-sm text-red-600 bg-red-100 rounded">{error}</div>}
          <form onSubmit={handleAddAssignment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Teacher</label>
              <Select required value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="" disabled>Select a teacher...</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium">Subject</label>
              <Select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="" disabled>Select a subject...</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium">Section</label>
              <Select required value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="" disabled>Select a section...</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.grade_level} - {s.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Start Time</label>
                <Select required value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                  <option value="" disabled>Select start time...</option>
                  {TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium">End Time</label>
                <Select required value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                  <option value="" disabled>Select end time...</option>
                  {TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium">Days of Week</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(day => (
                  <label key={day} className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      checked={selectedDays.includes(day)}
                      onChange={() => handleToggleDay(day)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">{day}</span>
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
