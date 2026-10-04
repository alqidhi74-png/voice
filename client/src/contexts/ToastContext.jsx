import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const ToastContext = createContext(null)

const TOAST_DURATION = 4000

const TYPE_CONFIG = {
  success: {
    container: 'bg-green-500/15 border-green-500/40 text-green-200',
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-400',
    iconPath: 'M5 13l4 4L19 7',
  },
  error: {
    container: 'bg-red-500/15 border-red-500/40 text-red-200',
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-400',
    iconPath: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  warning: {
    container: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-200',
    iconBg: 'bg-yellow-500/20',
    iconColor: 'text-yellow-400',
    iconPath: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z',
  },
  info: {
    container: 'bg-primary/15 border-primary/40 text-primary',
    iconBg: 'bg-primary/20',
    iconColor: 'text-primary',
    iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
}

const getTypeConfig = (type) => TYPE_CONFIG[type] || TYPE_CONFIG.info

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message, options = {}) => {
      if (!message) return null

      const {
        type = 'info',
        duration = TOAST_DURATION,
        title,
        id: providedId,
      } = options

      const id = providedId || `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const toast = { id, message, type, title }

      setToasts((prev) => [...prev, toast])

      if (duration !== null && duration !== Infinity) {
        window.setTimeout(() => removeToast(id), duration)
      }

      return id
    },
    [removeToast]
  )

  const contextValue = useMemo(
    () => ({
      showToast,
      removeToast,
    }),
    [showToast, removeToast]
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex w-full max-w-sm flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const config = getTypeConfig(toast.type)
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 80, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80, scale: 0.9 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`pointer-events-auto overflow-hidden rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md ${config.container}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full ${config.iconBg}`}>
                    <svg className={`h-5 w-5 ${config.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.iconPath} />
                    </svg>
                  </div>
                  <div className="flex-1">
                    {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
                    <p className="text-sm leading-relaxed">{toast.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeToast(toast.id)}
                    className="ml-2 mt-1 text-sm opacity-70 transition-opacity hover:opacity-100"
                  >
                    <span className="sr-only">Dismiss</span>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}


