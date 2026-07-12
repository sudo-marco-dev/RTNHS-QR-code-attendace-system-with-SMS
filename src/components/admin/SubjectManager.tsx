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

  const COL_TEMPLATE = '1fr 3fr'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Subjects</h2>
        <Button onClick={() => setIsAddOpen(true)}>Add Subject</Button>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: COL_TEMPLATE, padding: '9px 16px' }}>
          {['Subject Code', 'Subject Name'].map(c => (
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
    </div>
  )
}
