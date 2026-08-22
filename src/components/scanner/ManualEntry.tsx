import { useState, useRef, useEffect } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Search } from 'lucide-react'

interface Student {
  id: string
  full_name: string
  lrn: string
  qr_code: string
  parent_phone: string | null
}

interface ManualEntryProps {
  students: Student[]
  onSubmit: (code: string) => void
}

export default function ManualEntry({ students, onSubmit }: ManualEntryProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Filter students based on query (full name or lrn)
  const filtered = query.trim() === '' 
    ? [] 
    : students.filter(s => 
        s.full_name.toLowerCase().includes(query.toLowerCase()) || 
        s.lrn.includes(query)
      ).slice(0, 8) // Limit results

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [wrapperRef])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    onSubmit(query.trim())
    setQuery('')
    setIsOpen(false)
  }

  const handleSelect = (student: Student) => {
    // Pass the qr_code or lrn back to the parent to process
    onSubmit(student.qr_code || student.lrn)
    setQuery('')
    setIsOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sidebar-muted)]" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search Name or LRN..."
            className="pl-9 bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--body-text)]"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="default">Submit</Button>
      </form>

      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md shadow-xl max-h-60 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--row-alt)] border-b border-[var(--card-border)] last:border-0 flex justify-between items-center transition-colors"
            >
              <span className="font-medium text-[var(--body-text)]">{s.full_name}</span>
              <span className="text-xs text-[var(--sidebar-muted)]">{s.lrn}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
