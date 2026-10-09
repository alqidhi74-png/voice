import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getCurrentUser, refreshSession, resendVerificationEmail } from '../services/authApi'

const VerifyEmail = () => {
  const { currentUser, setAuthUser, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const checkingRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState(
    location.state?.verificationEmailSent === false
      ? ''
      : 'Check your inbox and spam folder for the verification email.'
  )
  const [error, setError] = useState('')

  const checkVerification = useCallback(async ({ quiet = false } = {}) => {
    if (checkingRef.current) return
    checkingRef.current = true
    setLoading(true)
    if (!quiet) setError('')

    try {
      await refreshSession()
      const result = await getCurrentUser()
      if (result.user?.emailVerified) {
        setAuthUser(result.user)
        navigate('/dashboard', { replace: true })
      } else if (!quiet) {
        setError('Your email is not verified yet. Open the email link, then try again.')
      }
    } catch (requestError) {
      if (!quiet) setError(requestError.message)
    } finally {
      checkingRef.current = false
      setLoading(false)
    }
  }, [navigate, setAuthUser])

  useEffect(() => {
    if (searchParams.get('verified') === '1') checkVerification()
  }, [checkVerification, searchParams])

  useEffect(() => {
    const checkAfterReturning = () => {
      if (document.visibilityState === 'visible') checkVerification({ quiet: true })
    }
    window.addEventListener('focus', checkAfterReturning)
    document.addEventListener('visibilitychange', checkAfterReturning)
    return () => {
      window.removeEventListener('focus', checkAfterReturning)
      document.removeEventListener('visibilitychange', checkAfterReturning)
    }
  }, [checkVerification])

  const resend = async () => {
    setError('')
    setMessage('')
    setResending(true)
    try {
      const result = await resendVerificationEmail()
      setMessage(result.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark px-4 py-16">
      <div className="mx-auto max-w-lg rounded-3xl border border-primary/20 bg-card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl">✉</div>
        <h1 className="mt-5 text-3xl font-bold text-primary">Verify your email</h1>
        <p className="mt-3 text-text-secondary">
          {location.state?.verificationEmailSent === false
            ? 'We could not send the first verification email. Use the button below to try again for '
            : 'We sent a verification link to '}
          <span className="text-text-primary">{currentUser?.email}</span>. Verification is required before voice and profile data can be accessed.
        </p>
        {message && <p className="mt-4 text-sm text-primary">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <button onClick={() => checkVerification()} disabled={loading || resending} className="mt-7 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-dark disabled:opacity-50">
          {loading ? 'Checking...' : "I've verified my email"}
        </button>
        <button onClick={resend} disabled={loading || resending} className="mt-3 w-full rounded-xl border border-border px-4 py-3 text-text-primary hover:border-primary disabled:opacity-50">
          {resending ? 'Sending...' : 'Resend email'}
        </button>
        <button onClick={logout} className="mt-4 text-sm text-text-secondary hover:text-primary">Sign out</button>
      </div>
    </div>
  )
}

export default VerifyEmail
