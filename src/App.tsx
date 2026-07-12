import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'

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
            <div>Admin Dashboard Placeholder</div>
          </ProtectedAdminRoute>
        } 
      />
      
      <Route 
        path="/teacher/*" 
        element={
          <ProtectedTeacherRoute>
            <div>Teacher Dashboard Placeholder</div>
          </ProtectedTeacherRoute>
        } 
      />
      
      <Route path="/scanner" element={<div>Scanner PIN Page Placeholder</div>} />
      
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
