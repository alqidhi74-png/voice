import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import halfLogo from '../assets/hafl_no_background.png'

const Navbar = () => {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()

  const navItems = [
    ...(currentUser ? [] : [{ path: '/', label: 'Home' }]),
    ...(currentUser ? [
      { path: '/enroll', label: 'Enroll' },
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/security', label: 'Security' },
      ...(currentUser?.role === 'admin' ? [{ path: '/admin', label: 'Admin' }] : []),
    ] : []),
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const handleConfirmLogout = async () => {
    await handleLogout()
    setShowLogoutConfirm(false)
  }

  const handleCancelLogout = () => {
    setShowLogoutConfirm(false)
  }

  return (
    <>
      <nav className="bg-dark/80 border-b border-border/50 sticky top-0 z-50 backdrop-blur-md shadow-soft">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3 group">
              <img
                src={halfLogo}
                alt="Voice Identity Shield Logo"
                className="h-10 w-auto object-contain transition-transform group-hover:scale-105 duration-300"
              />
              <span className="text-xl font-heading font-semibold text-primary group-hover:text-accent transition-colors">
                Voice Identity Shield
              </span>
            </Link>

            <div className="hidden md:flex items-center space-x-6">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="relative group px-3 py-2 rounded-xl transition-all duration-300"
                  >
                    <span
                      className={`text-sm font-medium transition-colors relative z-10 ${
                        isActive ? 'text-primary' : 'text-text-secondary group-hover:text-primary'
                      }`}
                    >
                      {item.label}
                    </span>
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 bg-primary/10 rounded-xl"
                        layoutId="navbar-indicator"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    {!isActive && (
                      <span className="absolute inset-0 bg-primary/5 rounded-xl scale-0 group-hover:scale-100 transition-transform origin-center duration-300" />
                    )}
                  </Link>
                )
              })}

              {currentUser ? (
                <div className="flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={() => navigate('/profile')}
                    className="text-sm text-text-secondary hover:text-primary transition-colors"
                  >
                    {currentUser.displayName || currentUser.email}
                  </button>
                  <button
                    onClick={() => setShowLogoutConfirm(true)}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all duration-300 text-sm font-medium"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="px-4 py-2 bg-primary hover:bg-accent text-dark rounded-xl transition-all duration-300 text-sm font-medium"
                >
                  Get Started
                </Link>
              )}
            </div>

            <div className="md:hidden">
              <button className="text-text-primary p-2 rounded-xl hover:bg-card transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-border/60 bg-card/95 p-6 shadow-soft-lg"
          >
            <h3 className="text-xl font-heading font-semibold text-text-primary mb-3">Confirm Logout</h3>
            <p className="text-sm text-text-secondary mb-6">
              Are you sure you want to log out? You will need to sign in again to access your dashboard.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleConfirmLogout}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500/80 text-white font-semibold hover:bg-red-500 transition-all shadow-soft"
              >
                Log Out
              </button>
              <button
                onClick={handleCancelLogout}
                className="flex-1 px-4 py-3 rounded-xl border border-border text-text-primary hover:border-primary hover:bg-dark transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}

export default Navbar
