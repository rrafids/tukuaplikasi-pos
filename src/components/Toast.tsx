import { useEffect } from 'react'
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { XMarkIcon } from '@heroicons/react/24/solid'

export type ToastType = 'success' | 'error' | 'info'

export type Toast = {
  id: string
  message: string
  type: ToastType
}

type ToastProps = {
  toast: Toast
  onClose: (id: string) => void
}

function ToastItem({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id)
    }, 3000) // Auto-close after 3 seconds

    return () => clearTimeout(timer)
  }, [toast.id, onClose])

  const icons = {
    success: <CheckCircleIcon className="h-5 w-5 text-emerald-600" />,
    error: <XCircleIcon className="h-5 w-5 text-rose-600" />,
    info: <InformationCircleIcon className="h-5 w-5 text-blue-600" />,
  }

  const bgColors = {
    success: 'bg-emerald-50 border-emerald-200',
    error: 'bg-rose-50 border-rose-200',
    info: 'bg-blue-50 border-blue-200',
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${bgColors[toast.type]}`}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm font-medium text-slate-900">{toast.message}</p>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="rounded p-1 text-slate-400 hover:text-slate-600"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

type ToastContainerProps = {
  toasts: Toast[]
  onClose: (id: string) => void
}

export default function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  )
}

