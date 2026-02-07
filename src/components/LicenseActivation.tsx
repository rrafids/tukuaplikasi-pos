import { useState } from 'react'
import { KeyIcon, CheckCircleIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useLicense } from '../contexts/LicenseContext'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from './LanguageToggle'
import ConfirmModal from './ConfirmModal'

interface LicenseActivationProps {
  fromLogin?: boolean
  onBackToLogin?: () => void
}

export default function LicenseActivation({ fromLogin, onBackToLogin }: LicenseActivationProps) {
  const { license, isActivated, activateLicense, deactivateLicense } = useLicense()
  const toast = useToastContext()
  const { t } = useLanguage()
  const [licenseKey, setLicenseKey] = useState('')
  const [isActivating, setIsActivating] = useState(false)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)

  const handleActivate = async () => {
    setErrorDetails(null)
    if (!licenseKey.trim()) {
      toast.error(t.license.enterLicenseKey)
      return
    }
    setIsActivating(true)
    try {
      const result = await activateLicense(licenseKey.trim())

      if (result.success) {
        toast.success(result.message)
        setLicenseKey('')
        setErrorDetails(null)
      } else {
        const errorMsg = result.message || 'Unknown error occurred'
        toast.error(errorMsg)
        setErrorDetails(`Error: ${errorMsg}`)
      }
    } catch (error) {
      console.error('[LicenseActivation] Error during activation:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to activate license'
      toast.error(errorMessage)
      setErrorDetails(`Exception: ${errorMessage}`)
    } finally {
      setIsActivating(false)
    }
  }

  const handleDeactivateClick = () => setShowDeactivateConfirm(true)

  const handleDeactivateConfirm = async () => {
    setShowDeactivateConfirm(false)
    await deactivateLicense()
    toast.success(t.license.deactivated)
  }

  if (isActivated && license) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="absolute top-4 right-4">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
          <img src="/tlog.png" alt="Logo" className="mx-auto mb-4 h-16 w-16 rounded-2xl object-contain" />
          <div className="flex items-center justify-center">
            <CheckCircleIcon className="h-16 w-16 text-green-500" />
          </div>
          <h2 className="mt-4 text-center text-2xl font-bold text-slate-900">
            {t.license.activated}
          </h2>
          <div className="mt-6 space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-600">{t.license.licenseKey}</label>
              <p className="mt-1 font-mono text-sm text-slate-900">{license.license_key}</p>
            </div>
            {license.activated_at && (
              <div>
                <label className="text-sm font-medium text-slate-600">{t.license.activatedAt}</label>
                <p className="mt-1 text-sm text-slate-900">
                  {new Date(license.activated_at).toLocaleString()}
                </p>
              </div>
            )}
            {license.expires_at && (
              <div>
                <label className="text-sm font-medium text-slate-600">{t.license.expiresAt}</label>
                <p className="mt-1 text-sm text-slate-900">
                  {new Date(license.expires_at).toLocaleString()}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-slate-600">{t.common.status}</label>
              <p className="mt-1">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  {license.status.toUpperCase()}
                </span>
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            {fromLogin && onBackToLogin && (
              <button
                onClick={onBackToLogin}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeftIcon className="h-5 w-5" />
                {t.login.backToLogin}
              </button>
            )}
            <button
              onClick={handleDeactivateClick}
              className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t.license.deactivate}
            </button>
          </div>
          <ConfirmModal
            open={showDeactivateConfirm}
            message={t.license.deactivateConfirm}
            confirmLabel={t.common.yes}
            cancelLabel={t.common.no}
            confirmVariant="danger"
            onConfirm={handleDeactivateConfirm}
            onCancel={() => setShowDeactivateConfirm(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <img src="/tlog.png" alt="Logo" className="mx-auto mb-4 h-16 w-16 rounded-2xl object-contain" />
        <div className="flex items-center justify-center">
          <KeyIcon className="h-16 w-16 text-slate-400" />
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold text-slate-900">
          {t.license.activate}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {t.license.enterLicenseKey}
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t.license.licenseKey}
            </label>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder={t.license.enterLicenseKey}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleActivate()
                }
              }}
            />
          </div>

          {errorDetails && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-red-800 mb-2">Error Details</h4>
                  <pre className="text-xs text-red-700 whitespace-pre-wrap break-words font-mono">
                    {errorDetails}
                  </pre>
                </div>
                <button
                  onClick={() => setErrorDetails(null)}
                  className="ml-2 text-red-600 hover:text-red-800"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleActivate()
          }}
          disabled={isActivating}
          className="mt-6 w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
        >
          {isActivating ? t.license.activating : t.license.activate}
        </button>
      </div>
    </div>
  )
}

