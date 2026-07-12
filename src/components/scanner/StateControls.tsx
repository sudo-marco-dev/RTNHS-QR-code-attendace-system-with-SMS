import { playStateChange } from './AudioFeedback'
import { supabase } from '../../lib/supabase'

export type WindowStatus = 'open' | 'late' | 'closed'
export type WindowType = 'morning_in' | 'afternoon_in' | 'afternoon_out'

export interface ScanWindow {
  id: string
  status: WindowStatus
  window_type: WindowType
}

interface Props {
  sectionId: string
  scanWindow: ScanWindow | null
  windowType: WindowType
  onWindowChange: (window: ScanWindow | null) => void
  onBatchAbsent: (windowId: string) => void
}

export default function StateControls({ sectionId, scanWindow, windowType, onWindowChange, onBatchAbsent }: Props) {
  const status: WindowStatus = scanWindow?.status ?? 'closed'

  const openWindow = async () => {
    const { data, error } = await supabase
      .from('scan_windows')
      .insert({
        section_id: sectionId,
        opened_by: null,
        window_type: windowType,
        status: 'open',
        opened_at: new Date().toISOString()
      })
      .select('id, status, window_type')
      .single()

    if (data && !error) {
      playStateChange()
      onWindowChange(data as ScanWindow)
    }
  }

  const transitionToLate = async () => {
    if (!scanWindow) return
    const { data, error } = await supabase
      .from('scan_windows')
      .update({ status: 'late', late_opened_at: new Date().toISOString() })
      .eq('id', scanWindow.id)
      .select('id, status, window_type')
      .single()

    if (data && !error) {
      playStateChange(true)
      onWindowChange(data as ScanWindow)
    }
  }

  const closeWindow = async () => {
    if (!scanWindow) return
    const { data, error } = await supabase
      .from('scan_windows')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', scanWindow.id)
      .select('id, status, window_type')
      .single()

    if (data && !error) {
      playStateChange(true)
      // Trigger batch absent write before clearing window state
      onBatchAbsent(scanWindow.id)
      onWindowChange(null)
    }
  }

  const statusConfig: Record<WindowStatus, { label: string; color: string; ring: string }> = {
    open: { label: 'OPEN', color: 'bg-green-500', ring: 'ring-green-400' },
    late: { label: 'LATE', color: 'bg-yellow-500', ring: 'ring-yellow-400' },
    closed: { label: 'CLOSED', color: 'bg-gray-500', ring: 'ring-gray-500' },
  }

  const cfg = statusConfig[status]

  return (
    <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-xs uppercase tracking-widest font-semibold">Scan Window</span>
        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-white ${cfg.color} ring-2 ${cfg.ring} ring-opacity-50`}>
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          {cfg.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === 'closed' && !scanWindow && (
          <button
            onClick={openWindow}
            className="flex-1 py-2.5 px-4 bg-green-700 hover:bg-green-600 active:scale-95 text-white text-sm font-semibold rounded-lg transition-all"
          >
            Open Window
          </button>
        )}

        {status === 'open' && (
          <button
            onClick={transitionToLate}
            className="flex-1 py-2.5 px-4 bg-yellow-700 hover:bg-yellow-600 active:scale-95 text-white text-sm font-semibold rounded-lg transition-all"
          >
            Close → Mark Late
          </button>
        )}

        {status === 'late' && (
          <button
            onClick={closeWindow}
            className="flex-1 py-2.5 px-4 bg-red-700 hover:bg-red-600 active:scale-95 text-white text-sm font-semibold rounded-lg transition-all"
          >
            Close Window (Batch Absent)
          </button>
        )}

        {status === 'open' && (
          <button
            onClick={closeWindow}
            className="flex-1 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-sm font-semibold rounded-lg transition-all"
          >
            Force Close
          </button>
        )}
      </div>

      {/* Window type selector (only when no active window) */}
      {!scanWindow && (
        <div className="text-xs text-gray-500 text-center">
          Window type: <span className="text-gray-300 font-semibold">{windowType.replace('_', ' ').toUpperCase()}</span>
        </div>
      )}
    </div>
  )
}
