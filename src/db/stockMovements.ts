import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'

export type StockMovementType =
  | 'procurement'
  | 'sale'
  | 'disposal'
  | 'adjustment'
  | 'transfer'

export type StockMovementRow = {
  id: number
  product_id: number
  location_id: number
  movement_type: StockMovementType
  quantity: number // Positive for increases, negative for decreases
  reference_id: number | null // ID of the related transaction (procurement, sale, disposal, etc.)
  reference_type: string | null // Type of reference (e.g., 'procurement', 'sale', 'disposal')
  notes: string | null
  created_at: string
}

export type StockMovementWithDetails = StockMovementRow & {
  product_name: string
  location_name: string
  location_type: string
}

// Get the database path
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
      console.log('[DB] Database loaded, creating stock_movements table if not exists...')

      // Create stock_movements table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          location_id INTEGER NOT NULL,
          movement_type TEXT NOT NULL CHECK(movement_type IN ('procurement', 'sale', 'disposal', 'adjustment', 'transfer')),
          quantity INTEGER NOT NULL,
          reference_id INTEGER,
          reference_type TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
        )
      `)

      // Create index for faster queries
      try {
        await db.execute(
          `CREATE INDEX IF NOT EXISTS idx_stock_movements_product_location ON stock_movements(product_id, location_id)`,
        )
        await db.execute(
          `CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC)`,
        )
      } catch (error) {
        // Indexes might already exist
        console.log('[DB] Indexes might already exist:', error)
      }

      console.log('[DB] Stock movements table created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== STOCK MOVEMENTS ====================

/**
 * Record a stock movement
 */
export async function recordStockMovement(input: {
  product_id: number
  location_id: number
  movement_type: StockMovementType
  quantity: number // Positive for increases, negative for decreases
  reference_id?: number | null
  reference_type?: string | null
  notes?: string | null
}): Promise<StockMovementRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    await db.execute(
      `INSERT INTO stock_movements (
        product_id, location_id, movement_type, quantity,
        reference_id, reference_type, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.product_id,
        input.location_id,
        input.movement_type,
        input.quantity,
        input.reference_id ?? null,
        input.reference_type ?? null,
        input.notes?.trim() || null,
        now,
      ],
    )

    const rows = await db.select<StockMovementRow[]>(
      `SELECT * FROM stock_movements ORDER BY id DESC LIMIT 1`,
    )
    return rows[0]
  } catch (error) {
    console.error('[DB] Error recording stock movement:', error)
    throw error
  }
}

/**
 * List all stock movements with product and location details
 */
export async function listStockMovements(): Promise<StockMovementWithDetails[]> {
  try {
    const db = await getDb()
    const rows = await db.select<StockMovementWithDetails[]>(
      `SELECT 
        sm.id,
        sm.product_id,
        sm.location_id,
        sm.movement_type,
        sm.quantity,
        sm.reference_id,
        sm.reference_type,
        sm.notes,
        sm.created_at,
        p.name as product_name,
        l.name as location_name,
        l.type as location_type
       FROM stock_movements sm
       INNER JOIN products p ON sm.product_id = p.id
       INNER JOIN locations l ON sm.location_id = l.id
       WHERE p.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY sm.created_at DESC`,
    )
    return rows
  } catch (error) {
    console.error('[DB] Error listing stock movements:', error)
    throw error
  }
}

/**
 * Get stock movements for a specific product
 */
export async function getStockMovementsByProduct(
  productId: number,
): Promise<StockMovementWithDetails[]> {
  try {
    const db = await getDb()
    const rows = await db.select<StockMovementWithDetails[]>(
      `SELECT 
        sm.id,
        sm.product_id,
        sm.location_id,
        sm.movement_type,
        sm.quantity,
        sm.reference_id,
        sm.reference_type,
        sm.notes,
        sm.created_at,
        p.name as product_name,
        l.name as location_name,
        l.type as location_type
       FROM stock_movements sm
       INNER JOIN products p ON sm.product_id = p.id
       INNER JOIN locations l ON sm.location_id = l.id
       WHERE sm.product_id = $1 AND p.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY sm.created_at DESC`,
      [productId],
    )
    return rows
  } catch (error) {
    console.error('[DB] Error getting stock movements by product:', error)
    throw error
  }
}

/**
 * Get stock movements for a specific location
 */
export async function getStockMovementsByLocation(
  locationId: number,
): Promise<StockMovementWithDetails[]> {
  try {
    const db = await getDb()
    const rows = await db.select<StockMovementWithDetails[]>(
      `SELECT 
        sm.id,
        sm.product_id,
        sm.location_id,
        sm.movement_type,
        sm.quantity,
        sm.reference_id,
        sm.reference_type,
        sm.notes,
        sm.created_at,
        p.name as product_name,
        l.name as location_name,
        l.type as location_type
       FROM stock_movements sm
       INNER JOIN products p ON sm.product_id = p.id
       INNER JOIN locations l ON sm.location_id = l.id
       WHERE sm.location_id = $1 AND p.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY sm.created_at DESC`,
      [locationId],
    )
    return rows
  } catch (error) {
    console.error('[DB] Error getting stock movements by location:', error)
    throw error
  }
}

/**
 * Transfer stock from one location to another
 */
export async function transferStock(input: {
  product_id: number
  from_location_id: number
  to_location_id: number
  quantity: number
  notes?: string | null
}): Promise<{ fromMovement: StockMovementRow; toMovement: StockMovementRow }> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Validate locations are different
    if (input.from_location_id === input.to_location_id) {
      throw new Error('Source and destination locations must be different')
    }

    // Validate quantity
    if (input.quantity <= 0) {
      throw new Error('Quantity must be greater than 0')
    }

    // Check if source location has enough stock
    const sourceStockRows = await db.select<Array<{ stock: number }>>(
      `SELECT stock FROM product_location_stocks 
       WHERE product_id = $1 AND location_id = $2`,
      [input.product_id, input.from_location_id],
    )
    const sourceStock = sourceStockRows[0]?.stock ?? 0

    if (sourceStock < input.quantity) {
      throw new Error(
        `Insufficient stock. Available: ${sourceStock}, Requested: ${input.quantity}`,
      )
    }

    // Get destination stock
    const destStockRows = await db.select<Array<{ stock: number }>>(
      `SELECT stock FROM product_location_stocks 
       WHERE product_id = $1 AND location_id = $2`,
      [input.product_id, input.to_location_id],
    )
    const destStock = destStockRows[0]?.stock ?? 0

    // Update source location stock (decrease)
    const newSourceStock = sourceStock - input.quantity
    await db.execute(
      `INSERT OR REPLACE INTO product_location_stocks (product_id, location_id, stock)
       VALUES ($1, $2, $3)`,
      [input.product_id, input.from_location_id, newSourceStock],
    )

    // Update destination location stock (increase)
    const newDestStock = destStock + input.quantity
    await db.execute(
      `INSERT OR REPLACE INTO product_location_stocks (product_id, location_id, stock)
       VALUES ($1, $2, $3)`,
      [input.product_id, input.to_location_id, newDestStock],
    )

    // Record stock movement for source location (negative)
    await db.execute(
      `INSERT INTO stock_movements (
        product_id, location_id, movement_type, quantity,
        reference_id, reference_type, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.product_id,
        input.from_location_id,
        'transfer',
        -input.quantity, // Negative for decrease
        null, // Will be set after creating the to movement
        'transfer',
        input.notes?.trim() || `Transfer to location ID ${input.to_location_id}`,
        now,
      ],
    )

    const fromMovementRows = await db.select<StockMovementRow[]>(
      `SELECT * FROM stock_movements ORDER BY id DESC LIMIT 1`,
    )
    const fromMovement = fromMovementRows[0]

    // Record stock movement for destination location (positive)
    await db.execute(
      `INSERT INTO stock_movements (
        product_id, location_id, movement_type, quantity,
        reference_id, reference_type, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.product_id,
        input.to_location_id,
        'transfer',
        input.quantity, // Positive for increase
        fromMovement.id, // Reference to the from movement
        'transfer',
        input.notes?.trim() || `Transfer from location ID ${input.from_location_id}`,
        now,
      ],
    )

    const toMovementRows = await db.select<StockMovementRow[]>(
      `SELECT * FROM stock_movements ORDER BY id DESC LIMIT 1`,
    )
    const toMovement = toMovementRows[0]

    // Update the from movement to reference the to movement
    await db.execute(
      `UPDATE stock_movements SET reference_id = $1 WHERE id = $2`,
      [toMovement.id, fromMovement.id],
    )

    return {
      fromMovement: { ...fromMovement, reference_id: toMovement.id },
      toMovement,
    }
  } catch (error) {
    console.error('[DB] Error transferring stock:', error)
    throw error
  }
}

