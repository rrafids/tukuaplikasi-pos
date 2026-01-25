import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { setProductLocationStock } from './locations'
import { recordStockMovement } from './stockMovements'
import { recordAuditTrail } from './auditTrail'

export type DisposalStatus = 'pending' | 'approved' | 'rejected'

export type DisposalRow = {
  id: number
  product_id: number
  location_id: number
  quantity: number
  reason: string | null
  pic: string | null
  notes: string | null
  status: DisposalStatus
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
      console.log('[DB] Database loaded, creating disposals table if not exists...')

      // Create disposals table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS disposals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          location_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL CHECK(quantity > 0),
          reason TEXT,
          pic TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
        )
      `)

      // Add status column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE disposals ADD COLUMN status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected'))`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] Status column already exists or error adding it:', error)
      }

      // Add pic column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE disposals ADD COLUMN pic TEXT`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] pic column already exists or error adding it:', error)
      }

      console.log('[DB] Disposals table created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== DISPOSALS ====================

export async function listDisposals(): Promise<
  Array<
    DisposalRow & {
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
        DisposalRow & {
          product_name: string
          location_name: string
          location_type: string
        }
      >
    >(
      `SELECT 
        d.id,
        d.product_id,
        d.location_id,
        d.quantity,
        d.reason,
        d.pic,
        d.notes,
        d.status,
        d.created_at,
        d.updated_at,
        d.deleted_at,
        p.name as product_name,
        l.name as location_name,
        l.type as location_type
       FROM disposals d
       INNER JOIN products p ON d.product_id = p.id
       INNER JOIN locations l ON d.location_id = l.id
       WHERE d.deleted_at IS NULL AND p.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY d.created_at DESC`,
    )
    return rows
  } catch (error) {
    console.error('[DB] Error listing disposals:', error)
    throw error
  }
}

export async function createDisposal(input: {
  product_id: number
  location_id: number
  quantity: number
  reason?: string | null
  pic?: string | null
  notes?: string | null
}): Promise<DisposalRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Validate quantity
    if (input.quantity <= 0) {
      throw new Error('Quantity must be greater than 0')
    }

    // Check if there's enough stock at the location
    const stockRows = await db.select<Array<{ stock: number }>>(
      `SELECT stock FROM product_location_stocks 
       WHERE product_id = $1 AND location_id = $2`,
      [input.product_id, input.location_id],
    )
    const currentStock = stockRows[0]?.stock ?? 0

    if (currentStock < input.quantity) {
      throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${input.quantity}`)
    }

    // Create the disposal record with status 'pending' (stock not reduced yet)
    await db.execute(
      `INSERT INTO disposals (
        product_id, location_id, quantity, reason, pic, notes, status,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)`,
      [
        input.product_id,
        input.location_id,
        input.quantity,
        input.reason?.trim() || null,
        input.pic?.trim() || null,
        input.notes?.trim() || null,
        'pending',
        now,
        now,
      ],
    )

    // Get the created disposal
    const rows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals ORDER BY id DESC LIMIT 1`,
    )
    const disposal = rows[0]

    // Record audit trail
    if (disposal) {
      await recordAuditTrail({
        entity_type: 'disposal',
        entity_id: disposal.id,
        action: 'create',
        new_values: {
          product_id: disposal.product_id,
          location_id: disposal.location_id,
          quantity: disposal.quantity,
          reason: disposal.reason,
          pic: disposal.pic,
          status: disposal.status,
        },
        notes: `Disposal created: ${disposal.quantity} units`,
      })
    }

    console.log(
      `[DB] Disposal created with status 'pending' (stock will be reduced after approval)`,
    )

    return disposal
  } catch (error) {
    console.error('[DB] Error creating disposal:', error)
    throw error
  }
}

export async function approveDisposal(id: number): Promise<DisposalRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the disposal
    const existingRows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    if (existing.status === 'approved') {
      throw new Error('Disposal is already approved')
    }

    // Check if there's enough stock
    const stockRows = await db.select<Array<{ stock: number }>>(
      `SELECT stock FROM product_location_stocks 
       WHERE product_id = $1 AND location_id = $2`,
      [existing.product_id, existing.location_id],
    )
    const currentStock = stockRows[0]?.stock ?? 0

    if (currentStock < existing.quantity) {
      throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${existing.quantity}`)
    }

    // Update status to approved
    await db.execute(
      `UPDATE disposals SET status = 'approved', updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Reduce product location stock
    const newStock = currentStock - existing.quantity

    await setProductLocationStock(
      existing.product_id,
      existing.location_id,
      newStock,
    )

    // Record stock movement
    await recordStockMovement({
      product_id: existing.product_id,
      location_id: existing.location_id,
      movement_type: 'disposal',
      quantity: -existing.quantity, // Negative for decrease
      reference_id: existing.id,
      reference_type: 'disposal',
      notes: `Disposal approved: ${existing.quantity} units${existing.reason ? ` - ${existing.reason}` : ''}`,
    })

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'disposal',
      entity_id: id,
      action: 'approve',
      old_values: {
        status: existing.status,
      },
      new_values: {
        status: 'approved',
      },
      notes: `Disposal approved: ${existing.quantity} units${existing.reason ? ` - ${existing.reason}` : ''}`,
    })

    console.log(
      `[DB] Disposal approved and stock reduced: ${currentStock} - ${existing.quantity} = ${newStock}`,
    )

    const rows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error approving disposal:', error)
    throw error
  }
}

export async function rejectDisposal(id: number): Promise<DisposalRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the disposal
    const existingRows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    if (existing.status === 'rejected') {
      throw new Error('Disposal is already rejected')
    }

    // If it was approved, restore the stock
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

    // Update status to rejected
    await db.execute(
      `UPDATE disposals SET status = 'rejected', updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'disposal',
      entity_id: id,
      action: 'reject',
      old_values: {
        status: existing.status,
      },
      new_values: {
        status: 'rejected',
      },
      notes: `Disposal rejected: ${existing.quantity} units`,
    })

    const rows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error rejecting disposal:', error)
    throw error
  }
}

export async function updateDisposal(
  id: number,
  input: {
    product_id?: number
    location_id?: number
    quantity?: number
    reason?: string | null
    pic?: string | null
    notes?: string | null
    status?: DisposalStatus
  },
): Promise<DisposalRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the existing disposal
    const existingRows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Only update stock if the disposal was previously approved
    const statusChanged = input.status !== undefined && input.status !== existing.status
    const wasApproved = existing.status === 'approved'

    if (statusChanged) {
      if (wasApproved && input.status !== 'approved') {
        // Restore the stock (was approved, now not approved)
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
      } else if (!wasApproved && input.status === 'approved') {
        // Reduce stock (was not approved, now approved)
        const stockRows = await db.select<Array<{ stock: number }>>(
          `SELECT stock FROM product_location_stocks 
           WHERE product_id = $1 AND location_id = $2`,
          [existing.product_id, existing.location_id],
        )
        const currentStock = stockRows[0]?.stock ?? 0

        if (currentStock < existing.quantity) {
          throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${existing.quantity}`)
        }

        const newStock = currentStock - existing.quantity
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
        // Restore the old stock change
        const oldCurrentStockRows = await db.select<Array<{ stock: number }>>(
          `SELECT stock FROM product_location_stocks 
           WHERE product_id = $1 AND location_id = $2`,
          [existing.product_id, existing.location_id],
        )
        const oldCurrentStock = oldCurrentStockRows[0]?.stock ?? 0
        const oldStockAfterRestore = oldCurrentStock + existing.quantity
        await setProductLocationStock(
          existing.product_id,
          existing.location_id,
          oldStockAfterRestore,
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

        if (newCurrentStock < newQuantity) {
          throw new Error(`Insufficient stock. Available: ${newCurrentStock}, Requested: ${newQuantity}`)
        }

        const newStock = newCurrentStock - newQuantity
        await setProductLocationStock(newProductId, newLocationId, newStock)
      }
    }

    // Update the disposal record
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
    if (input.reason !== undefined) {
      updateFields.push(`reason = $${paramIndex++}`)
      updateValues.push(input.reason?.trim() || null)
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

    updateFields.push(`updated_at = $${paramIndex++}`)
    updateValues.push(now)
    updateValues.push(id)

    await db.execute(
      `UPDATE disposals SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues,
    )

    const rows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )
    const updated = rows[0] ?? null

    // Record audit trail
    if (updated) {
      const oldValues: Record<string, unknown> = {}
      const newValues: Record<string, unknown> = {}

      if (input.product_id !== undefined) {
        oldValues.product_id = existing.product_id
        newValues.product_id = updated.product_id
      }
      if (input.location_id !== undefined) {
        oldValues.location_id = existing.location_id
        newValues.location_id = updated.location_id
      }
      if (input.quantity !== undefined) {
        oldValues.quantity = existing.quantity
        newValues.quantity = updated.quantity
      }
      if (input.reason !== undefined) {
        oldValues.reason = existing.reason
        newValues.reason = updated.reason
      }
      if (input.pic !== undefined) {
        oldValues.pic = existing.pic
        newValues.pic = updated.pic
      }
      if (input.notes !== undefined) {
        oldValues.notes = existing.notes
        newValues.notes = updated.notes
      }
      if (input.status !== undefined) {
        oldValues.status = existing.status
        newValues.status = updated.status
      }

      await recordAuditTrail({
        entity_type: 'disposal',
        entity_id: id,
        action: 'update',
        old_values: Object.keys(oldValues).length > 0 ? oldValues : undefined,
        new_values: Object.keys(newValues).length > 0 ? newValues : undefined,
        notes: `Disposal updated: ${updated.quantity} units`,
      })
    }

    return updated
  } catch (error) {
    console.error('[DB] Error updating disposal:', error)
    throw error
  }
}

export async function softDeleteDisposal(id: number): Promise<DisposalRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the disposal before deleting
    const existingRows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Only restore stock if it was approved
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

    // Soft delete the disposal
    await db.execute(
      `UPDATE disposals SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'disposal',
      entity_id: id,
      action: 'delete',
      old_values: {
        product_id: existing.product_id,
        location_id: existing.location_id,
        quantity: existing.quantity,
        status: existing.status,
      },
      notes: `Disposal deleted: ${existing.quantity} units`,
    })

    const rows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error soft deleting disposal:', error)
    throw error
  }
}

export async function restoreDisposal(id: number): Promise<DisposalRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get the disposal before restoring
    const existingRows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Only reduce stock if it was approved before deletion
    if (existing.status === 'approved') {
      const stockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [existing.product_id, existing.location_id],
      )
      const currentStock = stockRows[0]?.stock ?? 0

      if (currentStock < existing.quantity) {
        throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${existing.quantity}`)
      }

      const newStock = currentStock - existing.quantity

      await setProductLocationStock(
        existing.product_id,
        existing.location_id,
        newStock,
      )
    }

    // Restore the disposal
    await db.execute(
      `UPDATE disposals SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'disposal',
      entity_id: id,
      action: 'restore',
      new_values: {
        product_id: existing.product_id,
        location_id: existing.location_id,
        quantity: existing.quantity,
        status: existing.status,
      },
      notes: `Disposal restored: ${existing.quantity} units`,
    })

    const rows = await db.select<DisposalRow[]>(
      `SELECT * FROM disposals WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error restoring disposal:', error)
    throw error
  }
}

