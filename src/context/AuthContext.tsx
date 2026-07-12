import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Role = 'admin' | 'teacher' | 'scanner' | null

interface AuthContextType {
  session: Session | null
  user: User | null
  role: Role
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  loading: true,
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      fetchRole(session?.user?.id)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      fetchRole(session?.user?.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchRole = async (userId: string | undefined) => {
    if (!userId) {
      setRole(null)
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (data && !error) {
      setRole(data.role as Role)
    } else {
      setRole(null)
    }
    setLoading(false)
  }

  return (
    <AuthContext.Provider value={{ session, user, role, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  return useContext(AuthContext)
}
