import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ProtectedRoute from './components/ProtectedRoute'
import PageTransition from './components/PageTransition'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Enroll from './pages/Enroll'
import Verify from './pages/Verify'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import AuthAction from './pages/AuthAction'
import VerifyEmail from './pages/VerifyEmail'
import Security from './pages/Security'
import Admin from './pages/Admin'
import Feedback from './pages/Feedback'
import LiveNotifications from './components/LiveNotifications'

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route 
          path="/" 
          element={
            <PageTransition>
              <Home />
            </PageTransition>
          } 
        />
        <Route 
          path="/login" 
          element={
            <PageTransition>
              <Login />
            </PageTransition>
          } 
        />
        <Route 
          path="/register" 
          element={
            <PageTransition>
              <Register />
            </PageTransition>
          } 
        />
        <Route path="/forgot-password" element={<PageTransition><ForgotPassword /></PageTransition>} />
        <Route path="/reset-password" element={<PageTransition><ResetPassword /></PageTransition>} />
        <Route path="/auth/action" element={<PageTransition><AuthAction /></PageTransition>} />
        <Route path="/verify-email" element={<ProtectedRoute requireVerified={false}><PageTransition><VerifyEmail /></PageTransition></ProtectedRoute>} />
        <Route path="/security" element={<ProtectedRoute disallowRole="admin"><PageTransition><Security /></PageTransition></ProtectedRoute>} />
        <Route path="/feedback" element={<ProtectedRoute disallowRole="admin"><PageTransition><Feedback /></PageTransition></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute role="admin"><PageTransition><Admin /></PageTransition></ProtectedRoute>} />
        <Route 
          path="/enroll" 
          element={
            <ProtectedRoute disallowRole="admin">
              <PageTransition>
                <Enroll />
              </PageTransition>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/verify" 
          element={
            <ProtectedRoute disallowRole="admin">
              <PageTransition>
                <Verify />
              </PageTransition>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute disallowRole="admin">
              <PageTransition>
                <Dashboard />
              </PageTransition>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute disallowRole="admin">
              <PageTransition>
                <Profile />
              </PageTransition>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </AnimatePresence>
  )
}

function AppLayout() {
  const location = useLocation()
  const isAdminArea = location.pathname.startsWith('/admin')

  return (
    <div className="min-h-screen flex flex-col bg-dark">
      {!isAdminArea && <Navbar />}
      <main className={`flex-grow ${isAdminArea ? 'bg-[#f6f8fb]' : 'bg-dark'}`}>
        <AnimatedRoutes />
      </main>
      {!isAdminArea && <Footer />}
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <LiveNotifications />
        <Router>
          <AppLayout />
        </Router>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
