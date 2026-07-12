import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
  created_at: string
}

// Instantiate secondary client to prevent session hijack when signing up another user
const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  }
)

export default function TeacherManager() {
  const [teachers, setTeachers] = useState<Profile[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchTeachers = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'teacher').order('created_at', { ascending: false })
    if (data) setTeachers(data)
  }

  useEffect(() => {
    fetchTeachers()
  }, [])

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const trimmedEmail = email.trim()
    
    // 1. Sign up the user via secondary client
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: fullName,
        }
      }
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    const userId = authData.user?.id
    if (!userId) {
      setError("User ID not returned after signup.")
      setLoading(false)
      return
    }

    // 2. Insert into profiles using the MAIN client (which has Admin RLS access)
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      full_name: fullName,
      email: trimmedEmail,
      role: 'teacher'
    })

    if (profileError) {
      // Note: If profile fails, auth user is already created. For this MVP, we show the error.
      setError(profileError.message)
    } else {
      setIsAddOpen(false)
      setFullName('')
      setEmail('')
      setPassword('')
      fetchTeachers()
    }
    setLoading(false)
  }

  const COLS = ['Name', 'Email Address', 'Created At']
  const COL_TEMPLATE = '2fr 2fr 1fr'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Teacher Management</h2>
        <Button onClick={() => setIsAddOpen(true)}>Add Teacher</Button>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '0.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: 'var(--table-header-bg)', display: 'grid', gridTemplateColumns: COL_TEMPLATE, padding: '9px 16px' }}>
          {COLS.map(c => <span key={c} style={{ fontSize: 11, fontWeight: 500, color: 'var(--table-header-text)' }}>{c}</span>)}
        </div>
        {teachers.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted-text)' }}>No teachers found.</div>
        ) : teachers.map((t, idx) => (
          <div key={t.id} style={{
            display: 'grid', gridTemplateColumns: COL_TEMPLATE,
            padding: '9px 16px', alignItems: 'center',
            borderTop: '0.5px solid var(--card-border)',
            background: idx % 2 === 1 ? 'var(--row-alt)' : 'transparent',
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--body-text)' }}>{t.full_name}</span>
            <span style={{ fontSize: 12, color: 'var(--body-text)' }}>{t.email}</span>
            <span style={{ fontSize: 12, color: 'var(--muted-text)' }}>{new Date(t.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register New Teacher</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          <form onSubmit={handleAddTeacher} className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Full Name</label>
              <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Email Address</label>
              <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@rtnhs.edu.ph" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Temporary Password</label>
              <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} placeholder="Min 6 characters" />
            </div>
            <div className="flex justify-end pt-4 space-x-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
