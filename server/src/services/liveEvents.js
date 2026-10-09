import { EventEmitter } from 'events'

const emitter = new EventEmitter()
emitter.setMaxListeners(250)

export const publishLiveEvent = (audience, event) => {
  emitter.emit(audience, {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...event
  })
}

export const subscribeToLiveEvents = (audience, listener) => {
  emitter.on(audience, listener)
  return () => emitter.off(audience, listener)
}

export default { publishLiveEvent, subscribeToLiveEvents }
