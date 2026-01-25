import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getLicense, saveLicense, updateLicenseStatus, getMachineId } from '../db/license'
import { validateLicense, validateLicenseKeyFormat } from '../services/tukuaplikasi'
import type { LicenseRow } from '../db/license'

interface LicenseContextType {
  license: LicenseRow | null
  isActivated: boolean
  isLoading: boolean
  activateLicense: (key: string) => Promise<{ success: boolean; message: string }>
  verifyLicenseStatus: () => Promise<void>
  deactivateLicense: () => Promise<void>
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined)

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [license, setLicense] = useState<LicenseRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadLicense()
  }, [])

  const loadLicense = async () => {
    try {
      const stored = await getLicense()
      setLicense(stored)

      if (stored && stored.status === 'active') {
        // Check if expired
        if (stored.expires_at) {
          const expiresAt = new Date(stored.expires_at)
          const now = new Date()
          if (now > expiresAt) {
            await updateLicenseStatus('expired')
            setLicense({ ...stored, status: 'expired' })
          }
        }
      }
    } catch (error) {
      console.error('[License] Error loading license:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const activateLicense = async (key: string): Promise<{ success: boolean; message: string }> => {
    try {
      if (!validateLicenseKeyFormat(key)) {
        return { success: false, message: 'Invalid license key format.' }
      }

      const res = await validateLicense(key.trim())

      if (!res.valid) {
        const msg = res.message || res.error || 'License is invalid or not active.'
        return { success: false, message: msg }
      }

      const machineId = await getMachineId()
      const activatedAt = new Date().toISOString()

      const savedLicense = await saveLicense({
        license_key: key.trim(),
        activated_at: activatedAt,
        expires_at: null,
        machine_id: machineId,
        status: 'active',
      })

      setLicense(savedLicense)
      return { success: true, message: 'License activated successfully!' }
    } catch (error) {
      console.error('[License] Error activating license:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to activate license. Please check your internet connection.',
      }
    }
  }

  const verifyLicenseStatus = async () => {
    if (!license) return

    try {
      // Check expiration
      if (license.expires_at) {
        const expiresAt = new Date(license.expires_at)
        const now = new Date()
        if (now > expiresAt && license.status === 'active') {
          await updateLicenseStatus('expired')
          setLicense({ ...license, status: 'expired' })
        }
      }
    } catch (error) {
      console.error('[License] Error checking license status:', error)
    }
  }

  const deactivateLicense = async () => {
    try {
      await updateLicenseStatus('invalid')
      setLicense(null)
    } catch (error) {
      console.error('[License] Error deactivating license:', error)
    }
  }

  const isActivated = license?.status === 'active'

  return (
    <LicenseContext.Provider
      value={{
        license,
        isActivated,
        isLoading,
        activateLicense,
        verifyLicenseStatus,
        deactivateLicense,
      }}
    >
      {children}
    </LicenseContext.Provider>
  )
}

export function useLicense() {
  const context = useContext(LicenseContext)
  if (context === undefined) {
    throw new Error('useLicense must be used within a LicenseProvider')
  }
  return context
}

