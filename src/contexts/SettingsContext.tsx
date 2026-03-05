import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getSetting, setSetting } from '../db/settings'

const APP_NAME_KEY = 'app_name'
const WHATSAPP_NUMBER_KEY = 'whatsapp_number'
const DEFAULT_APP_NAME = 'Point of Sales'
const DEFAULT_WHATSAPP = ''

interface SettingsContextType {
  appName: string
  setAppName: (name: string) => Promise<void>
  whatsappNumber: string
  setWhatsappNumber: (number: string) => Promise<void>
  isLoading: boolean
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [appName, setAppNameState] = useState(DEFAULT_APP_NAME)
  const [whatsappNumber, setWhatsappNumberState] = useState(DEFAULT_WHATSAPP)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const name = await getSetting(APP_NAME_KEY, DEFAULT_APP_NAME)
      const whatsapp = await getSetting(WHATSAPP_NUMBER_KEY, DEFAULT_WHATSAPP)
      setAppNameState(name || DEFAULT_APP_NAME)
      setWhatsappNumberState(whatsapp || DEFAULT_WHATSAPP)
    } catch (error) {
      console.error('[Settings] Error loading settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const setAppName = async (name: string) => {
    await setSetting(APP_NAME_KEY, name)
    setAppNameState(name)
  }

  const setWhatsappNumber = async (number: string) => {
    await setSetting(WHATSAPP_NUMBER_KEY, number)
    setWhatsappNumberState(number)
  }

  return (
    <SettingsContext.Provider value={{ appName, setAppName, whatsappNumber, setWhatsappNumber, isLoading }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
