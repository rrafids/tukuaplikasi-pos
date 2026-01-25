import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { en } from '../locales/en'
import { id } from '../locales/id'

export type Language = 'en' | 'id'

type Translations = typeof en 

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: Translations
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const translations: Record<Language, Translations> = {
  en,
  id,
}

const LANGUAGE_STORAGE_KEY = 'app_language'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    // Get from localStorage or default to 'id'
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
    return stored && (stored === 'en' || stored === 'id') ? stored : 'id'
  })

  useEffect(() => {
    // Save to localStorage whenever language changes
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  }, [language])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
  }

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

