import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PasswordStrength from '../components/PasswordStrength'
import { useAuth } from '../contexts/AuthContext'
import { clearTokens, confirmPasswordReset, verifyPasswordResetCode } from '../services/authApi'
import { evaluatePassword } from '../utils/passwordPolicy'

const ResetPassword = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setAuthUser } = useAuth()
  const oobCode = searchParams.get('oobCode') || ''
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const verifyCode = async () => {
      if (!oobCode) {
        if (active) {
          setError('This password-reset link is incomplete. Request a new link.')
          setChecking(false)
        }
        return
      }

      try {
        const result = await verifyPasswordResetCode(oobCode)
        if (active) setEmail(result.data?.email || '')
      } catch (requestError) {
        if (active) setError(requestError.message || 'This password-reset link is invalid or has expired.')
      } finally {
        if (active) setChecking(false)
      }
    }

    verifyCode()
    return () => { active = false }
  }, [oobCode])

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!evaluatePassword(password).valid) {
      setError('Please meet all strong password requirements')
      return
    }

    setLoading(true)
    try {
      await confirmPasswordReset(oobCode, password)
      clearTokens()
      setAuthUser(null)
      navigate('/login?passwordReset=success', { replace: true })
    } catch (requestError) {
      setError(requestError.message || 'Unable to reset password. Request a new link and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark px-4 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-primary/20 bg-card p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-primary">Choose a new password</h1>
        {checking ? (
          <p className="mt-6 text-sm text-text-secondary">Checking your secure reset link...</p>
        ) : error && !email ? (
          <div className="mt-6">
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</p>
            <Link to="/forgot-password" className="mt-5 inline-block text-sm text-primary hover:text-accent">Request a new reset link</Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <p className="text-sm text-text-secondary">Resetting the password for <span className="text-text-primary">{email}</span>.</p>
            <div>
              <label className="mb-2 block text-sm text-text-primary" htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-border bg-dark px-4 py-3 text-text-primary focus:border-primary focus:outline-none"
              />
              <PasswordStrength password={password} />
            </div>
            <div>
              <label className="mb-2 block text-sm text-text-primary" htmlFor="confirmPassword">Confirm new password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl border border-border bg-dark px-4 py-3 text-text-primary focus:border-primary focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
              Show passwords
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button disabled={loading} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-dark disabled:opacity-50">
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default ResetPassword
