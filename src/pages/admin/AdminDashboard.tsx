import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, Link, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import SectionManager from '../../components/admin/SectionManager'
import StudentImport from '../../components/admin/StudentImport'
import TeacherManager from '../../components/admin/TeacherManager'
import SubjectManager from '../../components/admin/SubjectManager'
import ScheduleManager from '../../components/admin/ScheduleManager'

export default function AdminDashboard() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
    { name: 'Student Roster', path: '/admin/students' },
    { name: 'Teachers', path: '/admin/teachers' },
    { name: 'Subjects', path: '/admin/subjects' },
    { name: 'Schedules', path: '/admin/schedules' },
  ]

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">RTNHS Admin</h1>
        <p className="text-xs text-gray-500 mt-0.5">Attendance System</p>
      </div>
      <nav className="flex-1 mt-4">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setIsMobileOpen(false)}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              location.pathname.startsWith(item.path)
                ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {item.name}
          </Link>
        ))}
      </nav>
      <div className="p-6 border-t border-gray-100">
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r shadow-sm shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-white shadow-2xl md:hidden">
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Top Bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b shadow-sm shrink-0">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="Open sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-gray-800">RTNHS Admin</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Total Students', value: stats.students, color: 'text-blue-600' },
                { label: 'Active Sections', value: stats.sections, color: 'text-green-600' },
                { label: 'Registered Teachers', value: stats.teachers, color: 'text-purple-600' },
              ].map(s => (
                <Card key={s.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Dynamic Panel */}
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <Routes>
                <Route path="/" element={
                  <div className="py-12 text-center text-gray-400">
                    <div className="text-5xl mb-4">👋</div>
                    <h3 className="text-lg font-semibold text-gray-600">Welcome to the Admin Dashboard</h3>
                    <p className="text-sm mt-1">Select an option from the sidebar to get started.</p>
                  </div>
                } />
                <Route path="sections" element={<SectionManager />} />
                <Route path="students" element={<StudentImport />} />
                <Route path="teachers" element={<TeacherManager />} />
                <Route path="subjects" element={<SubjectManager />} />
                <Route path="schedules" element={<ScheduleManager />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
