import { useEffect, useState } from 'react'
import { apiRequest } from '../services/api'
import { useToast } from '../contexts/ToastContext'

const Feedback = () => {
  const { showToast } = useToast()
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [notifications, setNotifications] = useState([])

  const loadHistory = async () => {
    const [feedbackResult, notificationResult] = await Promise.allSettled([
      apiRequest('/user/feedback'),
      apiRequest('/user/notifications')
    ])
    if (feedbackResult.status === 'fulfilled') setHistory(feedbackResult.value.data?.feedback || [])
    if (notificationResult.status === 'fulfilled') setNotifications(notificationResult.value.data?.notifications || [])
  }

  useEffect(() => {
    loadHistory()
    const refresh = () => loadHistory()
    window.addEventListener('vshield:live-event', refresh)
    return () => window.removeEventListener('vshield:live-event', refresh)
  }, [])

  const submit = async event => {
    event.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    try {
      const result = await apiRequest('/user/feedback', {
        method: 'POST',
        body: JSON.stringify({ category, message }),
      })
      setMessage('')
      setCategory('general')
      showToast(result.message || 'Feedback submitted securely', { type: 'success' })
      await loadHistory()
    } catch (error) {
      showToast(error.message || 'Unable to submit feedback', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const markNotificationRead = async notification => {
    if (notification.read) return
    try {
      await apiRequest(`/user/notifications/${encodeURIComponent(notification.id)}/read`, { method: 'PATCH' })
      setNotifications(current => current.map(item => item.id === notification.id ? { ...item, read: true } : item))
    } catch (error) {
      showToast(error.message, { type: 'error' })
    }
  }

  const formatDate = value => value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''

  return (
    <div className="min-h-screen bg-dark px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-3xl border border-border bg-card p-7 shadow-2xl sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15a4 4 0 01-4 4H8l-5 3v-4a4 4 0 01-1-3V7a4 4 0 014-4h11a4 4 0 014 4v8z" />
            </svg>
          </div>
          <h1 className="mt-5 text-3xl font-bold text-text-primary">Secure feedback</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Your message is encrypted with AES-256-GCM before it is stored and can only be viewed by an administrator.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="feedback-category" className="mb-2 block text-sm font-semibold text-text-primary">Category</label>
              <select id="feedback-category" value={category} onChange={event => setCategory(event.target.value)} className="w-full rounded-xl border border-border bg-dark px-4 py-3 text-text-primary outline-none focus:border-primary">
                <option value="general">General</option>
                <option value="bug">Bug report</option>
                <option value="security">Security concern</option>
                <option value="suggestion">Suggestion</option>
              </select>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="feedback-message" className="text-sm font-semibold text-text-primary">Message</label>
                <span className="text-xs text-text-secondary">{message.length}/2000</span>
              </div>
              <textarea id="feedback-message" required maxLength={2000} rows={7} value={message} onChange={event => setMessage(event.target.value)} placeholder="Tell us what happened or how we can improve..." className="w-full resize-none rounded-xl border border-border bg-dark px-4 py-3 text-text-primary outline-none placeholder:text-text-secondary/60 focus:border-primary" />
            </div>
            <button type="submit" disabled={loading || !message.trim()} className="w-full rounded-xl bg-primary px-5 py-3.5 font-bold text-dark transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? 'Encrypting and sending...' : 'Submit encrypted feedback'}
            </button>
          </form>
        </div>

        {notifications.length > 0 && (
          <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
            <div className="border-b border-border px-7 py-5">
              <h2 className="text-xl font-bold text-text-primary">Notifications</h2>
              <p className="mt-1 text-sm text-text-secondary">Updates and administrator responses appear here instantly.</p>
            </div>
            <div className="divide-y divide-border">
              {notifications.map(notification => (
                <button key={notification.id} type="button" onClick={() => markNotificationRead(notification)} className={`w-full px-7 py-5 text-left transition hover:bg-primary/5 ${notification.read ? '' : 'bg-primary/10'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-text-primary">{notification.title}</p>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">{notification.message}</p>
                    </div>
                    {!notification.read && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-2 text-xs text-text-secondary/70">{formatDate(notification.createdAt)}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
          <div className="border-b border-border px-7 py-5">
            <h2 className="text-xl font-bold text-text-primary">Your feedback history</h2>
            <p className="mt-1 text-sm text-text-secondary">Track progress and read encrypted administrator responses.</p>
          </div>
          <div className="divide-y divide-border">
            {history.map(item => (
              <article key={item.id} className="px-7 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">{item.category}</span>
                    <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-text-secondary">{String(item.status || 'new').replace('_', ' ')}</span>
                  </div>
                  <span className="text-xs text-text-secondary/70">{formatDate(item.createdAt)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{item.message}</p>
                {item.reply && (
                  <div className="mt-4 rounded-xl border border-primary/20 bg-primary/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">Administrator response</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-primary">{item.reply}</p>
                  </div>
                )}
              </article>
            ))}
            {!history.length && <p className="px-7 py-12 text-center text-sm text-text-secondary">No feedback submitted yet.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

export default Feedback
