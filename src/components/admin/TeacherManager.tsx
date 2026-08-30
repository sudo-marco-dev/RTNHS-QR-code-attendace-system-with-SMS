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
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
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

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editTeacher, setEditTeacher] = useState<Profile | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Delete State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [teacherToDelete, setTeacherToDelete] = useState<Profile | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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

  const openEdit = (t: Profile) => {
    setEditTeacher(t)
    setError(null)
    setIsEditOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTeacher) return
    setIsSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: editTeacher.full_name })
      .eq('id', editTeacher.id)

    if (updateError) setError(updateError.message)
    else {
      setIsEditOpen(false)
      fetchTeachers()
    }
    setIsSaving(false)
  }

  const openDelete = (t: Profile) => {
    setTeacherToDelete(t)
    setError(null)
    setIsDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!teacherToDelete) return
    setIsDeleting(true)
    
    // 1. Delete from profiles (should cascade or be deleted, but doing it just in case)
    await supabase.from('profiles').delete().eq('id', teacherToDelete.id)
    
    // 2. Hard delete from auth using admin API
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(teacherToDelete.id)
    
    if (authError) {
      setError(authError.message)
    } else {
      setIsDeleteOpen(false)
      fetchTeachers()
    }
    setIsDeleting(false)
  }

  const COLS = ['Name', 'Email Address', 'Created At', 'Actions']


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--page-title)' }}>Teacher Management</h2>
        <Button onClick={() => setIsAddOpen(true)}>Add Teacher</Button>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden mt-4">
        {/* Desktop Header */}
        <div className="hidden md:grid md:grid-cols-[2fr_2fr_1fr_1fr] px-4 py-3 bg-[var(--table-header-bg)] border-b border-[var(--card-border)]">
          {COLS.map(c => <span key={c} className="text-xs font-medium text-[var(--table-header-text)]">{c}</span>)}
        </div>
        
        {teachers.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--muted-text)]">No teachers found.</div>
        ) : (
          <div className="flex flex-col">
            {teachers.map((t, idx) => (
              <div key={t.id} className="flex flex-col md:grid md:grid-cols-[2fr_2fr_1fr_1fr] md:items-center px-4 py-4 md:py-3 border-b border-[var(--card-border)] hover:bg-[var(--row-hover)] transition-colors">
                
                {/* Content Stack on Mobile / Grid on Desktop */}
                <div className="flex flex-col md:contents flex-1 min-w-0 mb-3 md:mb-0">
                  <span className="text-[14px] md:text-sm font-medium text-[var(--body-text)]">
                    <span className="text-[var(--muted-text)] mr-1.5">{idx + 1}.</span> 
                    {t.full_name}
                  </span>
                  
                  <div className="flex flex-wrap md:contents gap-x-3 gap-y-1 mt-1 md:mt-0 text-[13px] md:text-sm">
                    <span className="text-[var(--body-text)]">
                      <span className="md:hidden text-[var(--muted-text)] mr-1">Email:</span>
                      {t.email}
                    </span>
                    <span className="text-[var(--muted-text)] text-xs md:text-sm">
                      <span className="md:hidden mr-1">Created:</span>
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)} className="flex-1 md:flex-auto min-h-[44px] md:min-h-[32px]">Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => openDelete(t)} className="flex-1 md:flex-auto min-h-[44px] md:min-h-[32px] border-[var(--danger-text)] text-[var(--danger-text)]">Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
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
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Teacher</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          {editTeacher && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Full Name</label>
                <Input required value={editTeacher.full_name} onChange={(e) => setEditTeacher({ ...editTeacher, full_name: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--body-text)', marginBottom: 4 }}>Email (Cannot be changed here)</label>
                <Input disabled value={editTeacher.email} />
              </div>
              <div className="flex justify-end pt-4 space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          {error && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger)', borderRadius: 7 }}>{error}</div>}
          <div className="py-4">
            <p style={{ fontSize: 14, color: 'var(--body-text)' }}>
              Are you sure you want to completely delete <strong>{teacherToDelete?.full_name}</strong>?
            </p>
            <p style={{ fontSize: 13, color: 'var(--danger-text)', marginTop: 8 }}>
              This will hard-delete their authentication account and profile from Supabase. This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={isDeleting} style={{ background: 'var(--danger)', color: 'white', border: 'none' }}>
              {isDeleting ? 'Deleting...' : 'Delete Teacher'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
