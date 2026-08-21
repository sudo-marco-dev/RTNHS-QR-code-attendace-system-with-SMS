import { useState, useEffect, useMemo } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs'

interface Section {
  id: string
  name: string
  grade_level: string
}

interface ParsedStudent {
  _tempId: string
  full_name: string
  lrn: string
  parent_phone: string
}

export default function StudentImport() {
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState('')
  const [parsedData, setParsedData] = useState<ParsedStudent[]>([])
  const [singleStudent, setSingleStudent] = useState({ full_name: '', lrn: '', parent_phone: '' })
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchSections = async () => {
      const { data } = await supabase.from('sections').select('id, name, grade_level').order('grade_level')
      if (data) setSections(data)
    }
    fetchSections()
  }, [])

  // Normalize a header string for flexible matching
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

  // Map of normalized aliases → canonical field name
  const COLUMN_ALIASES: Record<string, keyof ParsedStudent> = {
    // full_name aliases
    fullname: 'full_name',
    full_name: 'full_name',
    name: 'full_name',
    studentname: 'full_name',
    student: 'full_name',
    studentsname: 'full_name',
    completename: 'full_name',
    // lrn aliases
    lrn: 'full_name', // overridden below
    learnerreferenceNumber: 'full_name', // overridden below
    // parent_phone aliases
    parentphone: 'parent_phone',
    parent_phone: 'parent_phone',
    phone: 'parent_phone',
    phonenumber: 'parent_phone',
    contactnumber: 'parent_phone',
    contact: 'parent_phone',
    parentcontact: 'parent_phone',
    guardianphone: 'parent_phone',
    mobile: 'parent_phone',
    mobilenumber: 'parent_phone',
    cellphone: 'parent_phone',
  }
  // LRN aliases (set separately to avoid object key conflict above)
  COLUMN_ALIASES['lrn'] = 'lrn'
  COLUMN_ALIASES['learnerreferencenumber'] = 'lrn'
  COLUMN_ALIASES['learnerid'] = 'lrn'
  COLUMN_ALIASES['studentid'] = 'lrn'
  COLUMN_ALIASES['idnumber'] = 'lrn'
  COLUMN_ALIASES['id'] = 'lrn'

  const resolveField = (header: string): keyof ParsedStudent | null => {
    return COLUMN_ALIASES[normalize(header)] || null
  }

  const parseRows = (rows: any[]) => {
    if (rows.length === 0) {
      setParsedData([])
      setStatus({ message: 'No data rows found in file.', type: 'error' })
      return
    }

    // Build a mapping from original headers → canonical field names
    const sampleRow = rows[0]
    const headerMap: Record<string, keyof ParsedStudent> = {}
    for (const key of Object.keys(sampleRow)) {
      const field = resolveField(key)
      if (field) headerMap[key] = field
    }

    if (!headerMap || !Object.values(headerMap).includes('full_name')) {
      const foundHeaders = Object.keys(sampleRow).join(', ')
      setStatus({
        message: `Could not find a "name" column. Found headers: ${foundHeaders}. Expected something like: full_name, lrn, parent_phone`,
        type: 'error'
      })
      setParsedData([])
      return
    }

    const validRows: ParsedStudent[] = rows.map(row => {
      const mapped: ParsedStudent = { _tempId: crypto.randomUUID(), full_name: '', lrn: '', parent_phone: '' }
      for (const [originalKey, canonicalField] of Object.entries(headerMap)) {
        const value = String(row[originalKey] ?? '').trim()
        if (value && !(mapped as any)[canonicalField]) {
          (mapped as any)[canonicalField] = value
        }
      }
      return mapped
    }).filter(row => row.full_name)

    setParsedData(validRows)
    setSelectedStudentIds(new Set(validRows.map(r => r._tempId)))
    setStatus({ message: `Successfully parsed ${validRows.length} rows.`, type: 'info' })
  }

  const filteredAndSortedData = useMemo(() => {
    let result = [...parsedData]
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(s => s.full_name.toLowerCase().includes(query) || (s.lrn && s.lrn.toLowerCase().includes(query)))
    }
    result.sort((a, b) => {
      const compare = a.full_name.localeCompare(b.full_name)
      return sortOrder === 'asc' ? compare : -compare
    })
    return result
  }, [parsedData, searchQuery, sortOrder])

  const handleSelectAll = () => setSelectedStudentIds(new Set(filteredAndSortedData.map(s => s._tempId)))
  const handleDeselectAll = () => setSelectedStudentIds(new Set())
  const handleInvertSelection = () => {
    const current = new Set(selectedStudentIds)
    const inverted = new Set<string>()
    filteredAndSortedData.forEach(s => {
      if (!current.has(s._tempId)) inverted.add(s._tempId)
    })
    setSelectedStudentIds(inverted)
  }
  const toggleSelection = (id: string) => {
    const next = new Set(selectedStudentIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedStudentIds(next)
  }

  const processFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => parseRows(results.data as any[]),
        error: (error) => {
          setStatus({ message: `Error parsing CSV: ${error.message}`, type: 'error' })
        }
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
          parseRows(rows)
        } catch (err: any) {
          setStatus({ message: `Error parsing Excel file: ${err.message}`, type: 'error' })
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      setStatus({ message: 'Unsupported file type. Please use .csv, .xlsx, or .xls files.', type: 'error' })
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleImport = async () => {
    if (!selectedSection) {
      setStatus({ message: 'Please select a section first.', type: 'error' })
      return
    }
    const toInsert = parsedData.filter(s => selectedStudentIds.has(s._tempId))
    if (toInsert.length === 0) {
      setStatus({ message: 'No students selected to import.', type: 'error' })
      return
    }

    setLoading(true)
    setStatus({ message: 'Importing records...', type: 'info' })

    const recordsToInsert = toInsert.map(student => ({
      section_id: selectedSection,
      full_name: student.full_name,
      lrn: student.lrn || null,
      parent_phone: student.parent_phone,
      qr_code: crypto.randomUUID()
    }))

    const { error } = await supabase.from('students').insert(recordsToInsert)

    if (error) {
      setStatus({ message: `Import failed: ${error.message}`, type: 'error' })
    } else {
      setStatus({ message: `Successfully imported ${recordsToInsert.length} students!`, type: 'success' })
      setParsedData([])
      setSelectedStudentIds(new Set())
    }
    setLoading(false)
  }

  const handleSingleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSection) {
      setStatus({ message: 'Please select a section first.', type: 'error' })
      return
    }
    if (!singleStudent.full_name) {
      setStatus({ message: 'Full Name is required.', type: 'error' })
      return
    }

    setLoading(true)
    setStatus({ message: 'Adding student...', type: 'info' })

    const { error } = await supabase.from('students').insert({
      section_id: selectedSection,
      full_name: singleStudent.full_name,
      lrn: singleStudent.lrn || null,
      parent_phone: singleStudent.parent_phone,
      qr_code: crypto.randomUUID()
    })

    if (error) {
      setStatus({ message: `Failed to add student: ${error.message}`, type: 'error' })
    } else {
      setStatus({ message: `Successfully added ${singleStudent.full_name}!`, type: 'success' })
      setSingleStudent({ full_name: '', lrn: '', parent_phone: '' })
    }
    setLoading(false)
  }

  const statusColors = {
    error:   { color: 'var(--danger-text)', background: 'var(--danger)' },
    success: { color: '#c3d898', background: '#04471c' },
    info:    { color: 'var(--body-text)', background: 'var(--card-bg)', border: '0.5px solid var(--card-border)' },
  }

  const PREVIEW_COL = '40px 2fr 1fr 1fr'

  return (
    <div className="space-y-6">
      <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Student Roster Management</h2>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, padding: '20px' }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>
            1. Select Target Section
          </label>
          <Select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
            <option value="" disabled>Select a section...</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.grade_level} - {s.name}</option>
            ))}
          </Select>
        </div>

        <Tabs defaultValue="single">
          <TabsList className="mb-4">
            <TabsTrigger value="single">Single Entry</TabsTrigger>
            <TabsTrigger value="batch">Batch CSV Import</TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <form onSubmit={handleSingleImport} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>Full Name</label>
                <input
                  type="text"
                  placeholder="Dela Cruz, Juan M."
                  value={singleStudent.full_name}
                  onChange={e => setSingleStudent(prev => ({ ...prev, full_name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  style={{ background: 'var(--input-bg)', color: 'var(--body-text)', borderColor: 'var(--input-border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>LRN <span style={{ color: 'var(--muted-text)', fontWeight: 400 }}>(Optional)</span></label>
                <input
                  type="text"
                  placeholder="123456789012"
                  value={singleStudent.lrn}
                  onChange={e => setSingleStudent(prev => ({ ...prev, lrn: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  style={{ background: 'var(--input-bg)', color: 'var(--body-text)', borderColor: 'var(--input-border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>Parent Phone (Optional)</label>
                <input
                  type="text"
                  placeholder="+639..."
                  value={singleStudent.parent_phone}
                  onChange={e => setSingleStudent(prev => ({ ...prev, parent_phone: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  style={{ background: 'var(--input-bg)', color: 'var(--body-text)', borderColor: 'var(--input-border)' }}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={loading || !selectedSection} className="w-full">
                  {loading ? 'Adding...' : 'Add Student'}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="batch">
            <div className="mt-2">
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>
                Upload File (.csv, .xlsx, .xls)
              </label>
              
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: isDragging ? '2px dashed var(--accent)' : '2px dashed var(--card-border)',
                  backgroundColor: isDragging ? 'var(--row-hover)' : 'transparent',
                  padding: '32px 20px',
                  textAlign: 'center',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    opacity: 0, cursor: 'pointer'
                  }}
                />
                <div style={{ pointerEvents: 'none' }}>
                  <svg className="w-8 h-8 mx-auto mb-3" style={{ color: isDragging ? 'var(--accent)' : 'var(--muted-text)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p style={{ fontSize: 14, fontWeight: 500, color: isDragging ? 'var(--accent)' : 'var(--body-text)' }}>
                    {isDragging ? 'Drop file here' : 'Drag & drop your file here, or click to browse'}
                  </p>
                  <p style={{ marginTop: 8, fontSize: 11, color: 'var(--muted-text)' }}>
                    Needs a column for student name (e.g. "Full Name", "Name"). LRN and Phone columns are auto-detected if present.
                  </p>
                </div>
              </div>
            </div>

            {parsedData.length > 0 && (
              <div className="space-y-4" style={{ marginTop: 20 }}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--page-title)' }}>
                    Preview ({filteredAndSortedData.length} rows)
                  </h3>
                  <div className="flex items-center gap-3">
                    {!selectedSection && (
                      <span style={{ fontSize: 12, color: 'var(--danger-text)' }}>⚠ Select a section above</span>
                    )}
                    <Button onClick={handleImport} disabled={loading || !selectedSection || selectedStudentIds.size === 0}>
                      {loading ? 'Processing...' : `Confirm & Insert (${selectedStudentIds.size})`}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
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

                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-y-auto max-h-[384px]">
                  {/* Desktop Header */}
                  <div className="hidden md:grid grid-cols-[40px_2fr_1fr_1fr] px-4 py-3 bg-[var(--table-header-bg)] border-b border-[var(--card-border)]">
                    {['', 'Full Name', 'LRN', 'Parent Phone'].map((c, i) => (
                      <span key={i} className="text-xs font-medium text-[var(--table-header-text)]">{c}</span>
                    ))}
                  </div>

                  <div className="flex flex-col">
                    {filteredAndSortedData.map((row, idx) => {
                      const isSelected = selectedStudentIds.has(row._tempId)
                      return (
                        <div key={row._tempId}
                          onClick={() => toggleSelection(row._tempId)}
                          className={`flex items-start md:grid md:grid-cols-[40px_2fr_1fr_1fr] md:items-center px-4 py-3 border-b border-[var(--card-border)] cursor-pointer transition-colors ${
                            isSelected ? 'bg-[var(--row-hover)]' : (idx % 2 === 1 ? 'bg-[var(--row-alt)]' : 'bg-transparent')
                          }`}
                        >
                          {/* Checkbox */}
                          <div className="flex-shrink-0 pt-0.5 md:pt-0" onClick={e => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelection(row._tempId)}
                              className="w-[18px] h-[18px] md:w-4 md:h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </div>

                          {/* Content Stack on Mobile / Grid on Desktop */}
                          <div className="ml-3 md:ml-0 flex flex-col md:contents flex-1 min-w-0">
                            {/* Primary Info */}
                            <span className="text-[14px] md:text-xs font-medium text-[var(--body-text)] truncate">
                              <span className="text-[var(--muted-text)] mr-1.5">{idx + 1}.</span> 
                              {row.full_name}
                            </span>

                            {/* Secondary Info */}
                            <div className="flex flex-wrap md:contents gap-x-3 gap-y-1 mt-1 md:mt-0 text-[13px] md:text-xs">
                              <span className="text-[var(--body-text)]">
                                <span className="md:hidden text-[var(--muted-text)] mr-1">LRN:</span>
                                {row.lrn || '-'}
                              </span>
                              <span className="text-[var(--muted-text)]">
                                <span className="md:hidden mr-1">Phone:</span>
                                {row.parent_phone || '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {status && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            ...(statusColors[status.type] as React.CSSProperties)
          }}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  )
}
