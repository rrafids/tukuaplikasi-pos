import { useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PowerIcon, KeyIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from './LanguageToggle'

interface LoginProps {
  onShowLicense?: () => void
}

export default function Login({ onShowLicense }: LoginProps) {
  const { login } = useAuth()
  const toast = useToastContext()
  const { t } = useLanguage()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleExit = async () => {
    try {
      const appWindow = getCurrentWindow()
      await appWindow.close()
    } catch (err) {
      console.error('Exit error:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const success = await login(username, password)
      if (success) {
        toast.success(t.login.loginSuccess)
      } else {
        toast.error(t.login.invalidCredentials)
      }
    } catch (error) {
      console.error('Login error:', error)
      toast.error(t.login.loginError)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-slate-100 px-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-8 text-center">
            <img src="/tlog.png" alt="Point of Sales" className="mx-auto mb-4 h-16 w-16 rounded-2xl object-contain" />
            <h1 className="text-2xl font-bold text-slate-900">{t.app.title}</h1>
            <p className="mt-2 text-sm text-slate-600">{t.login.title}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-700"
              >
                {t.login.username}
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
                placeholder={t.login.enterUsername}
                disabled={isLoading}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                {t.login.password}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
                placeholder={t.login.enterPassword}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? t.login.signingIn : t.login.signIn}
            </button>

            {onShowLicense && (
              <button
                type="button"
                onClick={onShowLicense}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <KeyIcon className="h-5 w-5" />
                {t.login.activateLicense}
              </button>
            )}

            <button
              type="button"
              onClick={handleExit}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 shadow-sm hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              <PowerIcon className="h-5 w-5" />
              {t.app.exit}
            </button>
          </form>

          <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">
            <p className="font-semibold">{t.login.defaultCredentials}</p>
            <p>{t.login.username}: <strong>admin</strong></p>
            <p>{t.login.password}: <strong>admin123</strong></p>
          </div>
        </div>
      </div>
    </div>
  )
}

