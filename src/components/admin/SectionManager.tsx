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
            <span><Button variant="outline" size="sm">Edit</Button></span>
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
    </div>
  )
}
