import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
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
  const { user } = useAuth()
  const [sections, setSections] = useState<any[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    const fetchSections = async () => {
      if (!user) return
      
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
      setLoading(false)
    }
    fetchSections()
  }, [user])

  useEffect(() => {
    const fetchStudents = async () => {
      if (!selectedSectionId) {
        setStudents([])
        return
      }
      setLoading(true)
      const { data } = await supabase
        .from('students')
        .select('id, full_name, lrn, qr_code, sections(name, grade_level)')
        .eq('section_id', selectedSectionId)
        .order('full_name')
        
      if (data) {
        setStudents(data.map((s: any) => ({
          ...s,
          section_name: s.sections.name,
          section_grade: s.sections.grade_level
        })))
      }
      setLoading(false)
    }
    fetchStudents()
  }, [selectedSectionId])

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
    if (students.length === 0) return
    setGenerating(true)
    
    try {
      const doc = new jsPDF()
      
      const cols = 2
      const rows = 4
      const cardWidth = 90
      const cardHeight = 65
      const startX = 10
      const startY = 15
      const xSpacing = 100 // 10 + 90 = 100, next col at 110
      const ySpacing = 70  // 15 + 65 = 80, next row at 85
      
      for (let i = 0; i < students.length; i++) {
        const student = students[i]
        
        // Add new page if we exceed 8 cards
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
        doc.setLineWidth(0.5)
        doc.rect(x, y, cardWidth, cardHeight)
        
        // Header Text
        doc.setFontSize(10)
        doc.setFont("helvetica", "bold")
        doc.text("Rio Tuba National High School", x + cardWidth / 2, y + 8, { align: "center" })
        
        // Divider
        doc.line(x + 5, y + 12, x + cardWidth - 5, y + 12)
        
        // Student Info
        doc.setFontSize(12)
        doc.setFont("helvetica", "bold")
        doc.text(student.full_name, x + 5, y + 20)
        
        doc.setFontSize(10)
        doc.setFont("helvetica", "normal")
        doc.text(`LRN: ${student.lrn}`, x + 5, y + 28)
        doc.text(`Section: ${student.section_grade} ${student.section_name}`, x + 5, y + 34)
        
        // Generate QR code data URL
        const qrDataUrl = await QRCode.toDataURL(student.qr_code, { width: 150, margin: 1 })
        
        // Add QR image to PDF (x, y, width, height)
        // Position on the right side of the card
        const qrSize = 35
        doc.addImage(qrDataUrl, 'PNG', x + cardWidth - qrSize - 5, y + 15, qrSize, qrSize)
        
        // Footer text below QR
        doc.setFontSize(7)
        doc.text("Official ID Hash", x + cardWidth - (qrSize/2) - 5, y + 55, { align: "center" })
      }
      
      const secLabel = students[0].section_grade + "_" + students[0].section_name
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 6 }}>Select Assigned Section</label>
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
                <Button onClick={downloadBatchPDF} disabled={generating}>
                  {generating ? 'Generating PDF...' : 'Download Full Section PDF'}
                </Button>
              )}
            </div>
          </div>

          {selectedSectionId && (
            <div style={{ paddingTop: 20, borderTop: '0.5px solid var(--card-border)' }}>
              <h3 style={{ marginBottom: 14, fontSize: 14, fontWeight: 500, color: 'var(--page-title)' }}>Student Roster ({students.length})</h3>
              
              {loading ? (
                <div style={{ fontSize: 13, color: 'var(--muted-text)' }}>Loading roster...</div>
              ) : students.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted-text)' }}>No students found in this section.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {students.map(student => (
                    <div key={student.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px',
                      border: '0.5px solid var(--card-border)',
                      borderRadius: 8,
                      background: 'var(--row-alt)',
                      transition: 'background 0.15s',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--body-text)' }}>{student.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted-text)', marginTop: 2 }}>LRN: {student.lrn}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => downloadSingleQR(student)}>
                        Export PNG
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
