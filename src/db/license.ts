import Database from '@tauri-apps/plugin-sql'

export type LicenseRow = {
  id: number
  license_key: string
  activated_at: string | null
  expires_at: string | null
  machine_id: string | null
  status: 'active' | 'expired' | 'invalid'
  created_at: string
  updated_at: string
}

// Get machine ID (unique identifier for this device)
export async function getMachineId(): Promise<string> {
  // Use browser properties to create a unique ID
  // This creates a reasonably unique identifier based on browser/device characteristics
  const userAgent = navigator.userAgent || ''
  const language = navigator.language || 'unknown'
  const hardwareConcurrency = navigator.hardwareConcurrency || 0
  const platform = navigator.platform || 'unknown'
  const maxTouchPoints = (navigator as any).maxTouchPoints || 0

  // Combine multiple properties for better uniqueness
  const machineId = `${userAgent}-${language}-${hardwareConcurrency}-${platform}-${maxTouchPoints}`

  // Create a base64-like hash and clean it up
  return btoa(machineId).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)
}

async function getDbPath(): Promise<string> {
  return 'sqlite:satria_pos.db'
}

let dbPromise: ReturnType<typeof Database.load> | null = null
let dbPath: string | null = null

async function getDb() {
  if (!dbPromise) {
    if (!dbPath) {
      dbPath = await getDbPath()
    }
    dbPromise = Database.load(dbPath)
    const db = await dbPromise

    // Create license table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS license (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        activated_at TEXT,
        expires_at TEXT,
        machine_id TEXT,
        status TEXT NOT NULL DEFAULT 'invalid',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }
  return dbPromise
}

export async function getLicense(): Promise<LicenseRow | null> {
  try {
    const db = await getDb()
    const rows = await db.select<LicenseRow[]>(
      `SELECT * FROM license ORDER BY id DESC LIMIT 1`
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error getting license:', error)
    throw error
  }
}

export async function saveLicense(license: {
  license_key: string
  activated_at: string | null
  expires_at: string | null
  machine_id: string | null
  status: 'active' | 'expired' | 'invalid'
}): Promise<LicenseRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Delete old license if exists
    await db.execute(`DELETE FROM license`)

    // Insert new license
    await db.execute(
      `INSERT INTO license (license_key, activated_at, expires_at, machine_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        license.license_key,
        license.activated_at,
        license.expires_at,
        license.machine_id,
        license.status,
        now,
        now,
      ]
    )

    const rows = await db.select<LicenseRow[]>(
      `SELECT * FROM license ORDER BY id DESC LIMIT 1`
    )
    return rows[0]!
  } catch (error) {
    console.error('[DB] Error saving license:', error)
    throw error
  }
}

export async function updateLicenseStatus(
  status: 'active' | 'expired' | 'invalid',
  expires_at?: string | null
): Promise<void> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    await db.execute(
      `UPDATE license 
       SET status = $1, expires_at = $2, updated_at = $3
       WHERE id = (SELECT id FROM license ORDER BY id DESC LIMIT 1)`,
      [status, expires_at ?? null, now]
    )
  } catch (error) {
    console.error('[DB] Error updating license status:', error)
    throw error
  }
}

