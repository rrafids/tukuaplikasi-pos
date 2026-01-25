import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { recordAuditTrail } from './auditTrail'
import { recordStockMovement } from './stockMovements'

export type StockOpnameStatus = 'draft' | 'completed' | 'cancelled'

export type StockOpnameRow = {
  id: number
  location_id: number
  opname_date: string
  notes: string | null
  status: StockOpnameStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type StockOpnameItemRow = {
  id: number
  opname_id: number
  product_id: number
  system_stock: number
  actual_stock: number
  difference: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type StockOpnameWithItems = StockOpnameRow & {
  location_name: string
  location_type: string
  items: Array<StockOpnameItemRow & { product_name: string; product_barcode: string | null }>
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
      console.log('[DB] Database loaded, creating tables if not exists...')

      // Create stock_opnames table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS stock_opnames (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          location_id INTEGER NOT NULL,
          opname_date TEXT NOT NULL,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (location_id) REFERENCES locations(id)
        )
      `)

      // Create stock_opname_items table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS stock_opname_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          opname_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          system_stock REAL NOT NULL DEFAULT 0,
          actual_stock REAL NOT NULL DEFAULT 0,
          difference REAL NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (opname_id) REFERENCES stock_opnames(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `)

      console.log('[DB] Tables created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

export async function listStockOpnames(): Promise<StockOpnameWithItems[]> {
  try {
    const db = await getDb()
    const opnames = await db.select<StockOpnameRow[]>(
      `SELECT * FROM stock_opnames WHERE deleted_at IS NULL ORDER BY opname_date DESC, created_at DESC`
    )

    const result: StockOpnameWithItems[] = []

    for (const opname of opnames) {
      // Get location info
      const locationRows = await db.select<Array<{ name: string; type: string }>>(
        `SELECT name, type FROM locations WHERE id = $1`,
        [opname.location_id]
      )
      const location = locationRows[0]

      // Get items
      const items = await db.select<StockOpnameItemRow[]>(
        `SELECT * FROM stock_opname_items WHERE opname_id = $1 ORDER BY id ASC`,
        [opname.id]
      )

      // Get product names for items
      const itemsWithProducts = await Promise.all(
        items.map(async (item) => {
          const productRows = await db.select<Array<{ name: string; barcode: string | null }>>(
            `SELECT name, barcode FROM products WHERE id = $1`,
            [item.product_id]
          )
          const product = productRows[0]
          return {
            ...item,
            product_name: product?.name || 'Unknown',
            product_barcode: product?.barcode || null,
          }
        })
      )

      result.push({
        ...opname,
        location_name: location?.name || 'Unknown',
        location_type: location?.type || 'Unknown',
        items: itemsWithProducts,
      })
    }

    return result
  } catch (error) {
    console.error('[DB] Error listing stock opnames:', error)
    throw error
  }
}

export async function getStockOpname(id: number): Promise<StockOpnameWithItems | null> {
  try {
    const db = await getDb()
    const opnameRows = await db.select<StockOpnameRow[]>(
      `SELECT * FROM stock_opnames WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )

    if (opnameRows.length === 0) return null

    const opname = opnameRows[0]

    // Get location info
    const locationRows = await db.select<Array<{ name: string; type: string }>>(
      `SELECT name, type FROM locations WHERE id = $1`,
      [opname.location_id]
    )
    const location = locationRows[0]

    // Get items
    const items = await db.select<StockOpnameItemRow[]>(
      `SELECT * FROM stock_opname_items WHERE opname_id = $1 ORDER BY id ASC`,
      [opname.id]
    )

    // Get product names for items
    const itemsWithProducts = await Promise.all(
      items.map(async (item) => {
        const productRows = await db.select<Array<{ name: string; barcode: string | null }>>(
          `SELECT name, barcode FROM products WHERE id = $1`,
          [item.product_id]
        )
        const product = productRows[0]
        return {
          ...item,
          product_name: product?.name || 'Unknown',
          product_barcode: product?.barcode || null,
        }
      })
    )

    return {
      ...opname,
      location_name: location?.name || 'Unknown',
      location_type: location?.type || 'Unknown',
      items: itemsWithProducts,
    }
  } catch (error) {
    console.error('[DB] Error getting stock opname:', error)
    throw error
  }
}

export async function createStockOpname(input: {
  location_id: number
  opname_date: string
  notes?: string | null
  items: Array<{
    product_id: number
    system_stock: number
    actual_stock: number
    notes?: string | null
  }>
}): Promise<StockOpnameRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Create opname record
    await db.execute(
      `
        INSERT INTO stock_opnames (location_id, opname_date, notes, status, created_at, updated_at, deleted_at)
        VALUES ($1, $2, $3, 'draft', $4, $5, NULL)
      `,
      [input.location_id, input.opname_date, input.notes || null, now, now]
    )

    const opnameRows = await db.select<StockOpnameRow[]>(
      `SELECT * FROM stock_opnames ORDER BY id DESC LIMIT 1`
    )
    const opname = opnameRows[0]

    // Create opname items
    for (const item of input.items) {
      const difference = item.actual_stock - item.system_stock
      await db.execute(
        `
          INSERT INTO stock_opname_items (opname_id, product_id, system_stock, actual_stock, difference, notes, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          opname.id,
          item.product_id,
          item.system_stock,
          item.actual_stock,
          difference,
          item.notes || null,
          now,
          now,
        ]
      )
    }

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'stock_opname',
      entity_id: opname.id,
      action: 'create',
      old_values: {},
      new_values: {
        location_id: input.location_id,
        opname_date: input.opname_date,
        status: 'draft',
        items_count: input.items.length,
      },
      notes: `Stock opname created with ${input.items.length} items`,
    })

    return opname
  } catch (error) {
    console.error('[DB] Error creating stock opname:', error)
    throw error
  }
}

export async function updateStockOpname(
  id: number,
  input: {
    location_id?: number
    opname_date?: string
    notes?: string | null
    status?: StockOpnameStatus
    items?: Array<{
      product_id: number
      system_stock: number
      actual_stock: number
      notes?: string | null
    }>
  }
): Promise<StockOpnameRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<StockOpnameRow[]>(
      `SELECT * FROM stock_opnames WHERE id = $1`,
      [id]
    )
    const oldValues = oldRows[0]
    if (!oldValues) return null

    // Update opname record
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (input.location_id !== undefined) {
      updates.push(`location_id = $${paramIndex++}`)
      values.push(input.location_id)
    }
    if (input.opname_date !== undefined) {
      updates.push(`opname_date = $${paramIndex++}`)
      values.push(input.opname_date)
    }
    if (input.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`)
      values.push(input.notes)
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`)
      values.push(input.status)
    }

    // Always update updated_at
    updates.push(`updated_at = $${paramIndex++}`)
    values.push(now)
    values.push(id)

    await db.execute(
      `UPDATE stock_opnames SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    )

    // Update items if provided
    if (input.items !== undefined) {
      // Delete existing items
      await db.execute(`DELETE FROM stock_opname_items WHERE opname_id = $1`, [id])

      // Insert new items
      for (const item of input.items) {
        const difference = item.actual_stock - item.system_stock
        await db.execute(
          `
            INSERT INTO stock_opname_items (opname_id, product_id, system_stock, actual_stock, difference, notes, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [id, item.product_id, item.system_stock, item.actual_stock, difference, item.notes || null, now, now]
        )
      }
    }

    const updatedRows = await db.select<StockOpnameRow[]>(
      `SELECT * FROM stock_opnames WHERE id = $1`,
      [id]
    )
    const updated = updatedRows[0]

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'stock_opname',
      entity_id: id,
      action: 'update',
      old_values: {
        location_id: oldValues.location_id,
        opname_date: oldValues.opname_date,
        status: oldValues.status,
        notes: oldValues.notes,
      },
      new_values: {
        location_id: updated.location_id,
        opname_date: updated.opname_date,
        status: updated.status,
        notes: updated.notes,
      },
      notes: `Stock opname updated`,
    })

    return updated
  } catch (error) {
    console.error('[DB] Error updating stock opname:', error)
    throw error
  }
}

export async function completeStockOpname(id: number): Promise<StockOpnameRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get opname with items
    const opname = await getStockOpname(id)
    if (!opname || opname.status !== 'draft') {
      throw new Error('Stock opname not found or already completed/cancelled')
    }

    // Update status to completed
    await db.execute(
      `UPDATE stock_opnames SET status = 'completed', updated_at = $1 WHERE id = $2`,
      [now, id]
    )

    // Adjust stock for each item with difference
    for (const item of opname.items) {
      if (item.difference !== 0) {
        // Get current stock
        const stockRows = await db.select<Array<{ stock: number }>>(
          `SELECT stock FROM product_location_stocks WHERE product_id = $1 AND location_id = $2`,
          [item.product_id, opname.location_id]
        )

        if (stockRows.length > 0) {
          // Update existing stock
          await db.execute(
            `UPDATE product_location_stocks SET stock = $1 WHERE product_id = $2 AND location_id = $3`,
            [item.actual_stock, item.product_id, opname.location_id]
          )
        } else {
          // Create new stock record
          await db.execute(
            `INSERT INTO product_location_stocks (product_id, location_id, stock) VALUES ($1, $2, $3)`,
            [item.product_id, opname.location_id, item.actual_stock]
          )
        }

        // Record stock movement (using 'adjustment' type for stock opname)
        await recordStockMovement({
          product_id: item.product_id,
          location_id: opname.location_id,
          movement_type: 'adjustment',
          quantity: item.difference, // Can be positive or negative
          reference_type: 'stock_opname',
          reference_id: id,
          notes: `Stock opname adjustment: ${item.difference > 0 ? '+' : ''}${item.difference}`,
        })
      }
    }

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'stock_opname',
      entity_id: id,
      action: 'approve',
      old_values: { status: 'draft' },
      new_values: { status: 'completed' },
      notes: `Stock opname completed and stock adjusted`,
    })

    const updatedRows = await db.select<StockOpnameRow[]>(
      `SELECT * FROM stock_opnames WHERE id = $1`,
      [id]
    )
    return updatedRows[0] || null
  } catch (error) {
    console.error('[DB] Error completing stock opname:', error)
    throw error
  }
}

export async function softDeleteStockOpname(id: number): Promise<StockOpnameRow | null> {
  const db = await getDb()
  const now = new Date().toISOString()

  // Get opname info for audit trail
  const oldRows = await db.select<StockOpnameRow[]>(
    `SELECT * FROM stock_opnames WHERE id = $1`,
    [id],
  )
  const oldValues = oldRows[0]
  if (!oldValues) return null

  await db.execute(
    `UPDATE stock_opnames SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [now, now, id],
  )

  const updatedRows = await db.select<StockOpnameRow[]>(
    `SELECT * FROM stock_opnames WHERE id = $1`,
    [id],
  )
  const updated = updatedRows[0]

  await recordAuditTrail({
    entity_type: 'stock_opname',
    entity_id: id,
    action: 'delete',
    old_values: {
      location_id: oldValues.location_id,
      opname_date: oldValues.opname_date,
      status: oldValues.status,
    },
    new_values: {},
    notes: `Stock opname deleted`,
  })

  return updated
}

export async function restoreStockOpname(id: number): Promise<StockOpnameRow | null> {
  const db = await getDb()
  const now = new Date().toISOString()

  // Get opname info for audit trail
  const oldRows = await db.select<StockOpnameRow[]>(
    `SELECT * FROM stock_opnames WHERE id = $1`,
    [id],
  )
  const oldValues = oldRows[0]
  if (!oldValues) return null

  await db.execute(
    `UPDATE stock_opnames SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
    [now, id],
  )

  const updatedRows = await db.select<StockOpnameRow[]>(
    `SELECT * FROM stock_opnames WHERE id = $1`,
    [id],
  )
  const updated = updatedRows[0]

  await recordAuditTrail({
    entity_type: 'stock_opname',
    entity_id: id,
    action: 'restore',
    old_values: {},
    new_values: {
      location_id: updated.location_id,
      opname_date: updated.opname_date,
      status: updated.status,
    },
    notes: `Stock opname restored`,
  })

  return updated
}

// Get products with current stock for a location (for template generation)
export async function getProductsForOpnameTemplate(
  locationId: number
): Promise<Array<{
  product_id: number
  product_name: string
  product_barcode: string | null
  current_stock: number
}>> {
  try {
    const db = await getDb()

    // Get only products that have stock at this location
    const rows = await db.select<
      Array<{
        product_id: number
        product_name: string
        product_barcode: string | null
        stock: number
      }>
    >(
      `
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.barcode as product_barcode,
          pls.stock as stock
        FROM products p
        INNER JOIN product_location_stocks pls ON p.id = pls.product_id AND pls.location_id = $1
        WHERE p.deleted_at IS NULL AND pls.stock > 0
        ORDER BY p.name ASC
      `,
      [locationId]
    )

    return rows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      product_barcode: row.product_barcode,
      current_stock: row.stock,
    }))
  } catch (error) {
    console.error('[DB] Error getting products for opname template:', error)
    throw error
  }
}

