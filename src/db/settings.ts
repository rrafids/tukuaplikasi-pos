import Database from '@tauri-apps/plugin-sql'

const DB_PATH = 'sqlite:satria_pos.db'

let dbPromise: ReturnType<typeof Database.load> | null = null

async function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load(DB_PATH)
    const db = await dbPromise

    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }
  return dbPromise
}

export async function getSetting(key: string, defaultValue = ''): Promise<string> {
  try {
    const db = await getDb()
    const rows = await db.select<{ value: string }[]>(
      `SELECT value FROM settings WHERE key = $1`,
      [key]
    )
    return rows[0]?.value ?? defaultValue
  } catch (error) {
    console.error('[DB] Error getting setting:', error)
    return defaultValue
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3`,
      [key, value, now]
    )
  } catch (error) {
    console.error('[DB] Error setting setting:', error)
    throw error
  }
}
