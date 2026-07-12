import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import AdminDashboard from './pages/admin/AdminDashboard'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import ScannerTerminal from './pages/scanner/ScannerTerminal'

// Protected Route Components
const ProtectedAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { role, loading } = useAuth()
  if (loading) return <div>Loading...</div>
  if (role !== 'admin') return <Navigate to="/login" replace />
  return <>{children}</>
}

const ProtectedTeacherRoute = ({ children }: { children: React.ReactNode }) => {
  const { role, loading } = useAuth()
  if (loading) return <div>Loading...</div>
  if (role !== 'teacher') return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route 
        path="/admin/*" 
        element={
          <ProtectedAdminRoute>
            <AdminDashboard />
          </ProtectedAdminRoute>
        } 
      />
      
      <Route 
        path="/teacher/*" 
        element={
          <ProtectedTeacherRoute>
            <TeacherDashboard />
          </ProtectedTeacherRoute>
        } 
      />
      
      <Route path="/scanner" element={<ScannerTerminal />} />
      
      {/* Default redirect to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  )
}

export default App
