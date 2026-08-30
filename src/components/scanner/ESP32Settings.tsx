import { useState, useEffect, useCallback, useRef } from 'react'
import { Wifi, WifiOff, Loader2, Settings, Check, X, Zap } from 'lucide-react'

interface Props {
  onConnectionChange: (url: string | null) => void
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const STORAGE_KEY = 'rtnhs_esp32_url'
const MDNS_URL = 'http://rtnhs-scanner.local'

interface StatusResponse {
  status: string
  ip: string
  hostname: string
  uptime: number
  rssi: number
  flash: boolean
}

export default function ESP32Settings({ onConnectionChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [deviceInfo, setDeviceInfo] = useState<StatusResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [flashOn, setFlashOn] = useState(false)
  const checkInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Build the full URL from an IP or hostname input
  const buildUrl = (input: string): string => {
    let url = input.trim()
    if (!url) return ''
    // If user typed just an IP like "192.168.1.105", add http://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url
    }
    // Remove trailing slash
    url = url.replace(/\/+$/, '')
    return url
  }

  // Test connection to ESP32
  const testConnection = useCallback(async (url: string): Promise<boolean> => {
    if (!url) return false
    setStatus('connecting')
    setErrorMsg(null)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(`${url}/status`, {
        signal: controller.signal,
        mode: 'cors',
      })
      clearTimeout(timeout)

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data: StatusResponse = await response.json()
      if (data.status === 'ok') {
        setStatus('connected')
        setDeviceInfo(data)
        setFlashOn(data.flash)
        setActiveUrl(url)
        onConnectionChange(url)

        // Save to localStorage
        localStorage.setItem(STORAGE_KEY, url)
        return true
      }
      throw new Error('Invalid status response')
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Connection timed out'
        : (err as Error).message || 'Connection failed'
      setStatus('error')
      setErrorMsg(msg)
      setDeviceInfo(null)
      setActiveUrl(null)
      onConnectionChange(null)
      return false
    }
  }, [onConnectionChange])

  // Auto-discover on mount: try saved URL first, then mDNS
  useEffect(() => {
    const discover = async () => {
      const saved = localStorage.getItem(STORAGE_KEY)

      // Try saved URL first
      if (saved) {
        setInputValue(saved.replace(/^https?:\/\//, ''))
        const ok = await testConnection(saved)
        if (ok) return
      }

      // Try mDNS
      setInputValue('rtnhs-scanner.local')
      const ok = await testConnection(MDNS_URL)
      if (!ok) {
        setStatus('disconnected')
        setErrorMsg(null)
        setExpanded(true) // Show settings if auto-discover failed
      }
    }
    discover()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const failedPings = useRef(0)

  // Periodic health check every 15 seconds when connected
  useEffect(() => {
    if (status === 'connected' && activeUrl) {
      failedPings.current = 0 // reset on connect
      checkInterval.current = setInterval(async () => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 4000)
          const res = await fetch(`${activeUrl}/status`, { signal: controller.signal, mode: 'cors' })
          clearTimeout(timeout)
          if (!res.ok) throw new Error()
          const data = await res.json()
          setDeviceInfo(data)
          setFlashOn(data.flash)
          failedPings.current = 0 // success, reset counter
        } catch {
          failedPings.current += 1
          console.warn(`[ESP32] Health check failed (${failedPings.current}/3)`)
          if (failedPings.current >= 3) {
            setStatus('error')
            setErrorMsg('Connection lost after multiple retries')
            setDeviceInfo(null)
            setActiveUrl(null)
            onConnectionChange(null)
          }
        }
      }, 15000)
    }

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current)
    }
  }, [status, activeUrl, onConnectionChange])

  const handleConnect = async () => {
    const url = buildUrl(inputValue)
    if (!url) return
    await testConnection(url)
  }

  const handleDisconnect = () => {
    setStatus('disconnected')
    setDeviceInfo(null)
    setActiveUrl(null)
    setErrorMsg(null)
    onConnectionChange(null)
    if (checkInterval.current) clearInterval(checkInterval.current)
  }

  const toggleFlash = async () => {
    if (!activeUrl) return
    try {
      const res = await fetch(`${activeUrl}/flash`, { mode: 'cors' })
      if (res.ok) {
        const data = await res.json()
        setFlashOn(data.flash)
      }
    } catch { /* ignore */ }
  }

  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: 'text-[var(--sidebar-muted)]',
    connecting: 'text-amber-400',
    connected: 'text-emerald-400',
    error: 'text-red-400',
  }

  const statusIcons: Record<ConnectionStatus, React.ReactNode> = {
    disconnected: <WifiOff className="w-4 h-4" />,
    connecting: <Loader2 className="w-4 h-4 animate-spin" />,
    connected: <Wifi className="w-4 h-4" />,
    error: <WifiOff className="w-4 h-4" />,
  }

  const statusText: Record<ConnectionStatus, string> = {
    disconnected: 'ESP32-CAM Not Connected',
    connecting: 'Connecting...',
    connected: `ESP32-CAM Connected`,
    error: 'Connection Failed',
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--row-alt)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`${statusColors[status]}`}>
            {statusIcons[status]}
          </div>
          <div className="text-left">
            <div className={`text-sm font-semibold ${statusColors[status]}`}>
              {statusText[status]}
            </div>
            {status === 'connected' && deviceInfo && (
              <div className="text-xs text-[var(--sidebar-muted)] mt-0.5">
                {deviceInfo.ip} · Signal: {deviceInfo.rssi}dBm · Up: {Math.floor(deviceInfo.uptime / 60)}m
              </div>
            )}
            {status === 'error' && errorMsg && (
              <div className="text-xs text-red-400 mt-0.5">{errorMsg}</div>
            )}
          </div>
        </div>
        <Settings className={`w-4 h-4 text-[var(--sidebar-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded settings panel */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--card-border)]">
          <div className="pt-3">
            <label className="block text-xs uppercase tracking-widest text-[var(--sidebar-muted)] font-semibold mb-2">
              ESP32-CAM Address
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="e.g. 192.168.1.105 or rtnhs-scanner.local"
                className="flex-1 px-3 py-2 bg-[var(--row-alt)] border border-[var(--card-border)] rounded-lg text-sm text-[var(--body-text)] placeholder:text-[var(--sidebar-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
              {status === 'connected' ? (
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-2 bg-red-600/20 border border-red-600/40 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-600/30 transition-colors flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={status === 'connecting' || !inputValue.trim()}
                  className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                >
                  {status === 'connecting' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* Flash toggle (only when connected) */}
          {status === 'connected' && (
            <div className="flex items-center justify-between pt-1">
              <div className="text-sm text-[var(--body-text)]">
                <span className="font-semibold">Flash LED</span>
                <span className="text-xs text-[var(--sidebar-muted)] ml-2">Toggle onboard light</span>
              </div>
              <button
                type="button"
                onClick={toggleFlash}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  flashOn
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-[var(--row-alt)] text-[var(--sidebar-muted)] border border-[var(--card-border)]'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                {flashOn ? 'ON' : 'OFF'}
              </button>
            </div>
          )}

          {/* Help text */}
          <p className="text-xs text-[var(--sidebar-muted)] leading-relaxed pt-1">
            Enter the ESP32-CAM's IP address or hostname. The device auto-broadcasts as{' '}
            <code className="text-[var(--body-text)] bg-[var(--row-alt)] px-1 py-0.5 rounded">rtnhs-scanner.local</code>{' '}
            on your network. If that doesn't work (common on Android), check the device's IP from your router or Serial Monitor.
          </p>
        </div>
      )}
    </div>
  )
}
