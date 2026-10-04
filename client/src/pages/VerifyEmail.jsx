import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getCurrentUser, refreshSession, resendVerificationEmail } from '../services/authApi'

const VerifyEmail = () => {
  const { currentUser, setAuthUser, logout } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const checkVerification = async () => {
    setLoading(true)
    setError('')
    try {
      await refreshSession()
      const result = await getCurrentUser()
      if (result.user?.emailVerified) {
        setAuthUser(result.user)
        navigate('/dashboard', { replace: true })
      } else {
        setError('Your email is not verified yet. Open the email link, then try again.')
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    setError('')
    try {
      const result = await resendVerificationEmail()
      setMessage(result.message)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="min-h-screen bg-dark px-4 py-16">
      <div className="mx-auto max-w-lg rounded-3xl border border-primary/20 bg-card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl">✉</div>
        <h1 className="mt-5 text-3xl font-bold text-primary">Verify your email</h1>
        <p className="mt-3 text-text-secondary">We sent a verification link to <span className="text-text-primary">{currentUser?.email}</span>. Verification is required before voice and profile data can be accessed.</p>
        {message && <p className="mt-4 text-sm text-primary">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <button onClick={checkVerification} disabled={loading} className="mt-7 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-dark disabled:opacity-50">{loading ? 'Checking…' : "I've verified my email"}</button>
        <button onClick={resend} className="mt-3 w-full rounded-xl border border-border px-4 py-3 text-text-primary hover:border-primary">Resend email</button>
        <button onClick={logout} className="mt-4 text-sm text-text-secondary hover:text-primary">Sign out</button>
      </div>
    </div>
  )
}

export default VerifyEmail
