import { useState, useEffect } from 'react'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useSettings } from '../contexts/SettingsContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useToastContext } from '../contexts/ToastContext'

export default function Settings() {
  const { appName, setAppName, whatsappNumber, setWhatsappNumber } = useSettings()
  const { t } = useLanguage()
  const { success, error: showError } = useToastContext()
  const [nameInputValue, setNameInputValue] = useState(appName)
  const [whatsappInputValue, setWhatsappInputValue] = useState(whatsappNumber)
  const [isSaving, setIsSaving] = useState(false)

  // Sync inputs when context data loads
  useEffect(() => {
    setNameInputValue(appName)
    setWhatsappInputValue(whatsappNumber)
  }, [appName, whatsappNumber])

  const handleSave = async () => {
    const trimmedName = nameInputValue.trim()
    const trimmedWhatsapp = whatsappInputValue.trim()
    if (!trimmedName) return

    setIsSaving(true)
    try {
      await Promise.all([
        setAppName(trimmedName),
        setWhatsappNumber(trimmedWhatsapp)
      ])
      success(t.settings.saved)
    } catch {
      showError(t.common.error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="flex-1 overflow-auto bg-slate-100">
      <div className="mx-auto max-w-2xl px-6 py-8">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
              <Cog6ToothIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{t.settings.title}</h1>
              <p className="text-sm text-slate-500">{t.settings.description}</p>
            </div>
          </div>
        </div>

        {/* Settings card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t.settings.general}
          </h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="app-name-input"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                {t.settings.appName}
              </label>
              <input
                id="app-name-input"
                type="text"
                value={nameInputValue}
                onChange={(e) => setNameInputValue(e.target.value)}
                placeholder={t.settings.appNamePlaceholder}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                }}
              />
              <p className="mt-1.5 text-xs text-slate-400">{t.settings.appNameHint}</p>
            </div>

            <div>
              <label
                htmlFor="whatsapp-input"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                {t.settings.whatsapp}
              </label>
              <input
                id="whatsapp-input"
                type="text"
                value={whatsappInputValue}
                onChange={(e) => setWhatsappInputValue(e.target.value)}
                placeholder={t.settings.whatsappPlaceholder}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                }}
              />
              <p className="mt-1.5 text-xs text-slate-400">{t.settings.whatsappHint}</p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={isSaving || !nameInputValue.trim()}
                className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? t.common.loading : t.common.save}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
