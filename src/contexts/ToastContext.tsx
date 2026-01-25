import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useToast } from '../hooks/useToast'

type ToastContextType = ReturnType<typeof useToast>

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  return <ToastContext.Provider value={toast}>{children}</ToastContext.Provider>
}

export function useToastContext() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider')
  }
  return context
}

