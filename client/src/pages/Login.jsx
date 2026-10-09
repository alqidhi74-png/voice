import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { completeMfaLogin, handleGoogleOAuth } from '../services/authApi'
import { signInWithGoogle as googleSignIn } from '../services/oauth'
import LightRays from '../components/LightRays'

const Login = () => {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState({ google: false })
  const [mfaChallenge, setMfaChallenge] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const { login, currentUser, checkAuth, setAuthUser } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const passwordResetSucceeded = searchParams.get('passwordReset') === 'success'

  // Redirect to dashboard if user is already authenticated (e.g., after OAuth redirect)
  useEffect(() => {
    if (currentUser) {
      const destination = currentUser.emailVerified
        ? currentUser.role === 'admin' ? '/admin' : '/dashboard'
        : '/verify-email'
      navigate(destination, { replace: true })
    }
  }, [currentUser, navigate])

  useEffect(() => {
    if (error) {
      showToast(error, { type: 'error' })
    }
  }, [error, showToast])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = mfaChallenge
      ? await completeMfaLogin(mfaChallenge, mfaCode)
      : await login(identifier, password)
    
    if (result.success) {
      setAuthUser?.(result.user)
      const destination = result.user?.emailVerified === false
        ? '/verify-email'
        : result.user?.role === 'admin' ? '/admin' : '/dashboard'
      navigate(destination)
    } else if (result.mfaRequired) {
      setMfaChallenge(result.challengeToken)
      setError('')
    } else {
      setError(result.error || 'Failed to log in')
    }
    
    setLoading(false)
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setSocialLoading(prev => ({ ...prev, google: true }))
    
    try {
      const result = await googleSignIn()
      
      if (result.success && result.idToken && result.user) {
        // Send Firebase ID token to backend
        const oauthResult = await handleGoogleOAuth(result.idToken, result.user)
        
        if (oauthResult.success) {
          setAuthUser?.(oauthResult.user)
          await checkAuth?.()
          navigate(oauthResult.user?.role === 'admin' ? '/admin' : '/dashboard')
        } else {
          setError(oauthResult.error || 'Failed to sign in with Google')
        }
      } else {
        setError(result.error || 'Failed to sign in with Google')
      }
    } catch (error) {
      setError(error.message || 'Failed to sign in with Google')
    } finally {
      setSocialLoading(prev => ({ ...prev, google: false }))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark py-12 px-4 sm:px-6 lg:px-8 relative">
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
        <LightRays
          raysOrigin="top-center"
          raysColor="#00ffff"
          raysSpeed={1.5}
          lightSpread={0.8}
          rayLength={1.2}
          followMouse={true}
          mouseInfluence={0.1}
          noiseAmount={0.1}
          distortion={0.05}
          className="custom-rays"
        />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full space-y-8 relative z-10"
      >
        <div className="bg-card/80 backdrop-blur-xl rounded-3xl shadow-2xl p-10 border border-primary/20 relative overflow-hidden">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none"></div>
          
          <div className="relative">
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="text-4xl font-heading font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-3">
                  Welcome Back
                </h2>
                <p className="text-text-secondary text-base">
                  Sign in to protect your voice identity
                </p>
              </motion.div>
            </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2 backdrop-blur-sm"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </motion.div>
            )}

            {passwordResetSucceeded && !error && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-text-primary">
                Your password was reset successfully. Sign in with your email or username and new password.
              </div>
            )}

            {!mfaChallenge ? <div className="space-y-5">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <label htmlFor="identifier" className="block text-sm font-semibold text-text-primary mb-2.5">
                  Email or Username
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-dark/60 border border-border/50 rounded-xl text-text-primary placeholder-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-300 hover:border-primary/30"
                    placeholder="you@example.com or username"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <label htmlFor="password" className="block text-sm font-semibold text-text-primary mb-2.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3.5 bg-dark/60 border border-border/50 rounded-xl text-text-primary placeholder-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-300 hover:border-primary/30"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-text-secondary transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.7 10.7 0 0112 4c4.5 0 8.3 2.9 9.5 7a10.6 10.6 0 01-2.1 3.8M6.2 6.2A10.7 10.7 0 002.5 11c1.2 4.1 5 7 9.5 7 1.4 0 2.7-.3 3.8-.7" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.5 12C3.8 7.9 7.5 5 12 5s8.2 2.9 9.5 7c-1.3 4.1-5 7-9.5 7s-8.2-2.9-9.5-7z" />
                        <circle cx="12" cy="12" r="3" strokeWidth={2} />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="mt-2 text-right">
                  <Link to="/forgot-password" state={{ identifier }} className="text-xs text-primary hover:text-accent">
                    Forgot password?
                  </Link>
                </div>
              </motion.div>
            </div> : (
              <div>
                <label htmlFor="mfaCode" className="block text-sm font-semibold text-text-primary mb-2.5">
                  Authenticator code
                </label>
                <p className="mb-3 text-xs text-text-secondary">Enter the 6-digit code from your authenticator app.</p>
                <input
                  id="mfaCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-border/50 bg-dark/60 px-4 py-3.5 text-center text-2xl tracking-[0.5em] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="000000"
                />
                <button type="button" className="mt-3 text-xs text-text-secondary hover:text-primary" onClick={() => { setMfaChallenge(''); setMfaCode('') }}>
                  Back to password login
                </button>
              </div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-dark font-bold py-4 px-4 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg shadow-primary/20 hover:shadow-primary/30 relative overflow-hidden group"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing in...
                    </>
                  ) : (
                    <>
                      {mfaChallenge ? 'Verify code' : 'Sign In'}
                      <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-accent to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </motion.div>

            {/* Divider */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="relative my-6"
            >
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-card/80 text-text-secondary/70 font-medium">Or continue with</span>
              </div>
            </motion.div>

            {/* Social Sign-in Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="grid grid-cols-1"
            >
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={socialLoading.google || loading}
                className="flex items-center justify-center gap-2.5 px-4 py-3 bg-dark/60 hover:bg-dark/80 border border-border/50 hover:border-primary/30 rounded-xl text-text-primary font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {socialLoading.google ? (
                  <div className="w-5 h-5 border-2 border-text-secondary border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span className="text-sm">Google</span>
                  </>
                )}
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-center pt-2"
            >
              <p className="text-text-secondary text-sm">
                Don't have an account?{' '}
                <Link
                  to="/register"
                  className="text-primary hover:text-accent font-semibold transition-colors underline-offset-4 hover:underline"
                >
                  Sign up
                </Link>
              </p>
            </motion.div>
          </form>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Login
