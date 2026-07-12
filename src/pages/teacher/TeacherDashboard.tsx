import { useEffect } from 'react'
import { Routes, Route, useNavigate, Link, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import ScheduleCards from '../../components/teacher/ScheduleCards'
import AttendanceGrid from '../../components/teacher/AttendanceGrid'
import StatsPanel from '../../components/teacher/StatsPanel'
import QrExporter from '../../components/teacher/QrExporter'

export default function TeacherDashboard() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  
  useEffect(() => {
    if (role !== 'teacher') {
      navigate('/login')
    }
  }, [role, navigate])

  const navItems = [
    { name: 'Schedules', path: '/teacher/schedules' },
    { name: 'Attendance Analytics', path: '/teacher/attendance' },
    { name: 'Dashboard Stats', path: '/teacher/stats' },
    { name: 'QR Code Exporter', path: '/teacher/qr-export' }
  ]

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-800">Teacher Portal</h1>
        </div>
        <nav className="mt-6 flex-1">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-6 py-3 text-sm font-medium transition-colors ${
                location.pathname.startsWith(item.path) 
                ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="p-6 border-t">
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-full px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded hover:bg-red-50"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="p-6 bg-white rounded-lg shadow-sm">
            <Routes>
              <Route path="/" element={<div>Welcome to your portal. Select an option from the sidebar.</div>} />
              <Route path="schedules" element={<ScheduleCards />} />
              <Route path="attendance" element={<AttendanceGrid />} />
              <Route path="stats" element={<StatsPanel />} />
              <Route path="qr-export" element={<QrExporter />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  )
}
