/**
 * Simple logger utility
 * In production, replace with winston or pino
 */

const getTimestamp = () => {
  return new Date().toISOString()
}

const formatMessage = (level, message, ...args) => {
  const timestamp = getTimestamp()
  const extra = args.length > 0 ? ' ' + args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ') : ''
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${extra}`
}

export const logger = {
  info: (message, ...args) => {
    console.log(formatMessage('info', message, ...args))
  },
  
  error: (message, ...args) => {
    console.error(formatMessage('error', message, ...args))
  },
  
  warn: (message, ...args) => {
    console.warn(formatMessage('warn', message, ...args))
  },
  
  debug: (message, ...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatMessage('debug', message, ...args))
    }
  }
}

