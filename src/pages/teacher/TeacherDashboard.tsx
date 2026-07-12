import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, Link, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import ScheduleCards from '../../components/teacher/ScheduleCards'
import AttendanceGrid from '../../components/teacher/AttendanceGrid'
import StatsPanel from '../../components/teacher/StatsPanel'
import QrExporter from '../../components/teacher/QrExporter'

export default function TeacherDashboard() {
  const { role, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
    { name: '📅 Schedules', path: '/teacher/schedules' },
    { name: '📊 Attendance Analytics', path: '/teacher/attendance' },
    { name: '📈 Dashboard Stats', path: '/teacher/stats' },
    { name: '🔲 QR Code Exporter', path: '/teacher/qr-export' },
  ]

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-800">Teacher Portal</h1>
        {teacherName && (
          <p className="text-sm text-gray-500 mt-0.5 truncate">👤 {teacherName}</p>
        )}
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
          <span className="font-bold text-gray-800">Teacher Portal</span>
          <div className="w-10" />
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <Routes>
                <Route path="/" element={
                  <div className="py-12 text-center text-gray-400">
                    <div className="text-5xl mb-4">📚</div>
                    <h3 className="text-lg font-semibold text-gray-600">Welcome to Your Teacher Portal</h3>
                    <p className="text-sm mt-1">Select an option from the sidebar to view your schedule or attendance data.</p>
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
