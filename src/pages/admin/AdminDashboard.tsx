import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, NavLink } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import SectionManager from '../../components/admin/SectionManager'
import StudentImport from '../../components/admin/StudentImport'
import StudentManager from '../../components/admin/StudentManager'
import TeacherManager from '../../components/admin/TeacherManager'
import SubjectManager from '../../components/admin/SubjectManager'
import ScheduleManager from '../../components/admin/ScheduleManager'
import QrExporter from '../../components/teacher/QrExporter'
import AttendanceExporter from '../../components/admin/AttendanceExporter'
import PhotoVerification from './PhotoVerification'

export default function AdminDashboard() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [stats, setStats] = useState({ students: 0, sections: 0, teachers: 0 })

  useEffect(() => {
    if (role !== 'admin') { navigate('/login'); return }

    const fetchStats = async () => {
      try {
        const [s1, s2, s3] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }),
          supabase.from('sections').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
        ])
        setStats({
          students: s1.count ?? 0,
          sections: s2.count ?? 0,
          teachers: s3.count ?? 0,
        })
      } catch {
        setError('Failed to load dashboard stats. Check your connection.')
      }
    }

    fetchStats()
  }, [role, navigate])

  const navItems = [
    { name: 'Sections & PINs', path: '/admin/sections' },
    { name: 'Import Students', path: '/admin/students/import' },
    { name: 'Manage Students', path: '/admin/students/manage' },
    { name: 'Teachers', path: '/admin/teachers' },
    { name: 'Subjects', path: '/admin/subjects' },
    { name: 'Schedules', path: '/admin/schedules' },
    { name: 'Export QR', path: '/admin/qr-export' },
    { name: 'Export Attendance', path: '/admin/attendance-export' },
    { name: 'Photo Verification', path: '/admin/photo-verify' },
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
          RTNHS Admin
        </div>
        <div style={{ fontSize: 11, color: 'var(--sidebar-muted)', marginTop: 2 }}>
          Attendance system
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
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--sidebar-text)' }}>RTNHS Admin</span>
          <div className="w-10" />
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              {[
                { label: 'Total Students', value: stats.students },
                { label: 'Active Sections', value: stats.sections },
                { label: 'Registered Teachers', value: stats.teachers },
              ].map(s => (
                <div key={s.label} className="bg-[var(--stat-secondary-bg)] border border-[var(--card-border)] rounded-xl p-3 md:p-4">
                  <div className="text-xl md:text-3xl font-medium text-[var(--stat-secondary-num)]">
                    {s.value}
                  </div>
                  <div className="text-[10px] md:text-xs text-[var(--stat-secondary-lbl)] mt-1 md:mt-2 leading-tight">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Dynamic Panel */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 md:p-6">
              <Routes>
                <Route path="/" element={
                  <div className="py-12 text-center flex flex-col items-center">
                    <LayoutDashboard className="w-16 h-16 mb-4 text-[var(--sidebar-muted)]" />
                    <h3 style={{ fontSize: 18, fontWeight: 500, color: 'var(--page-title)' }}>Welcome to the Admin Dashboard</h3>
                    <p style={{ fontSize: 12, color: 'var(--page-sub)', marginTop: 4 }}>Select an option from the sidebar to get started.</p>
                  </div>
                } />
                <Route path="sections" element={<SectionManager />} />
                <Route path="students/import" element={<StudentImport />} />
                <Route path="students/manage" element={<StudentManager />} />
                <Route path="teachers" element={<TeacherManager />} />
                <Route path="subjects" element={<SubjectManager />} />
                <Route path="schedules" element={<ScheduleManager />} />
                <Route path="qr-export" element={<QrExporter />} />
                <Route path="attendance-export" element={<AttendanceExporter />} />
                <Route path="photo-verify" element={<PhotoVerification />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
