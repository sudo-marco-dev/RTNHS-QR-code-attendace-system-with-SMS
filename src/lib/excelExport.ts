import { supabase } from './supabase'
import ExcelJS from 'exceljs'
import { format, getDaysInMonth, startOfMonth, endOfMonth, parseISO, isWeekend, getISOWeek } from 'date-fns'

interface ExportParams {
  sectionId: string
  sectionName: string
  year: number
  month: number // 1-12
}

export async function exportAttendanceExcel({ sectionId, sectionName, year, month }: ExportParams) {
  // 1. Fetch Students
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('section_id', sectionId)
    .order('full_name')

  if (!students || students.length === 0) {
    throw new Error('No students found in this section.')
  }

  // 2. Determine Date Range
  const startDate = startOfMonth(new Date(year, month - 1, 1))
  const endDate = endOfMonth(startDate)
  const daysInMonth = getDaysInMonth(startDate)

  // 3. Fetch Scan Windows
  const { data: scanWindows } = await supabase
    .from('scan_windows')
    .select('id, window_type, opened_at')
    .eq('section_id', sectionId)
    .gte('opened_at', startDate.toISOString())
    .lte('opened_at', endDate.toISOString())

  if (!scanWindows || scanWindows.length === 0) {
    throw new Error('No scan windows found for this month.')
  }

  // 4. Fetch Attendance Logs
  const windowIds = scanWindows.map(w => w.id)
  const { data: logs } = await supabase
    .from('attendance_logs')
    .select('student_id, scan_window_id, status, scanned_at')
    .in('scan_window_id', windowIds)

  // 5. Build lookup maps
  const logsMap = new Map<string, { status: string, scanned_at: string }>()
  logs?.forEach(log => {
    logsMap.set(`${log.student_id}_${log.scan_window_id}`, { status: log.status, scanned_at: log.scanned_at })
  })

  // Map days to their scan windows
  const dailyWindows = new Map<number, typeof scanWindows>()
  scanWindows.forEach(w => {
    const day = parseISO(w.opened_at).getDate()
    if (!dailyWindows.has(day)) dailyWindows.set(day, [])
    dailyWindows.get(day)!.push(w)
  })

  // Group days into weeks (Mon-Fri)
  const weeks = new Map<number, number[]>()
  for(let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    if (isWeekend(date)) continue // Skip weekends by default
    
    const isoWeek = getISOWeek(date)
    if (!weeks.has(isoWeek)) weeks.set(isoWeek, [])
    weeks.get(isoWeek)!.push(d)
  }

  // 6. Initialize Excel Workbook
  const workbook = new ExcelJS.Workbook()
  
  // ==========================================
  // SHEET 1: MONTHLY SUMMARY
  // ==========================================
  const summarySheet = workbook.addWorksheet('Monthly Summary')
  summarySheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]

  const sumCols = [{ header: 'Student Name', key: 'name', width: 30 }]
  for (let d = 1; d <= daysInMonth; d++) {
    sumCols.push({ header: d.toString(), key: `day_${d}`, width: 6 })
  }
  sumCols.push(
    { header: 'Total P', key: 'total_P', width: 10 },
    { header: 'Total L', key: 'total_L', width: 10 },
    { header: 'Total AM-A', key: 'total_AMA', width: 12 },
    { header: 'Total PM-A', key: 'total_PMA', width: 12 },
    { header: 'Total A', key: 'total_A', width: 10 }
  )
  summarySheet.columns = sumCols

  const sumHeaderRow = summarySheet.getRow(1)
  sumHeaderRow.font = { bold: true }
  sumHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' }
  sumHeaderRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    if (isWeekend(date)) {
      sumHeaderRow.getCell(d + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
    }
  }

  let sRowIndex = 2
  for (const student of students) {
    const row = summarySheet.getRow(sRowIndex)
    row.getCell(1).value = student.full_name
    row.getCell(1).alignment = { horizontal: 'left' }

    let tP = 0, tL = 0, tAMA = 0, tPMA = 0, tA = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = row.getCell(d + 1)
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      
      const isWeekEndDay = isWeekend(new Date(year, month - 1, d))
      const windows = dailyWindows.get(d)
      if (!windows || windows.length === 0) {
        if (isWeekEndDay) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
        continue
      }

      let amP = 0, amL = 0, amA = 0, pmP = 0, pmL = 0, pmA = 0
      let amCount = 0, pmCount = 0

      for (const w of windows) {
        const log = logsMap.get(`${student.id}_${w.id}`)
        const actualStatus = log ? log.status : 'ABSENT'

        if (w.window_type === 'morning_in') {
          amCount++
          if (actualStatus === 'PRESENT') amP++
          else if (actualStatus === 'LATE') amL++
          else amA++
        } else {
          pmCount++
          if (actualStatus === 'PRESENT') pmP++
          else if (actualStatus === 'LATE') pmL++
          else pmA++
        }
      }

      let amState = '', pmState = ''
      if (amCount > 0) amState = amA > 0 ? 'A' : amL > 0 ? 'L' : 'P'
      if (pmCount > 0) pmState = pmA > 0 ? 'A' : pmL > 0 ? 'L' : 'P'

      let finalState = ''
      if (amCount > 0 && pmCount > 0) {
        if (amState === 'P' && pmState === 'P') finalState = 'P'
        else if (amState === 'L' && pmState === 'P') finalState = 'AM-L'
        else if (amState === 'P' && pmState === 'L') finalState = 'PM-L'
        else if (amState === 'L' && pmState === 'L') finalState = 'L'
        else if (amState === 'A' && pmState === 'P') finalState = 'AM-A'
        else if (amState === 'P' && pmState === 'A') finalState = 'PM-A'
        else if (amState === 'A' && pmState === 'A') finalState = 'A'
        else finalState = `${amState === 'L' ? 'AM-L' : 'AM-A'}, ${pmState === 'L' ? 'PM-L' : 'PM-A'}`
      } else if (amCount > 0) {
        finalState = amState === 'P' ? 'P' : amState === 'L' ? 'AM-L' : 'AM-A'
      } else if (pmCount > 0) {
        finalState = pmState === 'P' ? 'P' : pmState === 'L' ? 'PM-L' : 'PM-A'
      }

      cell.value = finalState

      if (finalState === 'P') {
        tP++
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }
        cell.font = { color: { argb: 'FF2E7D32' }, bold: true }
      } else if (finalState === 'L' || finalState === 'AM-L' || finalState === 'PM-L') {
        tL++
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }
        cell.font = { color: { argb: 'FFE65100' }, bold: true }
      } else if (finalState === 'A') {
        tA++
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }
        cell.font = { color: { argb: 'FFC62828' }, bold: true }
      } else if (finalState.includes('AM-A') || finalState.includes('PM-A')) {
        if (finalState.includes('AM-A')) tAMA++
        if (finalState.includes('PM-A')) tPMA++
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } }
        cell.font = { color: { argb: 'FFAD1457' }, bold: true }
      }
    }

    const startTot = daysInMonth + 2
    row.getCell(startTot).value = tP
    row.getCell(startTot + 1).value = tL
    row.getCell(startTot + 2).value = tAMA
    row.getCell(startTot + 3).value = tPMA
    row.getCell(startTot + 4).value = tA

    for (let i = 0; i < 5; i++) {
      row.getCell(startTot + i).alignment = { horizontal: 'center' }
      row.getCell(startTot + i).font = { bold: true }
    }
    sRowIndex++
  }

  // Summary Legend
  sRowIndex += 2
  const legendData = [
    { label: 'P = Present', bg: 'FFE8F5E9', text: 'FF2E7D32' },
    { label: 'L / AM-L / PM-L = Late', bg: 'FFFFF3E0', text: 'FFE65100' },
    { label: 'AM-A = Morning Absent', bg: 'FFFCE4EC', text: 'FFAD1457' },
    { label: 'PM-A = Afternoon Absent', bg: 'FFFCE4EC', text: 'FFAD1457' },
    { label: 'A = Full Day Absent', bg: 'FFFFEBEE', text: 'FFC62828' },
  ]
  summarySheet.getCell(`A${sRowIndex}`).value = 'LEGEND'
  summarySheet.getCell(`A${sRowIndex}`).font = { bold: true }
  
  for (let i = 0; i < legendData.length; i++) {
    const cell = summarySheet.getCell(`B${sRowIndex + 1 + i}`)
    cell.value = legendData[i].label
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: legendData[i].bg } }
    cell.font = { color: { argb: legendData[i].text }, bold: true }
    cell.alignment = { horizontal: 'center' }
  }


  // ==========================================
  // SHEETS 2..N: WEEKLY DETAILED BREAKDOWNS
  // ==========================================
  let weekCount = 1
  for (const [_, days] of Array.from(weeks.entries()).sort((a,b)=>a[0]-b[0])) {
    const wSheet = workbook.addWorksheet(`Week ${weekCount}`)
    wSheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
    
    const row1 = wSheet.getRow(1)
    const row2 = wSheet.getRow(2)
    
    row1.getCell(1).value = 'Student Name'
    row1.getCell(1).font = { bold: true }
    row1.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    wSheet.getColumn(1).width = 30
    wSheet.mergeCells(1, 1, 2, 1) // Merge student name vertically

    let colIndex = 2
    for (const d of days) {
      const date = new Date(year, month - 1, d)
      const dateStr = format(date, 'EEEE (MMM d)') // e.g. Monday (Aug 3)
      
      wSheet.mergeCells(1, colIndex, 1, colIndex + 2)
      const dateHeader = row1.getCell(colIndex)
      dateHeader.value = dateStr
      dateHeader.alignment = { horizontal: 'center', vertical: 'middle' }
      dateHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
      dateHeader.font = { bold: true }
      
      const sub1 = row2.getCell(colIndex)
      const sub2 = row2.getCell(colIndex + 1)
      const sub3 = row2.getCell(colIndex + 2)
      
      sub1.value = 'AM IN'
      sub2.value = 'PM IN'
      sub3.value = 'PM OUT'
      
      const formatSub = (c: ExcelJS.Cell) => {
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.font = { bold: true, size: 10, color: { argb: 'FF555555' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
      }
      formatSub(sub1); formatSub(sub2); formatSub(sub3);
      
      wSheet.getColumn(colIndex).width = 16
      wSheet.getColumn(colIndex+1).width = 16
      wSheet.getColumn(colIndex+2).width = 16
      
      colIndex += 3
    }
    
    // Process Weekly Data
    let rowIndex = 3
    for (const student of students) {
      const row = wSheet.getRow(rowIndex)
      row.getCell(1).value = student.full_name
      
      let cIdx = 2
      for (const d of days) {
        const windows = dailyWindows.get(d) || []
        const amInW = windows.find(w => w.window_type === 'morning_in')
        const pmInW = windows.find(w => w.window_type === 'afternoon_in')
        const pmOutW = windows.find(w => w.window_type === 'afternoon_out')
        
        const processWindow = (w: any, offset: number) => {
          const cell = row.getCell(cIdx + offset)
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          
          if (!w) {
            cell.value = '-'
            cell.font = { color: { argb: 'FFCCCCCC' } }
            return
          }
          
          const log = logsMap.get(`${student.id}_${w.id}`)
          if (!log) {
            cell.value = 'A'
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } } // Light Red
            cell.font = { color: { argb: 'FFC62828' }, bold: true }
          } else {
            const timeStr = format(parseISO(log.scanned_at), 'hh:mm a')
            let statCode = 'P'
            if (log.status === 'LATE') statCode = 'L'
            if (log.status === 'ABSENT') statCode = 'A' // explicitly marked absent offline queue
            
            if (statCode === 'A') {
               cell.value = 'A'
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }
               cell.font = { color: { argb: 'FFC62828' }, bold: true }
            } else {
               cell.value = `${timeStr} (${statCode})`
               if (statCode === 'P') {
                 cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }
                 cell.font = { color: { argb: 'FF2E7D32' }, bold: true }
               } else if (statCode === 'L') {
                 cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }
                 cell.font = { color: { argb: 'FFE65100' }, bold: true }
               }
            }
          }
        }
        
        processWindow(amInW, 0)
        processWindow(pmInW, 1)
        processWindow(pmOutW, 2)
        
        cIdx += 3
      }
      rowIndex++
    }
    weekCount++
  }

  // ==========================================
  // GENERATE AND DOWNLOAD FILE
  // ==========================================
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Attendance_${sectionName}_${format(startDate, 'MMM_yyyy')}.xlsx`
  a.click()
  window.URL.revokeObjectURL(url)
}
