import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { MessageSquare, ShieldAlert, ShieldCheck, RefreshCw, Smartphone, Check, AlertTriangle, Info } from 'lucide-react'

export default function SystemSettings() {
  const [smsEnabled, setSmsEnabled] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'sms_enabled')
        .maybeSingle()

      if (error) throw error

      if (data) {
        setSmsEnabled(data.value === true || data.value === 'true')
        if (data.updated_at) {
          setUpdatedAt(new Date(data.updated_at).toLocaleString('en-PH', {
            dateStyle: 'medium',
            timeStyle: 'short'
          }))
        }
      } else {
        // Initialize if not present
        await supabase
          .from('system_settings')
          .insert({ key: 'sms_enabled', value: true, description: 'Global toggle for attendance SMS' })
        setSmsEnabled(true)
      }
    } catch (err: any) {
      console.error('[SETTINGS] Fetch failed:', err)
      setFeedbackMsg({ type: 'error', text: 'Failed to load system settings from Supabase.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleToggleSms = async () => {
    const nextVal = !smsEnabled
    setSaving(true)
    setFeedbackMsg(null)

    try {
      const nowIso = new Date().toISOString()
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: 'sms_enabled',
          value: nextVal,
          description: 'Global toggle for automated attendance SMS notifications',
          updated_at: nowIso
        }, { onConflict: 'key' })

      if (error) throw error

      setSmsEnabled(nextVal)
      setUpdatedAt(new Date(nowIso).toLocaleString('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }))
      setFeedbackMsg({
        type: 'success',
        text: nextVal 
          ? 'SMS Notifications have been globally ENABLED for all scanners.' 
          : 'SMS Notifications are now BLOCKED globally. No SMS credits will be consumed.'
      })
    } catch (err: any) {
      console.error('[SETTINGS] Update failed:', err)
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to update setting.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--card-border)]">
        <div>
          <h2 className="text-xl font-bold text-[var(--body-text)] flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[var(--primary)]" />
            System & SMS Settings
          </h2>
          <p className="text-xs sm:text-sm text-[var(--sidebar-muted)] mt-1">
            Configure school-wide terminal behavior, SMS dispatch switches, and scanner debug settings.
          </p>
        </div>

        <button
          onClick={fetchSettings}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-[var(--row-alt)] text-[var(--body-text)] hover:bg-[var(--card-border)] active:scale-95 transition-all w-fit"
          title="Refresh Settings"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm animate-in fade-in ${
          feedbackMsg.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
        }`}>
          {feedbackMsg.type === 'success' ? (
            <Check className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Master SMS Control Card */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                smsEnabled
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              }`}>
                {smsEnabled ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {smsEnabled ? 'SMS Service Active' : 'SMS Notifications Blocked (Testing Mode)'}
              </span>
              {updatedAt && (
                <span className="text-[11px] text-[var(--sidebar-muted)]">
                  Updated: {updatedAt}
                </span>
              )}
            </div>

            <h3 className="text-lg font-bold text-[var(--body-text)]">
              Automated Attendance SMS Notifications
            </h3>
            <p className="text-xs md:text-sm text-[var(--sidebar-muted)] leading-relaxed">
              When turned <strong className="text-[var(--body-text)]">OFF</strong>, all QR scans and manual terminal check-ins record attendance normally to the database, but <strong>block all SMS dispatches</strong>. Use this toggle while debugging, calibrating cameras, or performing drills to avoid consuming SMS requests.
            </p>
          </div>

          {/* Big Toggle Switch */}
          <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={smsEnabled}
              disabled={loading || saving}
              onClick={handleToggleSms}
              className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 disabled:opacity-50 ${
                smsEnabled ? 'bg-emerald-500' : 'bg-amber-500/60'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                  smsEnabled ? 'translate-x-9' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-xs font-semibold text-[var(--sidebar-muted)]">
              {saving ? 'Updating...' : smsEnabled ? 'Enabled' : 'Blocked'}
            </span>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-xl flex items-start gap-3 text-xs text-[var(--body-text)]">
          <Info className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">Real-Time Terminal Synchronization</div>
            <div className="text-[var(--sidebar-muted)] leading-relaxed">
              Any change made here propagates to all connected Scanner Kiosks immediately. Terminals display an amber <strong>"SMS Blocked (Admin)"</strong> badge when blocked.
            </div>
          </div>
        </div>
      </div>

      {/* Gateway & Device Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--body-text)]">
            <Smartphone className="w-4 h-4 text-[var(--primary)]" />
            SMS Gateway Configuration
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[var(--card-border)]">
              <span className="text-[var(--sidebar-muted)]">Provider</span>
              <span className="font-semibold text-[var(--body-text)]">httpSMS API</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--card-border)]">
              <span className="text-[var(--sidebar-muted)]">Sender Phone</span>
              <span className="font-mono font-semibold text-[var(--body-text)]">+63 994 915 9434</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--sidebar-muted)]">Target Log Table</span>
              <span className="font-mono text-emerald-500 font-semibold">public.sms_logs</span>
            </div>
          </div>
        </div>

        <div className="p-5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--body-text)]">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            Scanner Testing Recommendations
          </div>
          <p className="text-xs text-[var(--sidebar-muted)] leading-relaxed">
            Always toggle SMS to <strong>Blocked</strong> before testing new student QR codes, ESP32-CAM lens alignment, or mass scanning drills. Switch it back to <strong>Active</strong> when ready for regular school attendance operations.
          </p>
        </div>
      </div>
    </div>
  )
}
