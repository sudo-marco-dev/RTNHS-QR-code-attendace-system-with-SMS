import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { playError, playStateChange } from './AudioFeedback'

interface Props {
  onAuthenticated: (sectionId: string, sectionName: string) => void
}

export default function PinScreen({ onAuthenticated }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white">
      <div className={`w-full max-w-sm px-8 py-10 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 transition-transform ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600 flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-wide">Scanner Station</h1>
          <p className="text-gray-400 text-sm mt-1">Enter your 4-digit Section PIN</p>
        </div>

        {/* PIN dots display */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold border-2 transition-all duration-150 ${
                i < pin.length
                  ? 'border-blue-400 bg-blue-900/60 text-blue-200'
                  : 'border-gray-700 bg-gray-800'
              }`}
            >
              {i < pin.length ? '●' : ''}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-950/60 border border-red-700 rounded-lg text-red-300 text-sm text-center">
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
                className="h-14 bg-gray-800 hover:bg-gray-700 active:scale-95 rounded-xl text-xl font-bold transition-all"
              >
                ⌫
              </button>
            ) : (
              <button
                key={idx}
                onClick={() => handleKey(key)}
                className="h-14 bg-gray-800 hover:bg-blue-800 active:bg-blue-700 active:scale-95 rounded-xl text-xl font-bold transition-all"
              >
                {key}
              </button>
            )
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={pin.length !== 4 || loading}
          className="w-full mt-5 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-lg tracking-wide transition-colors"
        >
          {loading ? 'Verifying...' : 'Unlock'}
        </button>
      </div>
    </div>
  )
}
