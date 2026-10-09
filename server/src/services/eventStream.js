import { subscribeToLiveEvents } from './liveEvents.js'

export const openEventStream = (req, res, audience) => {
  res.status(200)
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.flushHeaders?.()
  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`)

  const unsubscribe = subscribeToLiveEvents(audience, event => {
    res.write(`event: notification\ndata: ${JSON.stringify(event)}\n\n`)
  })
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  })
}

export default { openEventStream }
