import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'

interface Subject {
  id: string
  name: string
  code: string
}

export default function SubjectManager() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editSubject, setEditSubject] = useState<Subject | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Delete State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchSubjects = async () => {
    const { data } = await supabase.from('subjects').select('*').order('name')
    if (data) setSubjects(data)
  }

  useEffect(() => {
    fetchSubjects()
  }, [])

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: insertError } = await supabase.from('subjects').insert({ name, code })

    if (insertError) {
      setError(insertError.message)
    } else {
      setIsAddOpen(false)
      setName('')
      setCode('')
      fetchSubjects()
    }
    setLoading(false)
  }

  const openEdit = (sub: Subject) => {
    setEditSubject(sub)
    setError(null)
    setIsEditOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editSubject) return
    setIsSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('subjects')
      .update({ name: editSubject.name, code: editSubject.code })
      .eq('id', editSubject.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setIsEditOpen(false)
      fetchSubjects()
    }
    setIsSaving(false)
  }

  const openDelete = (sub: Subject) => {
    setSubjectToDelete(sub)
    setIsDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!subjectToDelete) return
    setIsDeleting(true)
    
    const { error: deleteError } = await supabase
      .from('subjects')
      .delete()
      .eq('id', subjectToDelete.id)

    if (deleteError) {
      alert(`Failed to delete: ${deleteError.message}`)
    } else {
      setIsDeleteOpen(false)
      fetchSubjects()
    }
    setIsDeleting(false)
  }

  const COL_TEMPLATE = '1fr 3fr 1fr'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Subjects</h2>
        <Button onClick={() => setIsAddOpen(true)}>Add Subject</Button>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: COL_TEMPLATE, padding: '9px 16px' }}>
          {['Subject Code', 'Subject Name', 'Actions'].map(c => (
            <span key={c} style={{ fontSize: 11, fontWeight: 500, color: 'var(--table-header-text)' }}>{c}</span>
          ))}
        </div>
        {subjects.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted-text)' }}>No subjects found.</div>
        ) : subjects.map((sub, idx) => (
          <div key={sub.id} style={{
            display: 'grid', gridTemplateColumns: COL_TEMPLATE,
            padding: '9px 16px', alignItems: 'center',
            borderTop: '0.5px solid var(--card-border)',
            background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--body-text)' }}>{sub.code}</span>
            <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{sub.name}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(sub)}>Edit</Button>
              <Button variant="outline" size="sm" onClick={() => openDelete(sub)} style={{ borderColor: 'var(--danger-text)', color: 'var(--danger-text)' }}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Subject</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          <form onSubmit={handleAddSubject} className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Subject Name</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Subject Code</label>
              <Input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. MATH101" />
            </div>
            <div className="flex justify-end pt-4 space-x-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Subject'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subject</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          {editSubject && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Subject Name</label>
                <Input required value={editSubject.name} onChange={(e) => setEditSubject({ ...editSubject, name: e.target.value })} placeholder="e.g. Mathematics" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Subject Code</label>
                <Input required value={editSubject.code} onChange={(e) => setEditSubject({ ...editSubject, code: e.target.value })} placeholder="e.g. MATH101" />
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
              Are you sure you want to delete <strong>{subjectToDelete?.name} ({subjectToDelete?.code})</strong>?
            </p>
            <p style={{ fontSize: 13, color: 'var(--danger-text)', marginTop: 8 }}>
              This will remove the subject from all schedules as well. This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={isDeleting} style={{ background: 'var(--danger)', color: 'white', border: 'none' }}>
              {isDeleting ? 'Deleting...' : 'Delete Subject'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
