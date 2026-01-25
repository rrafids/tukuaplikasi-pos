import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from './LanguageToggle'

export default function Login() {
  const { login } = useAuth()
  const toast = useToastContext()
  const { t } = useLanguage()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 px-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white">
              SP
            </div>
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
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
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
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                placeholder={t.login.enterPassword}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? t.login.signingIn : t.login.signIn}
            </button>
          </form>

          {/* <div className="mt-6 rounded-lg bg-amber-50 p-4 text-xs text-amber-800">
            <p className="font-semibold">Default Credentials:</p>
            <p>Username: <strong>admin</strong></p>
            <p>Password: <strong>admin123</strong></p>
          </div> */}
        </div>
      </div>
    </div>
  )
}

