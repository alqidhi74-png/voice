import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PasswordStrength from '../components/PasswordStrength'
import { evaluatePassword } from '../utils/passwordPolicy'
import { beginMfaSetup, changePassword, disableMfa, enableMfa } from '../services/authApi'

const Security = () => {
  const { currentUser, logout, checkAuth } = useAuth()
  const navigate = useNavigate()
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const updatePassword = async (event) => {
    event.preventDefault()
    setError('')
    if (passwords.next !== passwords.confirm) return setError('New passwords do not match')
    if (!evaluatePassword(passwords.next).valid) return setError('Please meet all strong password requirements')
    try {
      const result = await changePassword(passwords.current, passwords.next)
      setMessage(result.message)
      await logout()
      navigate('/login', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const startMfa = async () => {
    setError('')
    try {
      const result = await beginMfaSetup()
      setSetup(result.data)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const confirmMfa = async () => {
    try {
      const result = await enableMfa(code)
      setMessage(result.message)
      setSetup(null)
      setCode('')
      await checkAuth()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const turnOffMfa = async () => {
    try {
      const result = await disableMfa(code)
      setMessage(result.message)
      setCode('')
      await checkAuth()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="min-h-screen bg-dark px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div><h1 className="text-3xl font-bold text-primary">Account security</h1><p className="text-text-secondary">Manage your password and authenticator-app verification.</p></div>
        {message && <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-primary">{message}</div>}
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-text-primary">Change password</h2>
          <form className="mt-5 space-y-4" onSubmit={updatePassword}>
            <input type="password" autoComplete="current-password" required placeholder="Current password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className="w-full rounded-xl border border-border bg-dark px-4 py-3 text-text-primary" />
            <div><input type="password" autoComplete="new-password" required placeholder="New password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} className="w-full rounded-xl border border-border bg-dark px-4 py-3 text-text-primary" /><PasswordStrength password={passwords.next} /></div>
            <input type="password" autoComplete="new-password" required placeholder="Confirm new password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className="w-full rounded-xl border border-border bg-dark px-4 py-3 text-text-primary" />
            <button className="rounded-xl bg-primary px-5 py-3 font-semibold text-dark">Change password</button>
          </form>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-text-primary">Multi-factor authentication</h2>
          <p className="mt-2 text-sm text-text-secondary">Status: <span className="text-text-primary">{currentUser?.mfaEnabled ? 'Enabled' : 'Disabled'}</span></p>
          {setup && <div className="mt-5 rounded-xl bg-dark p-4"><p className="text-sm text-text-secondary">Add this secret or URI to Google Authenticator, Microsoft Authenticator, or another TOTP app.</p><code className="mt-3 block break-all rounded bg-black/30 p-3 text-primary">{setup.secret}</code><details className="mt-3 text-xs text-text-secondary"><summary>Show setup URI</summary><code className="mt-2 block break-all">{setup.otpAuthUri}</code></details></div>}
          {(setup || currentUser?.mfaEnabled) && <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className="mt-4 w-full rounded-xl border border-border bg-dark px-4 py-3 text-text-primary" />}
          {!currentUser?.mfaEnabled && !setup && <button onClick={startMfa} className="mt-5 rounded-xl bg-primary px-5 py-3 font-semibold text-dark">Set up authenticator</button>}
          {setup && <button onClick={confirmMfa} className="mt-4 rounded-xl bg-primary px-5 py-3 font-semibold text-dark">Confirm and enable</button>}
          {currentUser?.mfaEnabled && <button onClick={turnOffMfa} className="mt-4 rounded-xl border border-red-500/50 px-5 py-3 text-red-400">Disable MFA</button>}
        </section>
      </div>
    </div>
  )
}

export default Security
