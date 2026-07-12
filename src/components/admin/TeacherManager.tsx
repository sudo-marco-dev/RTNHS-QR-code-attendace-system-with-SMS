import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Card, CardContent } from '../ui/Card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table'
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Teacher Management</h2>
        <Button onClick={() => setIsAddOpen(true)}>Add Teacher</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-gray-500">No teachers found.</TableCell>
                </TableRow>
              ) : (
                teachers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.full_name}</TableCell>
                    <TableCell>{t.email}</TableCell>
                    <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register New Teacher</DialogTitle>
          </DialogHeader>
          {error && <div className="p-3 text-sm text-red-600 bg-red-100 rounded">{error}</div>}
          <form onSubmit={handleAddTeacher} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Full Name</label>
              <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium">Email Address</label>
              <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@rtnhs.edu.ph" />
            </div>
            <div>
              <label className="block text-sm font-medium">Temporary Password</label>
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
