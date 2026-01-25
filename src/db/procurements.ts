import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { setProductLocationStock } from './locations'
import { recordStockMovement } from './stockMovements'
import { recordAuditTrail } from './auditTrail'
import { convertUOMQuantity } from './uoms'

export type ProcurementStatus = 'pending' | 'approved' | 'rejected'

export type ProcurementRow = {
  id: number
  product_id: number
  location_id: number
  quantity: number
  unit_price: number | null
  supplier: string | null
  pic: string | null
  notes: string | null
  status: ProcurementStatus
  uom_id: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
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
      console.log('[DB] Database loaded, creating procurements table if not exists...')

      // Create procurements table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS procurements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          location_id INTEGER NOT NULL,
          quantity REAL NOT NULL CHECK(quantity > 0),
          unit_price REAL,
          supplier TEXT,
          pic TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
          uom_id INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
          FOREIGN KEY (uom_id) REFERENCES uoms(id)
        )
      `)

      // Add uom_id column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE procurements ADD COLUMN uom_id INTEGER`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] uom_id column already exists or error adding it:', error)
      }

      // Add pic column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE procurements ADD COLUMN pic TEXT`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] pic column already exists or error adding it:', error)
      }

      // Add status column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE procurements ADD COLUMN status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected'))`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] Status column already exists or error adding it:', error)
      }

      console.log('[DB] Procurements table created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== PROCUREMENTS ====================

export async function listProcurements(): Promise<
  Array<
    ProcurementRow & {
      product_name: string
      location_name: string
      location_type: string
    }
  >
> {
  try {
    const db = await getDb()
    const rows = await db.select<
      Array<
        ProcurementRow & {
          product_name: string
          location_name: string
          location_type: string
        }
      >
    >(
      `SELECT 
        pr.id,
        pr.product_id,
        pr.location_id,
        pr.quantity,
        pr.unit_price,
        pr.supplier,
        pr.pic,
        pr.notes,
        pr.status,
        pr.uom_id,
        pr.created_at,
        pr.updated_at,
        pr.deleted_at,
        p.name as product_name,
        l.name as location_name,
        l.type as location_type
       FROM procurements pr
       INNER JOIN products p ON pr.product_id = p.id
       INNER JOIN locations l ON pr.location_id = l.id
       WHERE pr.deleted_at IS NULL AND p.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY pr.created_at DESC`,
    )
    return rows
  } catch (error) {
    console.error('[DB] Error listing procurements:', error)
    throw error
  }
}

export async function createProcurement(input: {
  product_id: number
  location_id: number
  quantity: number
  unit_price?: number | null
  supplier?: string | null
  pic?: string | null
  notes?: string | null
  uom_id?: number | null
}): Promise<ProcurementRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Validate quantity
    if (input.quantity <= 0) {
      throw new Error('Quantity must be greater than 0')
    }

    // Create the procurement record with status 'pending' (stock not updated yet)
    await db.execute(
      `INSERT INTO procurements (
        product_id, location_id, quantity, unit_price, supplier, pic, notes, status, uom_id,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)`,
      [
        input.product_id,
        input.location_id,
        input.quantity,
        input.unit_price ?? null,
        input.supplier?.trim() || null,
        input.pic?.trim() || null,
        input.notes?.trim() || null,
        'pending',
        input.uom_id ?? null,
        now,
        now,
      ],
    )

    // Get the created procurement
    const rows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements ORDER BY id DESC LIMIT 1`,
    )
    const procurement = rows[0]

    // Record audit trail
    if (procurement) {
      await recordAuditTrail({
        entity_type: 'procurement',
        entity_id: procurement.id,
        action: 'create',
        new_values: {
          product_id: procurement.product_id,
          location_id: procurement.location_id,
          quantity: procurement.quantity,
          unit_price: procurement.unit_price,
          supplier: procurement.supplier,
          status: procurement.status,
        },
        notes: `Procurement created: ${procurement.quantity} units`,
      })
    }

    console.log(
      `[DB] Procurement created with status 'pending' (stock will be updated after approval)`,
    )

    return procurement
  } catch (error) {
    console.error('[DB] Error creating procurement:', error)
    throw error
  }
}

export async function approveProcurement(id: number): Promise<ProcurementRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the procurement
    const existingRows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    if (existing.status === 'approved') {
      throw new Error('Procurement is already approved')
    }

    // Validate conversion BEFORE updating status
    // Get product's base UOM
    const productRows = await db.select<Array<{ uom_id: number | null }>>(
      `SELECT uom_id FROM products WHERE id = $1`,
      [existing.product_id],
    )
    const productUomId = productRows[0]?.uom_id ?? null

    // Convert quantity to base UOM if different UOM is used
    let quantityInBaseUOM = existing.quantity
    if (existing.uom_id && productUomId && existing.uom_id !== productUomId) {
      const converted = await convertUOMQuantity(
        existing.quantity,
        existing.uom_id,
        productUomId,
      )
      if (converted === null) {
        throw new Error(
          `No conversion available from procurement UOM to product's base UOM. Please define a conversion in the UOMs menu.`,
        )
      }
      quantityInBaseUOM = converted
    }

    // Only update status AFTER all validations pass
    await db.execute(
      `UPDATE procurements SET status = 'approved', updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Update product location stock by adding the quantity (in base UOM)
    const currentStockRows = await db.select<Array<{ stock: number }>>(
      `SELECT stock FROM product_location_stocks 
       WHERE product_id = $1 AND location_id = $2`,
      [existing.product_id, existing.location_id],
    )

    const currentStock = currentStockRows[0]?.stock ?? 0
    const newStock = currentStock + quantityInBaseUOM

    await setProductLocationStock(
      existing.product_id,
      existing.location_id,
      newStock,
    )

    // Record stock movement (using base UOM quantity)
    await recordStockMovement({
      product_id: existing.product_id,
      location_id: existing.location_id,
      movement_type: 'procurement',
      quantity: quantityInBaseUOM,
      reference_id: existing.id,
      reference_type: 'procurement',
      notes: `Procurement approved: ${existing.quantity} units${existing.uom_id && productUomId && existing.uom_id !== productUomId ? ` (${quantityInBaseUOM} in base UOM)` : ''}${existing.supplier ? ` from ${existing.supplier}` : ''}`,
    })

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'procurement',
      entity_id: id,
      action: 'approve',
      old_values: {
        status: existing.status,
      },
      new_values: {
        status: 'approved',
      },
      notes: `Procurement approved: ${existing.quantity} units`,
    })

    console.log(
      `[DB] Procurement approved and stock updated: ${currentStock} + ${quantityInBaseUOM} = ${newStock}`,
    )

    const rows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error approving procurement:', error)
    throw error
  }
}

export async function rejectProcurement(id: number): Promise<ProcurementRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the procurement
    const existingRows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    if (existing.status === 'rejected') {
      throw new Error('Procurement is already rejected')
    }

    // If it was approved, revert the stock change
    if (existing.status === 'approved') {
      const currentStockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [existing.product_id, existing.location_id],
      )
      const currentStock = currentStockRows[0]?.stock ?? 0
      const newStock = Math.max(0, currentStock - existing.quantity)

      await setProductLocationStock(
        existing.product_id,
        existing.location_id,
        newStock,
      )
    }

    // Update status to rejected
    await db.execute(
      `UPDATE procurements SET status = 'rejected', updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'procurement',
      entity_id: id,
      action: 'reject',
      old_values: {
        status: existing.status,
      },
      new_values: {
        status: 'rejected',
      },
      notes: `Procurement rejected: ${existing.quantity} units`,
    })

    const rows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error rejecting procurement:', error)
    throw error
  }
}

export async function updateProcurement(
  id: number,
  input: {
    product_id?: number
    location_id?: number
    quantity?: number
    unit_price?: number | null
    supplier?: string | null
    pic?: string | null
    notes?: string | null
    status?: ProcurementStatus
    uom_id?: number | null
  },
): Promise<ProcurementRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the existing procurement
    const existingRows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Only update stock if the procurement was previously approved
    // If status is changing from approved to something else, revert stock
    // If status is changing to approved, add stock
    const statusChanged = input.status !== undefined && input.status !== existing.status
    const wasApproved = existing.status === 'approved'

    if (statusChanged) {
      if (wasApproved && input.status !== 'approved') {
        // Revert the stock change (was approved, now not approved)
        const currentStockRows = await db.select<Array<{ stock: number }>>(
          `SELECT stock FROM product_location_stocks 
           WHERE product_id = $1 AND location_id = $2`,
          [existing.product_id, existing.location_id],
        )
        const currentStock = currentStockRows[0]?.stock ?? 0
        const newStock = Math.max(0, currentStock - existing.quantity)
        await setProductLocationStock(
          existing.product_id,
          existing.location_id,
          newStock,
        )
      } else if (!wasApproved && input.status === 'approved') {
        // Add stock (was not approved, now approved)
        const currentStockRows = await db.select<Array<{ stock: number }>>(
          `SELECT stock FROM product_location_stocks 
           WHERE product_id = $1 AND location_id = $2`,
          [existing.product_id, existing.location_id],
        )
        const currentStock = currentStockRows[0]?.stock ?? 0
        const newStock = currentStock + existing.quantity
        await setProductLocationStock(
          existing.product_id,
          existing.location_id,
          newStock,
        )
      }
    } else if (wasApproved) {
      // If already approved and quantity/location/product changed, adjust stock
      const quantityChanged = input.quantity !== undefined && input.quantity !== existing.quantity
      const locationChanged = input.location_id !== undefined && input.location_id !== existing.location_id
      const productChanged = input.product_id !== undefined && input.product_id !== existing.product_id

      if (quantityChanged || locationChanged || productChanged) {
        // Revert the old stock change
        const oldCurrentStockRows = await db.select<Array<{ stock: number }>>(
          `SELECT stock FROM product_location_stocks 
           WHERE product_id = $1 AND location_id = $2`,
          [existing.product_id, existing.location_id],
        )
        const oldCurrentStock = oldCurrentStockRows[0]?.stock ?? 0
        const oldStockAfterRevert = Math.max(0, oldCurrentStock - existing.quantity)
        await setProductLocationStock(
          existing.product_id,
          existing.location_id,
          oldStockAfterRevert,
        )

        // Apply the new stock change
        const newProductId = input.product_id ?? existing.product_id
        const newLocationId = input.location_id ?? existing.location_id
        const newQuantity = input.quantity ?? existing.quantity

        const newCurrentStockRows = await db.select<Array<{ stock: number }>>(
          `SELECT stock FROM product_location_stocks 
           WHERE product_id = $1 AND location_id = $2`,
          [newProductId, newLocationId],
        )
        const newCurrentStock = newCurrentStockRows[0]?.stock ?? 0
        const newStock = newCurrentStock + newQuantity

        await setProductLocationStock(newProductId, newLocationId, newStock)
      }
    }

    // Update the procurement record
    const updateFields: string[] = []
    const updateValues: unknown[] = []
    let paramIndex = 1

    if (input.product_id !== undefined) {
      updateFields.push(`product_id = $${paramIndex++}`)
      updateValues.push(input.product_id)
    }
    if (input.location_id !== undefined) {
      updateFields.push(`location_id = $${paramIndex++}`)
      updateValues.push(input.location_id)
    }
    if (input.quantity !== undefined) {
      if (input.quantity <= 0) {
        throw new Error('Quantity must be greater than 0')
      }
      updateFields.push(`quantity = $${paramIndex++}`)
      updateValues.push(input.quantity)
    }
    if (input.unit_price !== undefined) {
      updateFields.push(`unit_price = $${paramIndex++}`)
      updateValues.push(input.unit_price)
    }
    if (input.supplier !== undefined) {
      updateFields.push(`supplier = $${paramIndex++}`)
      updateValues.push(input.supplier?.trim() || null)
    }
    if (input.pic !== undefined) {
      updateFields.push(`pic = $${paramIndex++}`)
      updateValues.push(input.pic?.trim() || null)
    }
    if (input.notes !== undefined) {
      updateFields.push(`notes = $${paramIndex++}`)
      updateValues.push(input.notes?.trim() || null)
    }
    if (input.status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`)
      updateValues.push(input.status)
    }
    if (input.uom_id !== undefined) {
      updateFields.push(`uom_id = $${paramIndex++}`)
      updateValues.push(input.uom_id ?? null)
    }

    updateFields.push(`updated_at = $${paramIndex++}`)
    updateValues.push(now)
    updateValues.push(id)

    await db.execute(
      `UPDATE procurements SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues,
    )

    const rows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error updating procurement:', error)
    throw error
  }
}

export async function softDeleteProcurement(id: number): Promise<ProcurementRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the procurement before deleting
    const existingRows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Only revert stock if it was approved
    if (existing.status === 'approved') {
      const currentStockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [existing.product_id, existing.location_id],
      )
      const currentStock = currentStockRows[0]?.stock ?? 0
      const newStock = Math.max(0, currentStock - existing.quantity)

      await setProductLocationStock(
        existing.product_id,
        existing.location_id,
        newStock,
      )
    }

    // Soft delete the procurement
    await db.execute(
      `UPDATE procurements SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    const rows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error soft deleting procurement:', error)
    throw error
  }
}

export async function restoreProcurement(id: number): Promise<ProcurementRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the procurement before restoring
    const existingRows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Only restore stock if it was approved before deletion
    if (existing.status === 'approved') {
      const currentStockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [existing.product_id, existing.location_id],
      )
      const currentStock = currentStockRows[0]?.stock ?? 0
      const newStock = currentStock + existing.quantity

      await setProductLocationStock(
        existing.product_id,
        existing.location_id,
        newStock,
      )
    }

    // Restore the procurement
    await db.execute(
      `UPDATE procurements SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'procurement',
      entity_id: id,
      action: 'restore',
      new_values: {
        product_id: existing.product_id,
        location_id: existing.location_id,
        quantity: existing.quantity,
        status: existing.status,
      },
      notes: `Procurement restored: ${existing.quantity} units`,
    })

    const rows = await db.select<ProcurementRow[]>(
      `SELECT * FROM procurements WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error restoring procurement:', error)
    throw error
  }
}
