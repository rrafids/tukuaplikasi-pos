import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { recordAuditTrail } from './auditTrail'

export type ProductRow = {
  id: number
  name: string
  price: number
  barcode: string | null
  uom_id: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// Get the database path
// Tauri SQL plugin stores databases relative to app data directory
// The path automatically resolves to the correct location per platform:
// - macOS: ~/Library/Application Support/{identifier}/satria_pos.db
// - Windows: %APPDATA%\{identifier}\satria_pos.db (e.g., C:\Users\Username\AppData\Roaming\{identifier}\satria_pos.db)
// - Linux: ~/.config/{identifier}/satria_pos.db
async function getDbPath(): Promise<string> {
  // Use simple path in app data directory root
  // This is the most reliable approach with Tauri SQL plugin
  const dbPath = 'sqlite:satria_pos.db'
  
  // Log the actual full path for debugging (only in dev mode)
  if (import.meta.env.DEV) {
    try {
      const dataDir = await appDataDir()
      console.log('[DB] App data directory:', dataDir)
      console.log('[DB] Database will be at:', `${dataDir}satria_pos.db`)
    } catch (error) {
      console.warn('[DB] Could not resolve app data directory:', error)
    }
  }
  
  console.log('[DB] Using database path:', dbPath)
  return dbPath
}

// Cache the database promise and path so we open only once
let dbPromise: ReturnType<typeof Database.load> | null = null
let dbPath: string | null = null

async function getDb() {
  if (!dbPromise) {
    try {
      if (!dbPath) {
        dbPath = await getDbPath()
      }
      console.log('[DB] Loading database from:', dbPath)
      dbPromise = Database.load(dbPath)
      const db = await dbPromise
      console.log('[DB] Database loaded, creating table if not exists...')
      await db.execute(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          price REAL NOT NULL,
          barcode TEXT UNIQUE,
          uom_id INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (uom_id) REFERENCES uoms(id)
        )
      `)
      
      // Add uom_id column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE products ADD COLUMN uom_id INTEGER`)
      } catch (error) {
        // Column already exists, ignore error
        console.log('[DB] uom_id column may already exist')
      }

      // Add barcode column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE products ADD COLUMN barcode TEXT UNIQUE`)
      } catch (error) {
        // Column already exists, ignore error
        console.log('[DB] barcode column may already exist')
      }
      console.log('[DB] Table created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

export async function listProducts(): Promise<ProductRow[]> {
  try {
    const db = await getDb()
    console.log('[DB] Executing SELECT query...')
    const rows = await db.select<ProductRow[]>(
      `SELECT * FROM products ORDER BY id ASC`,
    )
    console.log('[DB] SELECT returned rows:', rows)
    return rows
  } catch (error) {
    console.error('[DB] Error listing products:', error)
    throw error
  }
}

export async function createProduct(input: {
  name: string
  price: number
  barcode?: string | null
  uom_id?: number | null
}): Promise<ProductRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()
    console.log('[DB] Executing INSERT:', input)
    await db.execute(
      `
        INSERT INTO products (name, price, barcode, uom_id, created_at, updated_at, deleted_at)
        VALUES ($1, $2, $3, $4, $5, $6, NULL)
      `,
      [
        input.name,
        input.price,
        input.barcode?.trim() || null,
        input.uom_id ?? null,
        now,
        now,
      ],
    )
    const rows = await db.select<ProductRow[]>(
      `SELECT * FROM products ORDER BY id DESC LIMIT 1`,
    )
    console.log('[DB] Created product row:', rows[0])
    return rows[0]
  } catch (error) {
    console.error('[DB] Error creating product:', error)
    throw error
  }
}

export async function updateProduct(
  id: number,
  input: {
    name: string
    price: number
    barcode?: string | null
    uom_id?: number | null
  },
): Promise<ProductRow | null> {
  const db = await getDb()
  const now = new Date().toISOString()

  // Get old values for audit trail
  const oldRows = await db.select<ProductRow[]>(
    `SELECT * FROM products WHERE id = $1`,
    [id],
  )
  const oldValues = oldRows[0]

  await db.execute(
    `
      UPDATE products
      SET name = $1,
          price = $2,
          barcode = $3,
          uom_id = $4,
          updated_at = $5
      WHERE id = $6
    `,
    [
      input.name,
      input.price,
      input.barcode !== undefined
        ? (input.barcode?.trim() || null)
        : oldValues?.barcode ?? null,
      input.uom_id ?? null,
      now,
      id,
    ],
  )
  const rows = await db.select<ProductRow[]>(
    `SELECT * FROM products WHERE id = $1`,
    [id],
  )
  const updated = rows[0] ?? null

  // Record audit trail
  if (updated && oldValues) {
    await recordAuditTrail({
      entity_type: 'product',
      entity_id: id,
      action: 'update',
      old_values: {
        name: oldValues.name,
        price: oldValues.price,
        barcode: oldValues.barcode,
        uom_id: oldValues.uom_id,
      },
      new_values: {
        name: updated.name,
        price: updated.price,
        barcode: updated.barcode,
        uom_id: updated.uom_id,
      },
      notes: `Product updated: ${updated.name}`,
    })
  }

  return updated
}

export async function softDeleteProduct(id: number): Promise<ProductRow | null> {
  const db = await getDb()
  const now = new Date().toISOString()

  // Get product info for audit trail
  const oldRows = await db.select<ProductRow[]>(
    `SELECT * FROM products WHERE id = $1`,
    [id],
  )
  const oldValues = oldRows[0]

  await db.execute(
    `
      UPDATE products
      SET deleted_at = $1,
          updated_at = $1
      WHERE id = $2
    `,
    [now, id],
  )
  const rows = await db.select<ProductRow[]>(
    `SELECT * FROM products WHERE id = $1`,
    [id],
  )
  const deleted = rows[0] ?? null

  // Record audit trail
  if (deleted && oldValues) {
    await recordAuditTrail({
      entity_type: 'product',
      entity_id: id,
      action: 'delete',
      old_values: {
        name: oldValues.name,
        price: oldValues.price,
        uom_id: oldValues.uom_id,
      },
      notes: `Product deleted: ${oldValues.name}`,
    })
  }

  return deleted
}

export async function restoreProduct(id: number): Promise<ProductRow | null> {
  const db = await getDb()
  const now = new Date().toISOString()

  // Get old values for audit trail
  const oldRows = await db.select<ProductRow[]>(
    `SELECT * FROM products WHERE id = $1`,
    [id],
  )
  const oldValues = oldRows[0]

  await db.execute(
    `
      UPDATE products
      SET deleted_at = NULL,
          updated_at = $1
      WHERE id = $2
    `,
    [now, id],
  )
  const rows = await db.select<ProductRow[]>(
    `SELECT * FROM products WHERE id = $1`,
    [id],
  )
  const restored = rows[0] ?? null

  // Record audit trail
  if (restored && oldValues) {
    await recordAuditTrail({
      entity_type: 'product',
      entity_id: id,
      action: 'restore',
      new_values: {
        name: restored.name,
        price: restored.price,
      },
      notes: `Product restored: ${restored.name}`,
    })
  }

  return restored
}


