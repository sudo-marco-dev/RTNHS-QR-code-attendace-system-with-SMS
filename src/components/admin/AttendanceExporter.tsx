import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Download, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { format } from 'date-fns'
import { exportAttendanceExcel } from '../../lib/excelExport'

interface Section {
  id: string
  name: string
  grade_level: string
}

export default function AttendanceExporter() {
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [monthYear, setMonthYear] = useState<string>(format(new Date(), 'yyyy-MM'))
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const fetchSections = async () => {
      const { data, error } = await supabase
        .from('sections')
        .select('id, name, grade_level')
        .order('grade_level')
        .order('name')
      
      if (data) setSections(data)
      if (error) setError('Failed to load sections')
    }
    fetchSections()
  }, [])

  const handleExport = async () => {
    if (!selectedSection) {
      setError('Please select a section.')
      return
    }
    if (!monthYear) {
      setError('Please select a month.')
      return
    }

    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const sec = sections.find(s => s.id === selectedSection)
      if (!sec) throw new Error('Section not found')

      const [yearStr, monthStr] = monthYear.split('-')
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)

      await exportAttendanceExcel({
        sectionId: sec.id,
        sectionName: `${sec.grade_level} - ${sec.name}`,
        year,
        month
      })

      setSuccess('Excel report generated successfully!')
    } catch (err: any) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--page-title)] flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-tea" />
            Attendance Exporter
          </h2>
          <p className="text-sm text-[var(--page-sub)] mt-1">
            Generate highly detailed multi-sheet Excel reports of class attendance for any given month, complete with weekly time-in/out breakdowns.
          </p>
        </div>
      </div>

      <div className="max-w-md bg-[var(--sidebar-bg)] border border-[var(--sidebar-border)] rounded-xl p-6 space-y-5 shadow-sm">
        
        {error && (
          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 bg-forest/20 border border-forest/30 rounded-lg text-tea text-sm">
            {success}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[var(--sidebar-muted)] mb-2 uppercase tracking-wider">
            Target Section
          </label>
          <select
            value={selectedSection}
            onChange={e => setSelectedSection(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-4 py-2.5 text-sm text-[var(--body-text)] focus:outline-none focus:border-tea transition-colors"
          >
            <option value="">Select a section...</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>
                {s.grade_level} - {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--sidebar-muted)] mb-2 uppercase tracking-wider">
            Month & Year
          </label>
          <input
            type="month"
            value={monthYear}
            onChange={e => setMonthYear(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-4 py-2.5 text-sm text-[var(--body-text)] focus:outline-none focus:border-tea transition-colors"
          />
        </div>

        <button
          onClick={handleExport}
          disabled={loading || !selectedSection}
          className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 bg-forest text-tea font-semibold rounded-lg hover:bg-forest-mid transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <i className="ti ti-loader-2 animate-spin text-lg" />
              Generating...
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              Generate Excel Report
            </>
          )}
        </button>

        <div className="text-xs text-[var(--sidebar-muted)] text-center leading-relaxed">
          The generated report includes a Monthly Summary tab and individual Weekly tabs with exact timestamps for Morning and Afternoon scans.
        </div>
      </div>
    </div>
  )
}
