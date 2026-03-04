import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getSetting, setSetting } from '../db/settings'

const APP_NAME_KEY = 'app_name'
const DEFAULT_APP_NAME = 'Point of Sales'

interface SettingsContextType {
  appName: string
  setAppName: (name: string) => Promise<void>
  isLoading: boolean
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [appName, setAppNameState] = useState(DEFAULT_APP_NAME)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const name = await getSetting(APP_NAME_KEY, DEFAULT_APP_NAME)
      setAppNameState(name || DEFAULT_APP_NAME)
    } catch (error) {
      console.error('[Settings] Error loading app name:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const setAppName = async (name: string) => {
    await setSetting(APP_NAME_KEY, name)
    setAppNameState(name)
  }

  return (
    <SettingsContext.Provider value={{ appName, setAppName, isLoading }}>
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
