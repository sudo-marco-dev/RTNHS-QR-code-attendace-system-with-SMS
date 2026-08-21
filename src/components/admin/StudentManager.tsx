import { useState, useEffect, useMemo } from 'react'
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
  
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Delete State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Bulk Delete State
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  const filteredAndSortedStudents = useMemo(() => {
    let result = [...students]
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(s => s.full_name.toLowerCase().includes(query) || (s.lrn && s.lrn.toLowerCase().includes(query)))
    }
    result.sort((a, b) => {
      const compare = a.full_name.localeCompare(b.full_name)
      return sortOrder === 'asc' ? compare : -compare
    })
    return result
  }, [students, searchQuery, sortOrder])

  const handleSelectAll = () => {
    setSelectedStudentIds(new Set(filteredAndSortedStudents.map(s => s.id)))
  }

  const handleDeselectAll = () => {
    setSelectedStudentIds(new Set())
  }

  const handleInvertSelection = () => {
    const current = new Set(selectedStudentIds)
    const inverted = new Set<string>()
    filteredAndSortedStudents.forEach(s => {
      if (!current.has(s.id)) inverted.add(s.id)
    })
    setSelectedStudentIds(inverted)
  }

  const toggleStudentSelection = (id: string) => {
    const next = new Set(selectedStudentIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedStudentIds(next)
  }

  const handleBulkDeleteConfirm = async () => {
    if (selectedStudentIds.size === 0) return
    setIsBulkDeleting(true)
    
    const idsToDelete = Array.from(selectedStudentIds)
    const { error: deleteError } = await supabase
      .from('students')
      .delete()
      .in('id', idsToDelete)

    if (deleteError) {
      alert(`Failed to delete selected students: ${deleteError.message}`)
    } else {
      setIsBulkDeleteOpen(false)
      setSelectedStudentIds(new Set())
      fetchStudents()
    }
    setIsBulkDeleting(false)
  }

  useEffect(() => {
    const fetchSections = async () => {
      const { data } = await supabase.from('sections').select('id, name, grade_level').order('grade_level')
      if (data) setSections(data)
    }
    fetchSections()
  }, [])

  const fetchStudents = async () => {
    if (!selectedSectionId) {
      setStudents([])
      setSelectedStudentIds(new Set())
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('section_id', selectedSectionId)
      .order('full_name')
    if (data) {
      setStudents(data)
      setSelectedStudentIds(new Set())
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Student Roster Management</h2>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, padding: '20px' }}>
        <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>
              Select Section to View/Manage
            </label>
            <div className="flex items-center gap-4">
              <Select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)} className="min-w-[200px]">
                <option value="" disabled>Select a section...</option>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>{s.grade_level} - {s.name}</option>
                ))}
              </Select>
              {selectedStudentIds.size > 0 && (
                <Button 
                  onClick={() => setIsBulkDeleteOpen(true)} 
                  style={{ background: 'var(--danger)', color: 'white', border: 'none', whiteSpace: 'nowrap' }}
                >
                  Delete Selected ({selectedStudentIds.size})
                </Button>
              )}
            </div>
          </div>

          {selectedSectionId && (
            <div className="flex flex-wrap items-center gap-2">
              <Input 
                placeholder="Search name or LRN..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 h-9 text-sm"
              />
              <Button variant="outline" size="sm" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                Sort {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>Select All</Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>Deselect</Button>
              <Button variant="outline" size="sm" onClick={handleInvertSelection}>Invert</Button>
            </div>
          )}
        </div>

        {selectedSectionId && (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl mt-6 overflow-hidden">
            {/* Desktop Header */}
            <div className="hidden md:grid grid-cols-[40px_2fr_2fr_2fr_1fr] px-4 py-3 bg-[var(--table-header-bg)] border-b border-[var(--card-border)]">
              {['', 'Full Name', 'LRN', 'Parent Phone', 'Actions'].map((c, idx) => (
                <span key={idx} className="text-xs font-medium text-[var(--table-header-text)]">{c}</span>
              ))}
            </div>
            
            {loading ? (
              <div className="p-8 text-center text-[13px] text-[var(--muted-text)]">Loading roster...</div>
            ) : filteredAndSortedStudents.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[var(--muted-text)]">No students found matching your criteria.</div>
            ) : (
              <div className="flex flex-col">
                {filteredAndSortedStudents.map((student, idx) => {
                  const isSelected = selectedStudentIds.has(student.id);
                  return (
                    <div key={student.id} 
                      onClick={() => toggleStudentSelection(student.id)}
                      className={`flex flex-col md:grid md:grid-cols-[40px_2fr_2fr_2fr_1fr] md:items-center px-4 py-3 border-b border-[var(--card-border)] cursor-pointer transition-colors ${
                        isSelected ? 'bg-[var(--row-hover)]' : (idx % 2 === 1 ? 'bg-[var(--row-alt)]' : 'bg-transparent')
                      }`}
                    >
                      <div className="flex items-start md:contents w-full">
                        {/* Checkbox */}
                        <div className="flex-shrink-0 pt-0.5 md:pt-0" onClick={e => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleStudentSelection(student.id)}
                            className="w-[18px] h-[18px] md:w-4 md:h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>

                        {/* Content Stack on Mobile / Grid on Desktop */}
                        <div className="ml-3 md:ml-0 flex flex-col md:contents flex-1 min-w-0">
                          {/* Primary Info */}
                          <span className="text-[14px] md:text-xs font-medium text-[var(--body-text)] truncate">
                            <span className="text-[var(--muted-text)] mr-1.5">{idx + 1}.</span> 
                            {student.full_name}
                          </span>

                          {/* Secondary Info */}
                          <div className="flex flex-wrap md:contents gap-x-3 gap-y-1 mt-1 md:mt-0 text-[13px] md:text-xs">
                            <span className="text-[var(--body-text)]">
                              <span className="md:hidden text-[var(--muted-text)] mr-1">LRN:</span>
                              {student.lrn || '-'}
                            </span>
                            <span className="text-[var(--body-text)]">
                              <span className="md:hidden text-[var(--muted-text)] mr-1">Phone:</span>
                              {student.parent_phone || '-'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 md:mt-0 ml-[30px] md:ml-0 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Button variant="outline" size="sm" onClick={() => openEdit(student)} className="md:h-8 min-h-[44px] md:min-h-[32px] flex-1 md:flex-auto">Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => openDelete(student)} className="md:h-8 min-h-[44px] md:min-h-[32px] flex-1 md:flex-auto border-[var(--danger-text)] text-[var(--danger-text)]">
                          Delete
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
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
      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p style={{ fontSize: 14, color: 'var(--body-text)' }}>
              Are you sure you want to delete <strong>{selectedStudentIds.size}</strong> selected student(s)?
            </p>
            <p style={{ fontSize: 13, color: 'var(--danger-text)', marginTop: 8 }}>
              This action cannot be undone. All attendance logs associated with these students will also be deleted.
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsBulkDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkDeleteConfirm} disabled={isBulkDeleting} style={{ background: 'var(--danger)', color: 'white', border: 'none' }}>
              {isBulkDeleting ? 'Deleting...' : `Delete ${selectedStudentIds.size} Students`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
