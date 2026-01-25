// Google Apps Script integration for license management

export interface LicenseResponse {
  key?: string
  status: string
}

export type LicenseAction = 'status' | 'redeem'

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms. The script may be taking too long to execute.`)
    }
    throw error
  }
}

/**
 * Check license status from Google Apps Script endpoint
 * Endpoint format: https://YOUR_URL/exec?action=status&key={LICENSE_KEY}
 * 
 * Response format:
 * - Available: {"key":"abcd","status":"Available"}
 * - Not found: {"status":"Key not found"}
 */
export async function checkLicenseStatus(
  licenseKey: string,
  scriptUrl: string
): Promise<LicenseResponse> {
  try {
    const url = `${scriptUrl}?action=status&key=${encodeURIComponent(licenseKey)}`
    console.log('[Google Sheets] Checking license status, URL:', url)

    let response: Response
    try {
      // Google Apps Script web apps may redirect, so we need to handle that
      response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        redirect: 'follow',
        headers: {
          'Accept': 'application/json',
        },
      })
    } catch (fetchError) {
      console.error('[Google Sheets] Fetch error:', fetchError)
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)

      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Load failed')) {
        throw new Error(`Network error: Unable to connect to license server.\n\nPossible causes:\n1. No internet connection\n2. Google Apps Script deployment not configured correctly\n3. CORS restrictions\n\nPlease verify:\n- The script URL is correct\n- The script is deployed as "Web app" with "Execute as: Me" and "Who has access: Anyone"\n- Your internet connection is working\n\nURL: ${scriptUrl}`)
      }
      throw new Error(`Failed to fetch license status: ${errorMessage}`)
    }

    console.log('[Google Sheets] Response status:', response.status, response.statusText)
    console.log('[Google Sheets] Response headers:', Object.fromEntries(response.headers.entries()))

    // Google Apps Script might return 200 even with errors, so check content type
    const contentType = response.headers.get('content-type') || ''
    console.log('[Google Sheets] Content-Type:', contentType)

    const text = await response.text()
    console.log('[Google Sheets] Response text (raw):', text)
    console.log('[Google Sheets] Response text length:', text.length)

    if (!text || text.trim().length === 0) {
      throw new Error(`Empty response from server. Status: ${response.status} ${response.statusText}`)
    }

    // Try to extract JSON from response (might be wrapped in HTML or have extra whitespace)
    let cleanText = text.trim()

    // Remove potential HTML wrapper
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      cleanText = jsonMatch[0]
    }

    let data: LicenseResponse
    try {
      data = JSON.parse(cleanText) as LicenseResponse
      console.log('[Google Sheets] Parsed data:', data)
    } catch (parseError) {
      console.error('[Google Sheets] JSON parse error:', parseError)
      console.error('[Google Sheets] Failed to parse text:', cleanText.substring(0, 200))
      throw new Error(`Invalid JSON response from server.\n\nStatus: ${response.status} ${response.statusText}\nResponse: ${cleanText.substring(0, 200)}${cleanText.length > 200 ? '...' : ''}`)
    }

    // Validate response structure - be more lenient
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid response format: ${JSON.stringify(data)}`)
    }

    // Status is required, but key might be optional
    if (typeof data.status !== 'string') {
      throw new Error(`Missing status in response: ${JSON.stringify(data)}`)
    }

    return data
  } catch (error) {
    console.error('[Google Sheets] Error checking license status:', error)
    throw error
  }
}

/**
 * Redeem license key from Google Apps Script endpoint
 * Endpoint format: https://YOUR_URL/exec?action=redeem&key={LICENSE_KEY}
 * 
 * Response format:
 * - Success: {"key":"abcd","status":"Redeemed"}
 * - Already redeemed: {"key":"abcd","status":"Already redeemed"}
 * - Not found: {"status":"Key not found"}
 */
export async function redeemLicenseKey(
  licenseKey: string,
  scriptUrl: string
): Promise<LicenseResponse> {
  try {
    const url = `${scriptUrl}?action=redeem&key=${encodeURIComponent(licenseKey)}`
    console.log('[Google Sheets] Redeeming license, URL:', url)

    let response: Response
    try {
      // Google Apps Script web apps may redirect, so we need to handle that
      // Use timeout wrapper to prevent hanging (30 seconds timeout)
      console.log('[Google Sheets] Starting redemption request with 30s timeout...')
      response = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache',
          redirect: 'follow',
          headers: {
            'Accept': 'application/json',
          },
        },
        30000 // 30 second timeout
      )
      console.log('[Google Sheets] Redemption request completed')
    } catch (fetchError) {
      console.error('[Google Sheets] Redeem fetch error:', fetchError)
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)

      if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
        throw new Error(`Script execution timeout: The redemption script took longer than 30 seconds to execute.\n\nThis usually means:\n1. The script lock is timing out\n2. The script is encountering an error\n3. The script is taking too long to process\n\nPlease check:\n- Google Apps Script execution logs for errors\n- Ensure the script uses tryLock() instead of waitLock()\n- Verify the script has proper error handling\n\nURL: ${scriptUrl}`)
      }

      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Load failed')) {
        throw new Error(`Network error: Unable to connect to license server during redemption.\n\nPossible causes:\n1. Script execution timeout (lock timeout)\n2. Google Apps Script deployment not configured correctly\n3. CORS restrictions\n4. Script error in redemption function\n\nPlease verify:\n- The script URL is correct\n- The script is deployed as "Web app" with "Execute as: Me" and "Who has access: Anyone"\n- Check Google Apps Script execution logs for errors\n\nURL: ${scriptUrl}`)
      }
      throw new Error(`Failed to fetch license redemption: ${errorMessage}`)
    }

    console.log('[Google Sheets] Redeem response status:', response.status, response.statusText)

    const text = await response.text()
    console.log('[Google Sheets] Redeem response text (raw):', text)

    if (!text || text.trim().length === 0) {
      throw new Error(`Empty response from server. Status: ${response.status} ${response.statusText}`)
    }

    // Try to extract JSON from response (might be wrapped in HTML or have extra whitespace)
    let cleanText = text.trim()

    // Remove potential HTML wrapper
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      cleanText = jsonMatch[0]
    }

    let data: LicenseResponse
    try {
      data = JSON.parse(cleanText) as LicenseResponse
      console.log('[Google Sheets] Redeem parsed data:', data)
    } catch (parseError) {
      console.error('[Google Sheets] Redeem JSON parse error:', parseError)
      throw new Error(`Invalid JSON response from server.\n\nStatus: ${response.status} ${response.statusText}\nResponse: ${cleanText.substring(0, 200)}${cleanText.length > 200 ? '...' : ''}`)
    }

    // Validate response structure - be more lenient
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid response format: ${JSON.stringify(data)}`)
    }

    // Status is required
    if (typeof data.status !== 'string') {
      throw new Error(`Missing status in response: ${JSON.stringify(data)}`)
    }

    return data
  } catch (error) {
    console.error('[Google Sheets] Error redeeming license:', error)
    throw error
  }
}

/**
 * Validate license key format (optional)
 */
export function validateLicenseKeyFormat(key: string): boolean {
  // Allow any non-empty string for now
  // You can add specific format validation if needed
  return key.trim().length > 0
}

