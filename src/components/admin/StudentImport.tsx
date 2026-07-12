import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table'
import { Select } from '../ui/Select'

interface Section {
  id: string
  name: string
  grade_level: string
}

interface ParsedStudent {
  full_name: string
  lrn: string
  parent_phone: string
}

export default function StudentImport() {
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState('')
  const [parsedData, setParsedData] = useState<ParsedStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ message: string, type: 'info' | 'success' | 'error' } | null>(null)

  useEffect(() => {
    const fetchSections = async () => {
      const { data } = await supabase.from('sections').select('id, name, grade_level').order('grade_level')
      if (data) setSections(data)
    }
    fetchSections()
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[]
        const validRows: ParsedStudent[] = rows.map(row => ({
          full_name: row.full_name || '',
          lrn: row.lrn || '',
          parent_phone: row.parent_phone || ''
        })).filter(row => row.full_name && row.lrn) // basic validation
        
        setParsedData(validRows)
        setStatus({ message: `Successfully parsed ${validRows.length} rows.`, type: 'info' })
      },
      error: (error) => {
        setStatus({ message: `Error parsing CSV: ${error.message}`, type: 'error' })
      }
    })
  }

  const handleImport = async () => {
    if (!selectedSection) {
      setStatus({ message: 'Please select a section first.', type: 'error' })
      return
    }
    
    if (parsedData.length === 0) return

    setLoading(true)
    setStatus({ message: 'Importing records...', type: 'info' })

    // Generate UUIDs for qr_code based on browser crypto API (v4 UUID)
    const recordsToInsert = parsedData.map(student => ({
      section_id: selectedSection,
      full_name: student.full_name,
      lrn: student.lrn,
      parent_phone: student.parent_phone,
      qr_code: crypto.randomUUID()
    }))

    const { error } = await supabase.from('students').insert(recordsToInsert)

    if (error) {
      setStatus({ message: `Import failed: ${error.message}`, type: 'error' })
    } else {
      setStatus({ message: `Successfully imported ${recordsToInsert.length} students!`, type: 'success' })
      setParsedData([]) // clear on success
    }
    
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Student Roster Batch Import</h2>
      
      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="block mb-2 text-sm font-medium">1. Select Target Section</label>
              <Select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
                <option value="" disabled>Select a section...</option>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>{s.grade_level} - {s.name}</option>
                ))}
              </Select>
            </div>
            
            <div>
              <label className="block mb-2 text-sm font-medium">2. Upload CSV File</label>
              <input 
                type="file" 
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="mt-1 text-xs text-gray-500">Requires headers: full_name, lrn, parent_phone</p>
            </div>
          </div>

          {status && (
            <div className={`p-4 rounded ${status.type === 'error' ? 'bg-red-100 text-red-700' : status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {status.message}
            </div>
          )}

          {parsedData.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">Preview Data ({parsedData.length} rows)</h3>
                <Button onClick={handleImport} disabled={loading || !selectedSection}>
                  {loading ? 'Processing...' : 'Confirm & Insert'}
                </Button>
              </div>
              <div className="border rounded-md max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Full Name</TableHead>
                      <TableHead>LRN</TableHead>
                      <TableHead>Parent Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{row.full_name}</TableCell>
                        <TableCell>{row.lrn}</TableCell>
                        <TableCell>{row.parent_phone}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
