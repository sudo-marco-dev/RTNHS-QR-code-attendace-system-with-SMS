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
  
  const [stats, setStats] = useState({
    students: 0,
    sections: 0,
    teachers: 0
  })

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/login')
      return
    }
    
    // Fetch stats
    const fetchStats = async () => {
      const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true })
      const { count: sectionCount } = await supabase.from('sections').select('*', { count: 'exact', head: true })
      const { count: teacherCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher')
      
      setStats({
        students: studentCount || 0,
        sections: sectionCount || 0,
        teachers: teacherCount || 0
      })
    }
    
    fetchStats()
  }, [role, navigate])

  const navItems = [
    { name: 'Sections & PINs', path: '/admin/sections' },
    { name: 'Student Roster', path: '/admin/students' },
    { name: 'Teachers', path: '/admin/teachers' },
    { name: 'Subjects', path: '/admin/subjects' },
    { name: 'Schedules', path: '/admin/schedules' }
  ]

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r shadow-sm">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-800">RTNHS Admin</h1>
        </div>
        <nav className="mt-6">
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
        <div className="absolute bottom-0 w-64 p-6 border-t">
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
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 uppercase">Total Students</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.students}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 uppercase">Active Sections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.sections}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 uppercase">Registered Teachers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.teachers}</div>
              </CardContent>
            </Card>
          </div>

          {/* Dynamic Content Area */}
          <div className="p-6 bg-white rounded-lg shadow-sm">
            <Routes>
              <Route path="/" element={<div>Welcome to the Admin Dashboard. Select an option from the sidebar.</div>} />
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
  )
}
