/**
 * Tukuaplikasi API integration for license validation
 * API: https://api.tukuaplikasi.com
 * Validates license_id (from paid orders) via GET/POST /api/marketplace/licenses/validate
 */

const TUKUAPLIKASI_API_BASE = 'https://api.tukuaplikasi.com'
const VALIDATE_PATH = '/api/marketplace/licenses/validate'
const REQUEST_TIMEOUT_MS = 15000

export interface TukuaplikasiValidateResponse {
  valid: boolean
  message?: string
  error?: string
  license?: {
    license_id: string
    order_id: string
    product: { id: string; name: string }
    user: { id: string; name: string; email: string }
    purchased_at: string
  }
  order?: { id: string; status: string }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeoutId)
    return res
  } catch (e) {
    clearTimeout(timeoutId)
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms. Please check your internet connection.`)
    }
    throw e
  }
}

/**
 * Validate a license ID against Tukuaplikasi.
 * GET or POST /api/marketplace/licenses/validate
 * - GET: ?license_id=xxx
 * - POST: { "license_id": "xxx" }
 */
export async function validateLicense(licenseId: string): Promise<TukuaplikasiValidateResponse> {
  const url = `${TUKUAPLIKASI_API_BASE}${VALIDATE_PATH}`
  const body = JSON.stringify({ license_id: licenseId })

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    },
    REQUEST_TIMEOUT_MS
  )

  let data: TukuaplikasiValidateResponse
  try {
    data = (await res.json()) as TukuaplikasiValidateResponse
  } catch {
    return {
      valid: false,
      error: 'Invalid response',
      message: `Server returned non-JSON (${res.status}). Please try again.`,
    }
  }

  if (!res.ok) {
    return {
      valid: false,
      error: data?.error ?? 'Request failed',
      message: data?.message ?? res.statusText,
    }
  }

  return data
}

/**
 * Basic format check: non-empty after trim.
 * Tukuaplikasi license_id format: LIC-{8}-{4}-{4}-{4}-{12} (hex)
 */
export function validateLicenseKeyFormat(key: string): boolean {
  return key.trim().length > 0
}
