import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ui/ThemeToggle'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { role, user, loading: authLoading, authError } = useAuth()

  useEffect(() => {
    if (role === 'admin') {
      navigate('/admin')
    } else if (role === 'teacher') {
      navigate('/teacher')
    } else if (user && !authLoading && role === null) {
      setError(`Permission Error: Your account lacks proper permissions. (DB Error: ${authError || 'Profile not found'})`)
    }
  }, [role, user, authLoading, authError, navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--page-bg)',
      transition: 'background 0.2s',
    }}>
      {/* Theme toggle pinned top-right */}
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>

      <div style={{
        width: '100%',
        maxWidth: 380,
        background: 'var(--card-bg)',
        border: '0.5px solid var(--card-border)',
        borderRadius: 14,
        padding: '36px 32px',
        boxShadow: '0 4px 32px rgba(4,71,28,0.10)',
      }}>
        {/* Logo / brand mark */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48, height: 48,
            background: 'var(--primary)',
            borderRadius: 12,
            marginBottom: 12,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c3d898" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--page-title)', lineHeight: 1.2 }}>
            RTNHS Attendance
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-text)', marginTop: 3 }}>
            Rio Tuba National High School
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', fontSize: 12,
            color: 'var(--danger-text)', background: 'var(--danger)',
            borderRadius: 8, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 500,
              color: 'var(--body-text)', marginBottom: 5,
            }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@rtnhs.edu.ph"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px', borderRadius: 7,
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--body-text)',
                fontSize: 13,
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--input-focus)'}
              onBlur={e => e.target.style.borderColor = 'var(--input-border)'}
            />
          </div>

          <div>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 500,
              color: 'var(--body-text)', marginBottom: 5,
            }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px', borderRadius: 7,
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--body-text)',
                fontSize: 13,
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--input-focus)'}
              onBlur={e => e.target.style.borderColor = 'var(--input-border)'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '10px',
              borderRadius: 8,
              border: 'none',
              background: loading ? 'var(--muted-text)' : 'var(--primary)',
              color: 'var(--primary-text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              letterSpacing: '0.01em',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
