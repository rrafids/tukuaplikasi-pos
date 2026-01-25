import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { recordAuditTrail } from './auditTrail'

export type LocationRow = {
  id: number
  name: string
  type: 'warehouse' | 'ecommerce'
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProductLocationStockRow = {
  product_id: number
  location_id: number
  stock: number
}

// Get the database path (same as products.ts)
async function getDbPath(): Promise<string> {
  const dbPath = 'sqlite:satria_pos.db'

  if (import.meta.env.DEV) {
    try {
      const dataDir = await appDataDir()
      console.log('[DB] App data directory:', dataDir)
      console.log('[DB] Database will be at:', `${dataDir}satria_pos.db`)
    } catch (error) {
      console.warn('[DB] Could not resolve app data directory:', error)
    }
  }

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
      console.log('[DB] Database loaded, creating location tables if not exists...')

      // Create locations table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL CHECK(type IN ('warehouse', 'ecommerce')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        )
      `)

      // Create product_location_stocks junction table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS product_location_stocks (
          product_id INTEGER NOT NULL,
          location_id INTEGER NOT NULL,
          stock INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (product_id, location_id),
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
        )
      `)

      console.log('[DB] Location tables created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== LOCATIONS ====================

export async function listLocations(): Promise<LocationRow[]> {
  try {
    const db = await getDb()
    const rows = await db.select<LocationRow[]>(
      `SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY type, name ASC`,
    )
    return rows
  } catch (error) {
    console.error('[DB] Error listing locations:', error)
    throw error
  }
}

export async function createLocation(input: {
  name: string
  type: 'warehouse' | 'ecommerce'
}): Promise<LocationRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO locations (name, type, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, NULL)`,
      [input.name.trim(), input.type, now, now],
    )
    const rows = await db.select<LocationRow[]>(
      `SELECT * FROM locations ORDER BY id DESC LIMIT 1`,
    )
    const location = rows[0]

    // Record audit trail
    if (location) {
      await recordAuditTrail({
        entity_type: 'location',
        entity_id: location.id,
        action: 'create',
        new_values: {
          name: location.name,
          type: location.type,
        },
        notes: `Location created: ${location.name} (${location.type})`,
      })
    }

    return location
  } catch (error) {
    console.error('[DB] Error creating location:', error)
    throw error
  }
}

export async function updateLocation(
  id: number,
  input: { name: string; type: 'warehouse' | 'ecommerce' },
): Promise<LocationRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<LocationRow[]>(
      `SELECT * FROM locations WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE locations SET name = $1, type = $2, updated_at = $3 WHERE id = $4`,
      [input.name.trim(), input.type, now, id],
    )
    const rows = await db.select<LocationRow[]>(
      `SELECT * FROM locations WHERE id = $1`,
      [id],
    )
    const updated = rows[0] ?? null

    // Record audit trail
    if (updated && oldValues) {
      await recordAuditTrail({
        entity_type: 'location',
        entity_id: id,
        action: 'update',
        old_values: {
          name: oldValues.name,
          type: oldValues.type,
        },
        new_values: {
          name: updated.name,
          type: updated.type,
        },
        notes: `Location updated: ${updated.name} (${updated.type})`,
      })
    }

    return updated
  } catch (error) {
    console.error('[DB] Error updating location:', error)
    throw error
  }
}

export async function softDeleteLocation(id: number): Promise<LocationRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<LocationRow[]>(
      `SELECT * FROM locations WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE locations SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    )
    const rows = await db.select<LocationRow[]>(
      `SELECT * FROM locations WHERE id = $1`,
      [id],
    )
    const deleted = rows[0] ?? null

    // Record audit trail
    if (deleted && oldValues) {
      await recordAuditTrail({
        entity_type: 'location',
        entity_id: id,
        action: 'delete',
        old_values: {
          name: oldValues.name,
          type: oldValues.type,
        },
        notes: `Location deleted: ${oldValues.name} (${oldValues.type})`,
      })
    }

    return deleted
  } catch (error) {
    console.error('[DB] Error soft deleting location:', error)
    throw error
  }
}

export async function restoreLocation(id: number): Promise<LocationRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<LocationRow[]>(
      `SELECT * FROM locations WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE locations SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
      [now, id],
    )
    const rows = await db.select<LocationRow[]>(
      `SELECT * FROM locations WHERE id = $1`,
      [id],
    )
    const restored = rows[0] ?? null

    // Record audit trail
    if (restored && oldValues) {
      await recordAuditTrail({
        entity_type: 'location',
        entity_id: id,
        action: 'restore',
        new_values: {
          name: restored.name,
          type: restored.type,
        },
        notes: `Location restored: ${restored.name} (${restored.type})`,
      })
    }

    return restored
  } catch (error) {
    console.error('[DB] Error restoring location:', error)
    throw error
  }
}

// ==================== PRODUCT LOCATION STOCKS ====================

export async function getProductLocationStocks(
  productId: number,
): Promise<Array<ProductLocationStockRow & { location_name: string; location_type: string }>> {
  try {
    const db = await getDb()
    const rows = await db.select<
      Array<ProductLocationStockRow & { location_name: string; location_type: string }>
    >(
      `SELECT 
        pls.product_id,
        pls.location_id,
        pls.stock,
        l.name as location_name,
        l.type as location_type
       FROM product_location_stocks pls
       INNER JOIN locations l ON pls.location_id = l.id
       WHERE pls.product_id = $1 AND l.deleted_at IS NULL
       ORDER BY l.type, l.name ASC`,
      [productId],
    )
    return rows
  } catch (error) {
    console.error('[DB] Error getting product location stocks:', error)
    throw error
  }
}

export async function getAllProductLocationStocks(): Promise<
  Array<ProductLocationStockRow & { product_name: string; location_name: string; location_type: string; product_uom_id: number | null }>
> {
  try {
    const db = await getDb()
    const rows = await db.select<
      Array<ProductLocationStockRow & { product_name: string; location_name: string; location_type: string; product_uom_id: number | null }>
    >(
      `SELECT 
        pls.product_id,
        pls.location_id,
        pls.stock,
        p.name as product_name,
        p.uom_id as product_uom_id,
        l.name as location_name,
        l.type as location_type
       FROM product_location_stocks pls
       INNER JOIN products p ON pls.product_id = p.id
       INNER JOIN locations l ON pls.location_id = l.id
       WHERE p.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY p.name, l.type, l.name ASC`,
    )
    return rows
  } catch (error) {
    console.error('[DB] Error getting all product location stocks:', error)
    throw error
  }
}

export async function setProductLocationStock(
  productId: number,
  locationId: number,
  stock: number,
): Promise<void> {
  try {
    const db = await getDb()
    
    // Verify product exists
    const productRows = await db.select<Array<{ id: number }>>(
      `SELECT id FROM products WHERE id = $1`,
      [productId],
    )
    
    if (productRows.length === 0) {
      throw new Error('Product not found')
    }
    
    // Validate stock is not negative
    if (stock < 0) {
      throw new Error('Stock cannot be negative')
    }
    
    // Use INSERT OR REPLACE to handle both insert and update
    await db.execute(
      `INSERT OR REPLACE INTO product_location_stocks (product_id, location_id, stock)
       VALUES ($1, $2, $3)`,
      [productId, locationId, stock],
    )
  } catch (error) {
    console.error('[DB] Error setting product location stock:', error)
    throw error
  }
}

export async function getTotalLocationStockForProduct(
  productId: number,
  excludeLocationId?: number,
): Promise<number> {
  try {
    const db = await getDb()
    
    // Get current location stocks for this product
    let query = `SELECT stock FROM product_location_stocks WHERE product_id = $1`
    const params: (number | undefined)[] = [productId]
    
    if (excludeLocationId !== undefined) {
      query += ` AND location_id != $2`
      params.push(excludeLocationId)
    }
    
    const currentStocks = await db.select<Array<{ stock: number }>>(query, params)
    
    // Calculate total allocated stock
    return currentStocks.reduce((sum, s) => sum + s.stock, 0)
  } catch (error) {
    console.error('[DB] Error getting total location stock:', error)
    throw error
  }
}

export async function deleteProductLocationStock(
  productId: number,
  locationId: number,
): Promise<void> {
  try {
    const db = await getDb()
    await db.execute(
      `DELETE FROM product_location_stocks WHERE product_id = $1 AND location_id = $2`,
      [productId, locationId],
    )
  } catch (error) {
    console.error('[DB] Error deleting product location stock:', error)
    throw error
  }
}

