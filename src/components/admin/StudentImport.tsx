import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
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
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null)

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
        })).filter(row => row.full_name && row.lrn)

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
      setParsedData([])
    }
    setLoading(false)
  }

  const statusColors = {
    error:   { color: 'var(--danger-text)', background: 'var(--danger)' },
    success: { color: '#c3d898', background: '#04471c' },
    info:    { color: 'var(--body-text)', background: 'var(--card-bg)', border: '0.5px solid var(--card-border)' },
  }

  const PREVIEW_COL = '2fr 1fr 1fr'

  return (
    <div className="space-y-6">
      <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Student Roster Batch Import</h2>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, padding: '20px' }}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
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

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>
              2. Upload CSV File
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{
                display: 'block', width: '100%', fontSize: 12,
                color: 'var(--body-text)',
              }}
            />
            <p style={{ marginTop: 4, fontSize: 11, color: 'var(--muted-text)' }}>
              Requires headers: full_name, lrn, parent_phone
            </p>
          </div>
        </div>

        {status && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            ...(statusColors[status.type] as React.CSSProperties)
          }}>
            {status.message}
          </div>
        )}

        {parsedData.length > 0 && (
          <div className="space-y-4" style={{ marginTop: 20 }}>
            <div className="flex items-center justify-between">
              <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--page-title)' }}>
                Preview ({parsedData.length} rows)
              </h3>
              <Button onClick={handleImport} disabled={loading || !selectedSection}>
                {loading ? 'Processing...' : 'Confirm & Insert'}
              </Button>
            </div>

            <div style={{ maxHeight: 384, overflowY: 'auto', border: '0.5px solid var(--card-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: PREVIEW_COL, padding: '9px 14px' }}>
                {['Full Name', 'LRN', 'Parent Phone'].map(c => (
                  <span key={c} style={{ fontSize: 11, fontWeight: 500, color: 'var(--table-header-text)' }}>{c}</span>
                ))}
              </div>
              {parsedData.map((row, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: PREVIEW_COL,
                  padding: '8px 14px', borderTop: '0.5px solid var(--card-border)',
                  background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{row.full_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{row.lrn}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted-text)' }}>{row.parent_phone}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
