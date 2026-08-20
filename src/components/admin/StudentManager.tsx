import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'

interface Student {
  id: string
  full_name: string
  lrn: string | null
  parent_phone: string | null
  qr_code: string
  section_id: string
}

export default function StudentManager() {
  const [sections, setSections] = useState<any[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  
  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Delete State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const fetchSections = async () => {
      const { data } = await supabase.from('sections').select('id, name, grade_level').order('grade_level')
      if (data) setSections(data)
    }
    fetchSections()
  }, [])

  const fetchStudents = async () => {
    if (!selectedSectionId) return
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('section_id', selectedSectionId)
      .order('full_name')
    if (data) setStudents(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchStudents()
  }, [selectedSectionId])

  const openEdit = (student: Student) => {
    setEditStudent(student)
    setError(null)
    setIsEditOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editStudent) return
    if (!editStudent.full_name) {
      setError('Full Name is required.')
      return
    }

    setIsSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('students')
      .update({
        full_name: editStudent.full_name,
        lrn: editStudent.lrn || null,
        parent_phone: editStudent.parent_phone || null
      })
      .eq('id', editStudent.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setIsEditOpen(false)
      fetchStudents()
    }
    setIsSaving(false)
  }

  const openDelete = (student: Student) => {
    setStudentToDelete(student)
    setIsDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!studentToDelete) return
    setIsDeleting(true)
    
    const { error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentToDelete.id)

    if (deleteError) {
      alert(`Failed to delete: ${deleteError.message}`)
    } else {
      setIsDeleteOpen(false)
      fetchStudents()
    }
    setIsDeleting(false)
  }

  const COL_TEMPLATE = '2fr 2fr 2fr 1fr'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Student Roster Management</h2>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, padding: '20px' }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>
            Select Section to View/Manage
          </label>
          <Select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)}>
            <option value="" disabled>Select a section...</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.grade_level} - {s.name}</option>
            ))}
          </Select>
        </div>

        {selectedSectionId && (
          <div style={{ overflow: 'hidden', border: '0.5px solid var(--card-border)', borderRadius: 8 }}>
            <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: COL_TEMPLATE, padding: '9px 16px' }}>
              {['Full Name', 'LRN', 'Parent Phone', 'Actions'].map(c => (
                <span key={c} style={{ fontSize: 11, fontWeight: 500, color: 'var(--table-header-text)' }}>{c}</span>
              ))}
            </div>
            
            {loading ? (
              <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted-text)' }}>Loading roster...</div>
            ) : students.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted-text)' }}>No students found in this section.</div>
            ) : (
              students.map((student, idx) => (
                <div key={student.id} style={{
                  display: 'grid', gridTemplateColumns: COL_TEMPLATE,
                  padding: '9px 16px', alignItems: 'center',
                  borderTop: '0.5px solid var(--card-border)',
                  background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--body-text)' }}>{student.full_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{student.lrn || '-'}</span>
                  <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{student.parent_phone || '-'}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(student)}>Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => openDelete(student)} style={{ borderColor: 'var(--danger-text)', color: 'var(--danger-text)' }}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          {editStudent && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Full Name</label>
                <Input required value={editStudent.full_name} onChange={(e) => setEditStudent({ ...editStudent, full_name: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>LRN (Optional)</label>
                <Input value={editStudent.lrn || ''} onChange={(e) => setEditStudent({ ...editStudent, lrn: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Parent Phone (Optional)</label>
                <Input value={editStudent.parent_phone || ''} onChange={(e) => setEditStudent({ ...editStudent, parent_phone: e.target.value })} />
              </div>
              <div className="flex justify-end pt-4 space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p style={{ fontSize: 14, color: 'var(--body-text)' }}>
              Are you sure you want to delete <strong>{studentToDelete?.full_name}</strong>?
            </p>
            <p style={{ fontSize: 13, color: 'var(--danger-text)', marginTop: 8 }}>
              This action cannot be undone. All attendance logs associated with this student will also be deleted if constrained by cascade delete, or might block deletion depending on database setup.
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={isDeleting} style={{ background: 'var(--danger)', color: 'white', border: 'none' }}>
              {isDeleting ? 'Deleting...' : 'Delete Student'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
