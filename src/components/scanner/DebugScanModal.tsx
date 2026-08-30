import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Bug, CheckCircle2, XCircle, Camera } from 'lucide-react'
import CameraStream from './CameraStream'

interface Student {
  id: string
  full_name: string
  lrn: string
  qr_code: string
  parent_phone: string | null
}

interface DebugScanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  students: Student[]
}

export default function DebugScanModal({ open, onOpenChange, students }: DebugScanModalProps) {
  const [payload, setPayload] = useState('')
  const [result, setResult] = useState<{ found: boolean; message: string; student?: Student } | null>(null)

  const validateCode = (code: string) => {
    if (!code) return
    const student = students.find(s => s.qr_code === code || s.lrn === code)

    if (student) {
      setResult({
        found: true,
        message: 'Valid Student Match Found',
        student
      })
    } else {
      setResult({
        found: false,
        message: 'No student matches this payload in the current section.'
      })
    }
  }

  const handleTest = (e: React.FormEvent) => {
    e.preventDefault()
    validateCode(payload.trim())
  }

  const handleClear = () => {
    setPayload('')
    setResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if(!v) handleClear(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-[var(--sidebar-muted)]" />
            Test / Debug Scan Mode
          </DialogTitle>
          <p className="text-xs text-[var(--sidebar-muted)] mt-1">
            Inspect a QR payload without logging attendance or triggering sounds.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {/* Camera Feed */}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg overflow-hidden flex flex-col relative h-[240px]">
            <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-black/60 rounded text-xs text-white flex items-center gap-1 font-semibold backdrop-blur-sm">
              <Camera className="w-3 h-3" /> Live Camera
            </div>
            <div className="flex-1 w-full h-full [&>div]:h-full [&>div>video]:object-cover [&>div>video]:h-full">
              <CameraStream onScan={(code) => {
                setPayload(code);
                validateCode(code);
              }} active={open} esp32Url={null} />
            </div>
          </div>

          <div className="space-y-4">
            <form onSubmit={handleTest} className="space-y-2">
              <label className="text-xs font-semibold text-[var(--sidebar-muted)] block">
                Raw Payload / LRN (Manual Entry)
              </label>
              <div className="flex gap-2">
                <Input
                  value={payload}
                  onChange={e => setPayload(e.target.value)}
                  placeholder="Paste or scan string here..."
                  autoComplete="off"
                />
                <Button type="submit">Check</Button>
              </div>
            </form>

          {result && (
            <div className={`p-4 border rounded-md ${result.found ? 'bg-[rgba(195,216,152,0.1)] border-[rgba(195,216,152,0.3)]' : 'bg-[rgba(112,22,30,0.1)] border-[rgba(112,22,30,0.3)]'}`}>
              <div className="flex items-start gap-3">
                {result.found ? (
                  <CheckCircle2 className="w-5 h-5 text-[#c3d898] shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-[#f5c0c3] shrink-0 mt-0.5" />
                )}
                <div>
                  <div className={`font-semibold text-sm ${result.found ? 'text-[#c3d898]' : 'text-[#f5c0c3]'}`}>
                    {result.message}
                  </div>
                  {result.student && (
                    <div className="mt-2 text-xs text-[var(--body-text)] space-y-1">
                      <div><span className="text-[var(--sidebar-muted)]">Name:</span> {result.student.full_name}</div>
                      <div><span className="text-[var(--sidebar-muted)]">LRN:</span> {result.student.lrn}</div>
                      <div><span className="text-[var(--sidebar-muted)]">QR Code:</span> {result.student.qr_code}</div>
                    </div>
                  )}
                  {!result.found && (
                    <div className="mt-1 text-xs text-[var(--body-text)] opacity-80 break-all">
                      Payload: {payload}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-[var(--card-border)] mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
