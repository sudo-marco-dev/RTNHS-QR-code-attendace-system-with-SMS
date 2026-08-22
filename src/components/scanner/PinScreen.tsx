import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { playError, playStateChange } from './AudioFeedback'
import { Home } from 'lucide-react'

interface Props {
  onAuthenticated: (sectionId: string, sectionName: string) => void
}

export default function PinScreen({ onAuthenticated }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const navigate = useNavigate()

  const handleKey = (key: string) => {
    if (pin.length < 4) setPin(prev => prev + key)
  }

  const handleDelete = () => setPin(prev => prev.slice(0, -1))

  const handleSubmit = async () => {
    if (pin.length !== 4 || loading) return
    setLoading(true)
    setError(null)

    const { data } = await supabase
      .from('sections')
      .select('id, name, grade_level')
      .eq('scanner_pin', pin)
      .maybeSingle()

    if (data) {
      playStateChange()
      onAuthenticated(data.id, `${data.grade_level} - ${data.name}`)
    } else {
      playError()
      setError('Invalid PIN. Please try again.')
      setPin('')
      setShake(true)
      setTimeout(() => setShake(false), 600)
    }
    setLoading(false)
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--page-bg)] text-[var(--body-text)] p-4">
      <div className="w-full max-w-sm">
        {/* Header with Home Button */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[var(--sidebar-muted)] hover:text-[var(--primary)] hover:bg-[var(--row-alt)] transition-colors"
          >
            <Home className="w-5 h-5" />
            <span className="font-medium text-sm">Home</span>
          </button>
        </div>

        <div className={`w-full px-8 py-10 bg-[var(--card-bg)] rounded-2xl shadow-xl border border-[var(--card-border)] transition-transform ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--primary)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--primary-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-wide text-[var(--page-title)]">Scanner Station</h1>
            <p className="text-[var(--sidebar-muted)] text-sm mt-1">Enter your 4-digit Section PIN</p>
          </div>

          {/* PIN dots display */}
          <div className="flex justify-center gap-4 mb-6">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold border-2 transition-all duration-150 ${
                  i < pin.length
                    ? 'border-[var(--primary)] bg-[rgba(4,71,28,0.1)] text-[var(--primary)]'
                    : 'border-[var(--input-border)] bg-[var(--input-bg)] text-transparent'
                }`}
              >
                {i < pin.length ? '●' : ''}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-[var(--danger)] border border-[var(--danger-text)] rounded-lg text-[var(--danger-text)] text-sm text-center">
              {error}
            </div>
          )}

          {/* Numeric keypad */}
          <div className="grid grid-cols-3 gap-3">
            {keys.map((key, idx) =>
              key === '' ? (
                <div key={idx} />
              ) : key === '⌫' ? (
                <button
                  key={idx}
                  onClick={handleDelete}
                  className="h-14 bg-[var(--row-alt)] hover:bg-[var(--card-border)] text-[var(--body-text)] active:scale-95 rounded-xl text-xl font-bold transition-all"
                >
                  ⌫
                </button>
              ) : (
                <button
                  key={idx}
                  onClick={() => handleKey(key)}
                  className="h-14 bg-[var(--row-alt)] hover:bg-[var(--primary)] hover:text-[var(--primary-text)] text-[var(--body-text)] active:scale-95 rounded-xl text-xl font-bold transition-all"
                >
                  {key}
                </button>
              )
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={pin.length !== 4 || loading}
            className="w-full mt-5 py-3.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-text)] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-lg tracking-wide transition-colors"
          >
            {loading ? 'Verifying...' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  )
}

