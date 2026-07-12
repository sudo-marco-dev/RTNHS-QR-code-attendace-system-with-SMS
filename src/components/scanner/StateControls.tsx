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

  const statusConfig: Record<WindowStatus, { label: string; bg: string }> = {
    open: { label: 'OPEN', bg: 'bg-forest-mid border border-[rgba(195,216,152,0.3)] text-tea' },
    late: { label: 'LATE', bg: 'bg-[#b35c00] border border-[#ffb366] text-[#fff3e0]' },
    closed: { label: 'CLOSED', bg: 'bg-transparent border border-[rgba(195,216,152,0.2)] text-muted-on-dark' },
  }

  const cfg = statusConfig[status]

  return (
    <div className="p-4 bg-[rgba(195,216,152,0.08)] border border-[rgba(195,216,152,0.2)] rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-on-dark text-xs uppercase tracking-widest font-semibold">Scan Window</span>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${cfg.bg}`}>
          {status !== 'closed' && <span className="w-2 h-2 rounded-full bg-sage animate-pulse mr-2" />}
          {cfg.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === 'closed' && !scanWindow && (
          <button
            onClick={openWindow}
            className="flex-1 py-2.5 px-4 bg-forest text-tea hover:bg-forest-mid active:scale-95 text-sm font-semibold rounded-lg transition-all"
          >
            Open Window
          </button>
        )}

        {status === 'open' && (
          <button
            onClick={transitionToLate}
            className="flex-1 py-2.5 px-4 bg-[#b35c00] text-[#fff3e0] hover:bg-[#cc6a00] active:scale-95 text-sm font-semibold rounded-lg transition-all"
          >
            Close → Mark Late
          </button>
        )}

        {status === 'late' && (
          <button
            onClick={closeWindow}
            className="flex-1 py-2.5 px-4 bg-burgundy text-[#f5c0c3] hover:bg-[#8b1a1a] active:scale-95 text-sm font-semibold rounded-lg transition-all"
          >
            Close Window (Batch Absent)
          </button>
        )}

        {status === 'open' && (
          <button
            onClick={closeWindow}
            className="flex-1 py-2.5 px-4 bg-burgundy text-[#f5c0c3] hover:bg-[#8b1a1a] active:scale-95 text-sm font-semibold rounded-lg transition-all"
          >
            Force Close
          </button>
        )}
      </div>

      {/* Window type selector (only when no active window) */}
      {!scanWindow && (
        <div className="text-xs text-muted-on-dark text-center">
          Window type: <span className="text-tea font-semibold">{windowType.replace('_', ' ').toUpperCase()}</span>
        </div>
      )}
    </div>
  )
}
