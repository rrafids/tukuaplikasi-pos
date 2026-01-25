import { GlobeAltIcon } from '@heroicons/react/24/outline'
import { useLanguage } from '../contexts/LanguageContext'

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage()

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'id' : 'en')
  }

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
      title={language === 'en' ? 'Switch to Indonesian' : 'Ganti ke Bahasa Inggris'}
    >
      <GlobeAltIcon className="h-5 w-5" />
      <span className="font-medium">{language === 'en' ? 'EN' : 'ID'}</span>
    </button>
  )
}

