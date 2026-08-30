import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'
import { Select } from '../ui/Select'

interface Assignment {
  id: string
  teacher_id: string
  subject_id: string
  section_id: string
  time_slot: string
  days_of_week: string[]
  teacher: { full_name: string }
  subject: { name: string; code: string }
  section: { name: string; grade_level: string }
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const to12Hour = (time24: string) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  let h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  return `${h}:${minutes} ${ampm}`;
};

const to24Hour = (time12: string) => {
  if (!time12) return '';
  const match = time12.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return '';
  let [_, hStr, m, ampm] = match;
  let h = parseInt(hStr, 10);
  if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
  if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m}`;
};

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

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editData, setEditData] = useState<{id:string, teacherId:string, subjectId:string, sectionId:string, startTime:string, endTime:string, selectedDays:string[]}|null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Delete State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [assignmentToDelete, setAssignmentToDelete] = useState<Assignment | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchData = async () => {
    const { data: assignData } = await supabase
      .from('teacher_assignments')
      .select(`
        id, time_slot, days_of_week, teacher_id, subject_id, section_id,
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

    if (!startTime || !endTime) {
      setError('Please select both Start Time and End Time.'); return
    }
    if (startTime >= endTime) {
      setError('End Time must be later than Start Time.'); return
    }

    setLoading(true)
    setError(null)

    const { error: insertError } = await supabase.from('teacher_assignments').insert({
      teacher_id: teacherId, subject_id: subjectId, section_id: sectionId,
      time_slot: `${to12Hour(startTime)} - ${to12Hour(endTime)}`, days_of_week: selectedDays
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

  const openEdit = (a: Assignment) => {
    const times = a.time_slot.split(' - ')
    setEditData({
      id: a.id,
      teacherId: a.teacher_id,
      subjectId: a.subject_id,
      sectionId: a.section_id,
      startTime: to24Hour(times[0] || ''),
      endTime: to24Hour(times[1] || ''),
      selectedDays: a.days_of_week
    })
    setError(null)
    setIsEditOpen(true)
  }

  const handleEditToggleDay = (day: string) => {
    if (!editData) return
    setEditData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        selectedDays: prev.selectedDays.includes(day) 
          ? prev.selectedDays.filter(d => d !== day) 
          : [...prev.selectedDays, day]
      }
    })
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editData) return
    if (editData.selectedDays.length === 0) { setError('Please select at least one day.'); return }

    if (!editData.startTime || !editData.endTime) {
      setError('Please select both Start Time and End Time.'); return
    }
    if (editData.startTime >= editData.endTime) {
      setError('End Time must be later than Start Time.'); return
    }

    setIsSaving(true)
    setError(null)

    const { error: updateError } = await supabase.from('teacher_assignments').update({
      teacher_id: editData.teacherId, subject_id: editData.subjectId, section_id: editData.sectionId,
      time_slot: `${to12Hour(editData.startTime)} - ${to12Hour(editData.endTime)}`, days_of_week: editData.selectedDays
    }).eq('id', editData.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setIsEditOpen(false)
      fetchData()
    }
    setIsSaving(false)
  }

  const openDelete = (a: Assignment) => {
    setAssignmentToDelete(a)
    setIsDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!assignmentToDelete) return
    setIsDeleting(true)
    
    const { error: deleteError } = await supabase
      .from('teacher_assignments')
      .delete()
      .eq('id', assignmentToDelete.id)

    if (deleteError) {
      alert(`Failed to delete: ${deleteError.message}`)
    } else {
      setIsDeleteOpen(false)
      fetchData()
    }
    setIsDeleting(false)
  }



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Schedule &amp; Assignments</h2>
        <Button onClick={() => setIsAddOpen(true)}>Create Assignment</Button>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden mt-4">
        {/* Desktop Header */}
        <div className="hidden md:grid md:grid-cols-[2fr_2fr_1.5fr_2fr_2fr_1fr] px-4 py-3 bg-[var(--table-header-bg)] border-b border-[var(--card-border)]">
          {['Teacher', 'Subject', 'Section', 'Time Slot', 'Days', 'Actions'].map(c => (
            <span key={c} className="text-xs font-medium text-[var(--table-header-text)]">{c}</span>
          ))}
        </div>
        
        {assignments.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--muted-text)]">No schedules assigned.</div>
        ) : (
          <div className="flex flex-col">
            {assignments.map((a, idx) => (
              <div key={a.id} className="flex flex-col md:grid md:grid-cols-[2fr_2fr_1.5fr_2fr_2fr_1fr] md:items-center px-4 py-4 md:py-3 border-b border-[var(--card-border)] hover:bg-[var(--row-hover)] transition-colors">
                
                {/* Content Stack on Mobile / Grid on Desktop */}
                <div className="flex flex-col md:contents flex-1 min-w-0 mb-3 md:mb-0">
                  <span className="text-[14px] md:text-sm font-medium text-[var(--body-text)]">
                    <span className="md:hidden text-[var(--muted-text)] mr-1.5">{idx + 1}.</span> 
                    {a.teacher?.full_name}
                  </span>
                  
                  <span className="text-[14px] md:text-sm text-[var(--body-text)] mt-1 md:mt-0">
                    {a.subject?.code} - {a.subject?.name}
                  </span>
                  
                  <span className="text-[14px] md:text-sm text-[var(--body-text)] mt-1 md:mt-0">
                    <span className="md:hidden text-[var(--muted-text)] mr-1">Sec:</span>
                    {a.section?.grade_level} {a.section?.name}
                  </span>
                  
                  <span className="text-[13px] md:text-sm text-[var(--body-text)] mt-1 md:mt-0">
                    <span className="md:hidden text-[var(--muted-text)] mr-1">Time:</span>
                    {a.time_slot}
                  </span>

                  <span className="text-[12px] md:text-xs text-[var(--muted-text)] mt-1 md:mt-0">
                    {a.days_of_week.join(', ')}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2 md:mt-0">
                  <Button variant="outline" size="sm" onClick={() => openEdit(a)} className="flex-1 md:flex-auto min-h-[44px] md:min-h-[32px]">Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => openDelete(a)} className="flex-1 md:flex-auto min-h-[44px] md:min-h-[32px] border-[var(--danger-text)] text-[var(--danger-text)]">Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
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
                <input 
                  type="time" 
                  required 
                  value={startTime} 
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>End Time</label>
                <input 
                  type="time" 
                  required 
                  value={endTime} 
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
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
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Schedule Assignment</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          {editData && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Teacher</label>
                <Select required value={editData.teacherId} onChange={(e) => setEditData({ ...editData, teacherId: e.target.value })}>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Subject</label>
                <Select required value={editData.subjectId} onChange={(e) => setEditData({ ...editData, subjectId: e.target.value })}>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Section</label>
                <Select required value={editData.sectionId} onChange={(e) => setEditData({ ...editData, sectionId: e.target.value })}>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.grade_level} - {s.name}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Start Time</label>
                  <input 
                    type="time" 
                    required 
                    value={editData.startTime} 
                    onChange={(e) => setEditData({ ...editData, startTime: e.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>End Time</label>
                  <input 
                    type="time" 
                    required 
                    value={editData.endTime} 
                    onChange={(e) => setEditData({ ...editData, endTime: e.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>Days of Week</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => (
                    <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--body-text)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editData.selectedDays.includes(day)}
                        onChange={() => handleEditToggleDay(day)}
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end pt-4 space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p style={{ fontSize: 14, color: 'var(--body-text)' }}>
              Are you sure you want to delete the schedule for <strong>{assignmentToDelete?.teacher.full_name}</strong> in <strong>{assignmentToDelete?.section.grade_level} {assignmentToDelete?.section.name}</strong>?
            </p>
            <p style={{ fontSize: 13, color: 'var(--danger-text)', marginTop: 8 }}>
              This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={isDeleting} style={{ background: 'var(--danger)', color: 'white', border: 'none' }}>
              {isDeleting ? 'Deleting...' : 'Delete Assignment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
