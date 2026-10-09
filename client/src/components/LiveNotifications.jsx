import { useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getIdToken } from '../services/authApi'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

const LiveNotifications = () => {
  const { currentUser } = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    if (!currentUser?.uid || !currentUser.emailVerified) return undefined

    let stopped = false
    let controller
    let reconnectTimer

    const connect = async () => {
      const token = getIdToken()
      if (!token || stopped) return
      controller = new AbortController()
      try {
        const endpoint = currentUser.role === 'admin' ? '/admin/events' : '/user/events'
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal
        })
        if (!response.ok || !response.body) throw new Error(`Live notifications unavailable (${response.status})`)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() || ''
          blocks.forEach(block => {
            const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
            if (!data) return
            try {
              const event = JSON.parse(data)
              if (event.connected) return
              showToast(event.message, {
                type: event.severity === 'warning' ? 'warning' : 'info',
                title: event.title,
                duration: 7000,
                id: event.id
              })
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(event.title || 'Voice Identity Shield', { body: event.message })
              }
              window.dispatchEvent(new CustomEvent('vshield:live-event', { detail: event }))
            } catch {
              // Ignore malformed or incomplete SSE messages.
            }
          })
        }
      } catch (error) {
        if (error.name !== 'AbortError' && !stopped) {
          reconnectTimer = window.setTimeout(connect, 5000)
        }
      }
    }

    connect()
    return () => {
      stopped = true
      controller?.abort()
      window.clearTimeout(reconnectTimer)
    }
  }, [currentUser?.uid, currentUser?.role, currentUser?.emailVerified, showToast])

  return null
}

export default LiveNotifications
