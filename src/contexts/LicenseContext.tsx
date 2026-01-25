import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getLicense, saveLicense, updateLicenseStatus, getMachineId } from '../db/license'
import { checkLicenseStatus, redeemLicenseKey, validateLicenseKeyFormat } from '../services/googleSheets'
import type { LicenseRow } from '../db/license'

interface LicenseContextType {
  license: LicenseRow | null
  isActivated: boolean
  isLoading: boolean
  activateLicense: (key: string, scriptUrl: string) => Promise<{ success: boolean; message: string }>
  verifyLicenseStatus: () => Promise<void>
  deactivateLicense: () => Promise<void>
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined)

// Default script URL (can be overridden)
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzt3VD3jLMCsqT-MY6eyQs9XymrNP8r5Slh1E0rYufrZnHGhB-m_62lNxO8CxhbLBf1xw/exec'

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

  const activateLicense = async (
    key: string,
    scriptUrl: string = DEFAULT_SCRIPT_URL
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // Validate format
      if (!validateLicenseKeyFormat(key)) {
        return {
          success: false,
          message: 'Invalid license key format.',
        }
      }

      // Step 1: Check license status first
      const statusResponse = await checkLicenseStatus(key.trim(), scriptUrl)
      console.log('[LicenseContext] Status response received:', statusResponse)

      // Validate response - only check that it's an object with status
      if (!statusResponse || typeof statusResponse !== 'object') {
        console.error('[LicenseContext] Invalid response object:', statusResponse)
        return {
          success: false,
          message: 'Invalid response from license server. Please try again.',
        }
      }

      // Check if status exists
      if (!('status' in statusResponse) || typeof statusResponse.status !== 'string') {
        console.error('[LicenseContext] Missing or invalid status:', statusResponse)
        return {
          success: false,
          message: 'Invalid response from license server. Please try again.',
        }
      }

      // Check if key was found (case-insensitive)
      const statusLower = statusResponse.status.toLowerCase()
      if (statusLower === 'key not found') {
        return {
          success: false,
          message: 'License key not found in database.',
        }
      }

      // If status is not "available" (case-insensitive), show error with the actual status
      if (statusLower !== 'available') {
        return {
          success: false,
          message: `License key status: ${statusResponse.status}. This key cannot be activated. Please contact support if you believe this is an error.`,
        }
      }

      // Status is "available" (case-insensitive), proceed to redeem
      console.log('[LicenseContext] License key is available, proceeding to redeem...')

      // Add a small delay to avoid rapid successive calls
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 2: Redeem the license key
      const redeemResponse = await redeemLicenseKey(key.trim(), scriptUrl)
      console.log('[LicenseContext] Redeem response received:', redeemResponse)

      // Validate response
      if (!redeemResponse || typeof redeemResponse !== 'object' || !redeemResponse.status) {
        return {
          success: false,
          message: 'Invalid response from license server during redemption. Please try again.',
        }
      }

      // Check redemption result (case-insensitive)
      const redeemStatusLower = redeemResponse.status.toLowerCase()
      if (redeemStatusLower === 'already redeemed') {
        return {
          success: false,
          message: 'This license key has already been redeemed. Please contact support.',
        }
      }

      if (redeemStatusLower !== 'redeemed') {
        return {
          success: false,
          message: `Failed to redeem license key. Status: ${redeemResponse.status}`,
        }
      }

      console.log('[LicenseContext] License key redeemed successfully')

      // Step 3: Save license locally
      const machineId = await getMachineId()
      const activatedAt = new Date().toISOString()

      const savedLicense = await saveLicense({
        license_key: key.trim(),
        activated_at: activatedAt,
        expires_at: null, // You can add expiration logic if needed
        machine_id: machineId,
        status: 'active',
      })

      setLicense(savedLicense)

      return {
        success: true,
        message: 'License activated successfully!',
      }
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

