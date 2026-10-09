import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { clearTokens, confirmEmailVerification } from '../services/authApi'

const AuthAction = () => {
  const [searchParams] = useSearchParams()
  const { setAuthUser } = useAuth()
  const mode = searchParams.get('mode') || ''
  const oobCode = searchParams.get('oobCode') || ''
  const [status, setStatus] = useState('checking')
  const [message, setMessage] = useState('Checking your secure email link...')

  useEffect(() => {
    if (mode !== 'verifyEmail') return
    let active = true

    const verifyEmail = async () => {
      if (!oobCode) {
        if (active) {
          setStatus('error')
          setMessage('This email-verification link is incomplete.')
        }
        return
      }

      try {
        const result = await confirmEmailVerification(oobCode)
        if (active) {
          clearTokens()
          setAuthUser(null)
          setStatus('success')
          setMessage(result.message || 'Email verified successfully. You can now sign in.')
        }
      } catch (error) {
        if (active) {
          setStatus('error')
          setMessage(error.message || 'This email-verification link is invalid or has expired.')
        }
      }
    }

    verifyEmail()
    return () => { active = false }
  }, [mode, oobCode])

  if (mode === 'resetPassword') {
    return <Navigate to={`/reset-password?${searchParams.toString()}`} replace />
  }

  if (mode !== 'verifyEmail') {
    return (
      <div className="min-h-screen bg-dark px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-red-500/30 bg-card p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-bold text-text-primary">Unsupported email action</h1>
          <p className="mt-3 text-sm text-text-secondary">This link cannot be handled by this page.</p>
          <Link to="/login" className="mt-6 inline-block text-primary hover:text-accent">Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark px-4 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-primary/20 bg-card p-8 text-center shadow-2xl">
        <h1 className="text-3xl font-bold text-primary">Email verification</h1>
        <p className={`mt-5 text-sm ${status === 'error' ? 'text-red-400' : 'text-text-secondary'}`}>{message}</p>
        {status !== 'checking' && (
          <Link to="/login" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 font-semibold text-dark">Go to sign in</Link>
        )}
      </div>
    </div>
  )
}

export default AuthAction
