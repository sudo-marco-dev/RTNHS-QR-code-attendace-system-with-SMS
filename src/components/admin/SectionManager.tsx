import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Card, CardContent } from '../ui/Card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table'
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
    
    // Check if pin exists
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sections & PINs</h2>
        <Button onClick={() => setIsAddOpen(true)}>Add Section</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grade Level</TableHead>
                <TableHead>Section Name</TableHead>
                <TableHead>Scanner PIN</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-gray-500">No sections found.</TableCell>
                </TableRow>
              ) : (
                sections.map((section) => (
                  <TableRow key={section.id}>
                    <TableCell>{section.grade_level}</TableCell>
                    <TableCell>{section.name}</TableCell>
                    <TableCell className="font-mono">{section.scanner_pin}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm">Edit</Button>
                    </TableCell>
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
            <DialogTitle>Add New Section</DialogTitle>
          </DialogHeader>
          {error && <div className="p-3 text-sm text-red-600 bg-red-100 rounded">{error}</div>}
          <form onSubmit={handleAddSection} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Grade Level</label>
              <Input required value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="e.g. Grade 10" />
            </div>
            <div>
              <label className="block text-sm font-medium">Section Name</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Einstein" />
            </div>
            <div>
              <label className="block text-sm font-medium">Scanner PIN (4 digits)</label>
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
