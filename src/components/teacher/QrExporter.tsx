import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'
import { useAuth } from '../../context/AuthContext'

interface Student {
  id: string
  full_name: string
  lrn: string
  qr_code: string
  section_name: string
  section_grade: string
}

export default function QrExporter() {
  const { user, role } = useAuth()
  const [sections, setSections] = useState<any[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchSections = async () => {
      if (!user) return
      
      if (role === 'admin') {
        const { data } = await supabase
          .from('sections')
          .select('id, name, grade_level')
          .order('grade_level')
        
        if (data) setSections(data)
      } else {
        const { data } = await supabase
          .from('teacher_assignments')
          .select(`
            section_id,
            sections:sections!section_id(id, name, grade_level)
          `)
          .eq('teacher_id', user.id)
          
        if (data) {
          // Deduplicate sections
          const uniqueSections = new Map()
          data.forEach(item => {
            if (item.sections) uniqueSections.set(item.section_id, item.sections)
          })
          setSections(Array.from(uniqueSections.values()))
        }
      }
      setLoading(false)
    }
    fetchSections()
  }, [user, role])

  useEffect(() => {
    const fetchStudents = async () => {
      if (!selectedSectionId) {
        setStudents([])
        setSelectedStudentIds(new Set())
        return
      }
      setLoading(true)
      const { data } = await supabase
        .from('students')
        .select('id, full_name, lrn, qr_code, sections(name, grade_level)')
        .eq('section_id', selectedSectionId)
        .order('full_name')
        
      if (data) {
        const mapped = data.map((s: any) => ({
          ...s,
          section_name: s.sections.name,
          section_grade: s.sections.grade_level
        }))
        setStudents(mapped)
        setSelectedStudentIds(new Set(mapped.map((s: any) => s.id)))
      }
      setLoading(false)
    }
    fetchStudents()
  }, [selectedSectionId])

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

  const downloadSingleQR = async (student: Student) => {
    try {
      const dataUrl = await QRCode.toDataURL(student.qr_code, { width: 300, margin: 2 })
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${student.full_name}_QR.png`.replace(/\s+/g, '_')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error("Failed to generate QR:", err)
    }
  }

  const downloadBatchPDF = async () => {
    const studentsToExport = students.filter(s => selectedStudentIds.has(s.id))
    if (studentsToExport.length === 0) return
    setGenerating(true)
    
    try {
      // Default jsPDF creates an A4 document (210mm x 297mm)
      const doc = new jsPDF()
      
      const cols = 2
      const rows = 4
      
      // Sized slightly smaller than standard CR80 (85.6 x 54 mm)
      // to ensure it easily slides into standard ID card sleeves after cutting.
      const cardWidth = 82
      const cardHeight = 52
      
      const startX = 15  // Left margin on A4 paper
      const startY = 20  // Top margin on A4 paper
      const xSpacing = cardWidth + 15
      const ySpacing = cardHeight + 15
      
      for (let i = 0; i < studentsToExport.length; i++) {
        const student = studentsToExport[i]
        
        // Add new page if we exceed 8 cards (2 columns * 4 rows)
        if (i > 0 && i % (cols * rows) === 0) {
          doc.addPage()
        }
        
        const pageIndex = i % (cols * rows)
        const col = pageIndex % cols
        const row = Math.floor(pageIndex / cols)
        
        const x = startX + (col * xSpacing)
        const y = startY + (row * ySpacing)
        
        // Draw card border
        doc.setDrawColor(0)
        doc.setLineWidth(0.3)
        doc.rect(x, y, cardWidth, cardHeight)
        
        // Header Text
        doc.setFontSize(9)
        doc.setFont("helvetica", "bold")
        doc.text("Rio Tuba National High School", x + cardWidth / 2, y + 7, { align: "center" })
        
        // Divider
        doc.line(x + 4, y + 10, x + cardWidth - 4, y + 10)
        
        const qrSize = 32
        const qrX = x + cardWidth - qrSize - 4
        const qrY = y + 14
        
        // Student Info
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        
        // Wrap long names so they don't overlap the QR code
        const maxNameWidth = cardWidth - qrSize - 12
        const splitName = doc.splitTextToSize(student.full_name, maxNameWidth)
        doc.text(splitName, x + 4, y + 18)
        
        // Calculate dynamic Y position based on how many lines the name took
        let currentY = y + 18 + ((splitName.length - 1) * 5) + 8
        
        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        
        // Only print LRN if it exists
        if (student.lrn) {
          doc.text(`LRN: ${student.lrn}`, x + 4, currentY)
          currentY += 6
        }
        
        doc.text(`Sec: ${student.section_grade} ${student.section_name}`, x + 4, currentY)
        
        // Generate QR code data URL
        const qrDataUrl = await QRCode.toDataURL(student.qr_code, { width: 150, margin: 1 })
        
        // Add QR image to PDF
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)
      }
      
      const secLabel = studentsToExport[0].section_grade + "_" + studentsToExport[0].section_name
      doc.save(`QR_Batch_${secLabel.replace(/\s+/g, '_')}.pdf`)
      
    } catch (err) {
      console.error("Batch export failed", err)
    }
    
    setGenerating(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>QR Code Export Engine</h2>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>
              {role === 'admin' ? 'Select Section' : 'Select Assigned Section'}
            </label>
            <div className="flex items-center space-x-4">
              <Select 
                value={selectedSectionId} 
                onChange={e => setSelectedSectionId(e.target.value)}
                className="max-w-md"
              >
                <option value="" disabled>Select a section to view roster...</option>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>{s.grade_level} - {s.name}</option>
                ))}
              </Select>
              
              {students.length > 0 && (
                <Button onClick={downloadBatchPDF} disabled={generating || selectedStudentIds.size === 0}>
                  {generating ? 'Generating PDF...' : `Download Selected (${selectedStudentIds.size})`}
                </Button>
              )}
            </div>
          </div>

          {selectedSectionId && (
            <div style={{ paddingTop: 20, borderTop: '0.5px solid var(--card-border)' }}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--page-title)' }}>
                  Student Roster ({filteredAndSortedStudents.length})
                </h3>
                
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
              </div>
              
              {loading ? (
                <div style={{ fontSize: 13, color: 'var(--muted-text)' }}>Loading roster...</div>
              ) : filteredAndSortedStudents.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted-text)' }}>No students found matching your criteria.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAndSortedStudents.map(student => {
                    const isSelected = selectedStudentIds.has(student.id);
                    return (
                      <div key={student.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px',
                        border: isSelected ? '1.5px solid var(--accent)' : '0.5px solid var(--card-border)',
                        borderRadius: 8,
                        background: isSelected ? 'var(--row-hover)' : 'var(--row-alt)',
                        transition: 'all 0.15s',
                        cursor: 'pointer',
                        opacity: isSelected ? 1 : 0.6
                      }} onClick={() => toggleStudentSelection(student.id)}>
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleStudentSelection(student.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            style={{ cursor: 'pointer' }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--body-text)' }}>{student.full_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted-text)', marginTop: 2 }}>LRN: {student.lrn}</div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); downloadSingleQR(student); }}>
                          Export PNG
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
