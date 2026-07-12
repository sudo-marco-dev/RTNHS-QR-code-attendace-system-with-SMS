/**
 * exportFormatter.ts
 * Transforms attendance_logs + joined data into a flat research-ready CSV matrix.
 */

export interface AttendanceExportRow {
  student_name: string
  lrn: string
  section: string
  date: string
  window_type: string
  arrival_time: string
  attendance_status: string
  offline_synced: string
}

type RawLogRow = {
  status: string | null
  scanned_at: string | null
  offline_sync: boolean | null
  student: {
    full_name: string | null
    lrn: string | null
    sections?: { name: string | null; grade_level: string | null } | null
  } | null
  scan_window?: {
    window_type: string | null
  } | null
}

/** Safely coerces null/undefined to an empty string */
function safe(val: string | null | undefined): string {
  return val ?? ''
}

/** Converts a window_type enum to a human readable label */
function formatWindowType(wt: string | null | undefined): string {
  if (!wt) return ''
  const map: Record<string, string> = {
    morning_in: 'Morning In',
    afternoon_in: 'Afternoon In',
    afternoon_out: 'Afternoon Out',
  }
  return map[wt] ?? wt
}

/** Formats a timestamptz string to a readable date */
function formatDate(ts: string | null | undefined): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return ''
  }
}

/** Formats a timestamptz string to a readable time */
function formatTime(ts: string | null | undefined): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

/** Transforms raw attendance log rows into flat export rows */
export function transformLogsToExportRows(logs: RawLogRow[]): AttendanceExportRow[] {
  return logs.map(log => {
    const sectionLabel = log.student?.sections
      ? `${safe(log.student.sections.grade_level)} ${safe(log.student.sections.name)}`.trim()
      : ''

    return {
      student_name: safe(log.student?.full_name),
      lrn: safe(log.student?.lrn),
      section: sectionLabel,
      date: formatDate(log.scanned_at),
      window_type: formatWindowType(log.scan_window?.window_type),
      arrival_time: formatTime(log.scanned_at),
      attendance_status: safe(log.status),
      offline_synced: log.offline_sync ? 'Yes' : 'No',
    }
  })
}

/** Converts export rows to a CSV string and triggers browser download */
export function downloadCsv(rows: AttendanceExportRow[], filename: string): void {
  const HEADERS: (keyof AttendanceExportRow)[] = [
    'student_name',
    'lrn',
    'section',
    'date',
    'window_type',
    'arrival_time',
    'attendance_status',
    'offline_synced',
  ]

  const DISPLAY_HEADERS: string[] = [
    'Student Name',
    'LRN',
    'Section',
    'Date',
    'Window Type',
    'Arrival Time',
    'Attendance Status',
    'Offline Synced',
  ]

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`

  const csvLines = [
    DISPLAY_HEADERS.map(escape).join(','),
    ...rows.map(row => HEADERS.map(h => escape(row[h])).join(',')),
  ]

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
