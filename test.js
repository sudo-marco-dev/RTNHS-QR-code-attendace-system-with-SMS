import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1]
const supabaseKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1]

const sb = createClient(supabaseUrl, supabaseKey)
async function test() {
  const { data, error } = await sb.from('attendance_logs').select('id, student_id, scan_window_id')
  if (error) console.error(error)
  else {
    const map = {}
    const duplicates = []
    for (const row of data) {
      const key = `${row.student_id}_${row.scan_window_id}`
      if (map[key]) duplicates.push(key)
      map[key] = true
    }
    console.log('Duplicates in DB:', duplicates.length)
  }
}
test()
