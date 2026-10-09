import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const ToastContext = createContext(null)

const TOAST_DURATION = 4000

const TYPE_CONFIG = {
  success: {
    container: 'bg-white border-emerald-200 border-l-4 border-l-emerald-500 text-slate-800',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
    iconPath: 'M5 13l4 4L19 7',
  },
  error: {
    container: 'bg-white border-red-200 border-l-4 border-l-red-500 text-slate-800',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-700',
    iconPath: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  warning: {
    container: 'bg-white border-amber-200 border-l-4 border-l-amber-500 text-slate-800',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
    iconPath: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z',
  },
  info: {
    container: 'bg-white border-sky-200 border-l-4 border-l-sky-500 text-slate-800',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-700',
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
                className={`pointer-events-auto overflow-hidden rounded-xl border px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/5 ${config.container}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full ${config.iconBg}`}>
                    <svg className={`h-5 w-5 ${config.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.iconPath} />
                    </svg>
                  </div>
                  <div className="flex-1">
                    {toast.title && <p className="text-sm font-bold text-slate-950">{toast.title}</p>}
                    <p className="mt-0.5 text-sm font-medium leading-relaxed text-slate-700">{toast.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeToast(toast.id)}
                    className="ml-2 mt-1 text-sm text-slate-500 transition-colors hover:text-slate-900"
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

