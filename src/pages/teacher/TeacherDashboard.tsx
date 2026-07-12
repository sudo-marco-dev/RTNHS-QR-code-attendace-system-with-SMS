import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, NavLink } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import ScheduleCards from '../../components/teacher/ScheduleCards'
import AttendanceGrid from '../../components/teacher/AttendanceGrid'
import StatsPanel from '../../components/teacher/StatsPanel'
import QrExporter from '../../components/teacher/QrExporter'
import { Calendar, BarChart3, LineChart, QrCode, LogOut, User, BookOpen } from 'lucide-react'
import { ThemeToggle } from '../../components/ui/ThemeToggle'

export default function TeacherDashboard() {
  const { role, user } = useAuth()
  const navigate = useNavigate()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [teacherName, setTeacherName] = useState('')

  useEffect(() => {
    if (role !== 'teacher') { navigate('/login'); return }

    const fetchName = async () => {
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      if (data) setTeacherName(data.full_name)
    }
    fetchName()
  }, [role, user, navigate])

  const navItems = [
    { name: 'Schedules', path: '/teacher/schedules', icon: Calendar },
    { name: 'Attendance Analytics', path: '/teacher/attendance', icon: BarChart3 },
    { name: 'Dashboard Stats', path: '/teacher/stats', icon: LineChart },
    { name: 'QR Code Exporter', path: '/teacher/qr-export', icon: QrCode },
  ]

  const SidebarContent = () => (
    <div style={{
      width: '100%',
      background: 'var(--sidebar-bg)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    }}>
      {/* Brand header */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '0.5px solid var(--sidebar-border)' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sidebar-text)' }}>
          Teacher Portal
        </div>
        <div style={{ fontSize: 11, color: 'var(--sidebar-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <User className="w-3 h-3" /> {teacherName || 'Loading...'}
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ padding: '10px', flex: 1 }}>
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setIsMobileOpen(false)}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 10px',
              borderRadius: 7,
              fontSize: 13,
              marginBottom: 2,
              textDecoration: 'none',
              borderLeft: isActive ? '2px solid var(--sidebar-active-border)' : '2px solid transparent',
              background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
              color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-muted)',
              fontWeight: isActive ? 500 : 400,
            })}
          >
            <item.icon className="w-4 h-4 mr-1" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Footer with theme toggle */}
      <div style={{
        padding: '12px 18px',
        borderTop: '0.5px solid var(--sidebar-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button onClick={() => supabase.auth.signOut()} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: 'var(--sidebar-muted)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </button>
        <ThemeToggle />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--page-bg)' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[210px] flex-col shrink-0 border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[210px] flex flex-col bg-[var(--sidebar-bg)] shadow-2xl md:hidden border-r border-[var(--sidebar-border)]">
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Top Bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] shrink-0">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="p-2 rounded-lg text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)]"
            aria-label="Open sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--sidebar-text)' }}>Teacher Portal</span>
          <div className="w-10" />
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8">
            <div style={{
              background: 'var(--card-bg)',
              border: '0.5px solid var(--card-border)',
              borderRadius: 10,
              padding: '24px',
            }}>
              <Routes>
                <Route path="/" element={
                  <div className="py-12 text-center flex flex-col items-center">
                    <BookOpen className="w-16 h-16 mb-4 text-[var(--sidebar-muted)]" />
                    <h3 style={{ fontSize: 18, fontWeight: 500, color: 'var(--page-title)' }}>Welcome to Your Teacher Portal</h3>
                    <p style={{ fontSize: 12, color: 'var(--page-sub)', marginTop: 4 }}>Select an option from the sidebar to view your schedule or attendance data.</p>
                  </div>
                } />
                <Route path="schedules" element={<ScheduleCards />} />
                <Route path="attendance" element={<AttendanceGrid />} />
                <Route path="stats" element={<StatsPanel />} />
                <Route path="qr-export" element={<QrExporter />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
