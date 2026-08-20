import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'

interface Section {
  id: string
  name: string
  grade_level: string
  scanner_pin: string
}

export default function SectionManager() {
  const [sections, setSections] = useState<Section[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // Form State
  const [name, setName] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editSection, setEditSection] = useState<Section | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Delete State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [sectionToDelete, setSectionToDelete] = useState<Section | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchSections = async () => {
    const { data } = await supabase.from('sections').select('*').order('grade_level')
    if (data) setSections(data)
  }

  useEffect(() => {
    fetchSections()
  }, [])

  const generatePin = () => {
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString()
    setPin(randomPin)
  }

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { count } = await supabase.from('sections').select('id', { count: 'exact', head: true }).eq('scanner_pin', pin)
    if (count && count > 0) {
      setError('This PIN is already in use by another section. Generate a new one.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('sections').insert({
      name,
      grade_level: gradeLevel,
      scanner_pin: pin
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setIsAddOpen(false)
      setName('')
      setGradeLevel('')
      setPin('')
      fetchSections()
    }
    setLoading(false)
  }

  const openEdit = (section: Section) => {
    setEditSection(section)
    setError(null)
    setIsEditOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editSection) return
    setIsSaving(true)
    setError(null)

    // Check if new pin conflicts with another section
    const { data: conflict } = await supabase
      .from('sections')
      .select('id')
      .eq('scanner_pin', editSection.scanner_pin)
      .neq('id', editSection.id)
      .single()

    if (conflict) {
      setError('This PIN is already in use by another section.')
      setIsSaving(false)
      return
    }

    const { error: updateError } = await supabase
      .from('sections')
      .update({
        name: editSection.name,
        grade_level: editSection.grade_level,
        scanner_pin: editSection.scanner_pin
      })
      .eq('id', editSection.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setIsEditOpen(false)
      fetchSections()
    }
    setIsSaving(false)
  }

  const openDelete = (section: Section) => {
    setSectionToDelete(section)
    setIsDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!sectionToDelete) return
    setIsDeleting(true)
    
    const { error: deleteError } = await supabase
      .from('sections')
      .delete()
      .eq('id', sectionToDelete.id)

    if (deleteError) {
      alert(`Failed to delete (students might still be in this section): ${deleteError.message}`)
    } else {
      setIsDeleteOpen(false)
      fetchSections()
    }
    setIsDeleting(false)
  }

  const COL_TEMPLATE = '1fr 2fr 1fr 1fr'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Sections &amp; PINs</h2>
        <Button onClick={() => setIsAddOpen(true)}>Add Section</Button>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: COL_TEMPLATE, padding: '9px 16px' }}>
          {['Grade Level', 'Section Name', 'Scanner PIN', 'Actions'].map(c => (
            <span key={c} style={{ fontSize: 11, fontWeight: 500, color: 'var(--table-header-text)' }}>{c}</span>
          ))}
        </div>
        {sections.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted-text)' }}>No sections found.</div>
        ) : sections.map((section, idx) => (
          <div key={section.id} style={{
            display: 'grid', gridTemplateColumns: COL_TEMPLATE,
            padding: '9px 16px', alignItems: 'center',
            borderTop: '0.5px solid var(--card-border)',
            background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
          }}>
            <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{section.grade_level}</span>
            <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{section.name}</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--body-text)' }}>{section.scanner_pin}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(section)}>Edit</Button>
              <Button variant="outline" size="sm" onClick={() => openDelete(section)} style={{ borderColor: 'var(--danger-text)', color: 'var(--danger-text)' }}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Section</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          <form onSubmit={handleAddSection} className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Grade Level</label>
              <Input required value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="e.g. Grade 10" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Section Name</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Einstein" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Scanner PIN (4 digits)</label>
              <div className="flex space-x-2">
                <Input required value={pin} onChange={(e) => setPin(e.target.value)} pattern="\d{4}" maxLength={4} placeholder="1234" className="font-mono text-center" />
                <Button type="button" variant="secondary" onClick={generatePin}>Generate</Button>
              </div>
            </div>
            <div className="flex justify-end pt-4 space-x-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Section'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          {editSection && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Grade Level</label>
                <Input required value={editSection.grade_level} onChange={(e) => setEditSection({ ...editSection, grade_level: e.target.value })} placeholder="e.g. Grade 10" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Section Name</label>
                <Input required value={editSection.name} onChange={(e) => setEditSection({ ...editSection, name: e.target.value })} placeholder="e.g. Einstein" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Scanner PIN (4 digits)</label>
                <div className="flex space-x-2">
                  <Input required value={editSection.scanner_pin} onChange={(e) => setEditSection({ ...editSection, scanner_pin: e.target.value })} pattern="\d{4}" maxLength={4} className="font-mono text-center" />
                  <Button type="button" variant="secondary" onClick={() => setEditSection({ ...editSection, scanner_pin: Math.floor(1000 + Math.random() * 9000).toString() })}>Generate</Button>
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
              Are you sure you want to delete <strong>{sectionToDelete?.grade_level} - {sectionToDelete?.name}</strong>?
            </p>
            <p style={{ fontSize: 13, color: 'var(--danger-text)', marginTop: 8 }}>
              This may fail if there are still students enrolled in this section. Please delete or move those students first. This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={isDeleting} style={{ background: 'var(--danger)', color: 'white', border: 'none' }}>
              {isDeleting ? 'Deleting...' : 'Delete Section'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
