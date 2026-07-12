import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Card, CardContent } from '../ui/Card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table'
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
    
    const { error: insertError } = await supabase.from('subjects').insert({
      name,
      code
    })

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Subjects Overview</h2>
        <Button onClick={() => setIsAddOpen(true)}>Add Subject</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject Code</TableHead>
                <TableHead>Subject Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-gray-500">No subjects found.</TableCell>
                </TableRow>
              ) : (
                subjects.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.code}</TableCell>
                    <TableCell>{sub.name}</TableCell>
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
            <DialogTitle>Add New Subject</DialogTitle>
          </DialogHeader>
          {error && <div className="p-3 text-sm text-red-600 bg-red-100 rounded">{error}</div>}
          <form onSubmit={handleAddSubject} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Subject Name</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" />
            </div>
            <div>
              <label className="block text-sm font-medium">Subject Code</label>
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
