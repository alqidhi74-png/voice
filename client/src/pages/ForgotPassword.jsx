import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../services/authApi'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await forgotPassword(email)
      setMessage(result.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark px-4 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-primary/20 bg-card p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-primary">Reset your password</h1>
        <p className="mt-2 text-sm text-text-secondary">We will email you a secure, time-limited reset link.</p>
        {message ? (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-text-primary">{message}</div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block text-sm text-text-primary" htmlFor="resetEmail">Email address</label>
            <input id="resetEmail" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-border bg-dark px-4 py-3 text-text-primary focus:border-primary focus:outline-none" />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button disabled={loading} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-dark disabled:opacity-50">{loading ? 'Sending…' : 'Send reset link'}</button>
          </form>
        )}
        <Link to="/login" className="mt-6 inline-block text-sm text-primary hover:text-accent">Back to sign in</Link>
      </div>
    </div>
  )
}

export default ForgotPassword
