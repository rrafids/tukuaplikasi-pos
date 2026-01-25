import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'approve' | 'reject'

export type AuditEntityType =
  | 'product'
  | 'category'
  | 'subcategory'
  | 'uom'
  | 'uom_conversion'
  | 'location'
  | 'product_location_stock'
  | 'procurement'
  | 'disposal'
  | 'sale'
  | 'stock_opname'
  | 'user'
  | 'role'

export type AuditTrailRow = {
  id: number
  entity_type: AuditEntityType
  entity_id: number
  action: AuditAction
  old_values: string | null // JSON string of old values
  new_values: string | null // JSON string of new values
  notes: string | null
  created_at: string
}

export type AuditTrailWithDetails = AuditTrailRow & {
  entity_name: string | null
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
      console.log('[DB] Database loaded, creating audit_trail table if not exists...')

      // Create audit_trail table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS audit_trail (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete', 'restore', 'approve', 'reject')),
          old_values TEXT,
          new_values TEXT,
          notes TEXT,
          created_at TEXT NOT NULL
        )
      `)

      // Create indexes for faster queries
      try {
        await db.execute(
          `CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail(entity_type, entity_id)`,
        )
        await db.execute(
          `CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at DESC)`,
        )
        await db.execute(
          `CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action)`,
        )
      } catch (error) {
        // Indexes might already exist
        console.log('[DB] Indexes might already exist:', error)
      }

      console.log('[DB] Audit trail table created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== AUDIT TRAIL ====================

/**
 * Record an audit trail entry
 */
export async function recordAuditTrail(input: {
  entity_type: AuditEntityType
  entity_id: number
  action: AuditAction
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  notes?: string | null
}): Promise<AuditTrailRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    await db.execute(
      `INSERT INTO audit_trail (
        entity_type, entity_id, action, old_values, new_values, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.entity_type,
        input.entity_id,
        input.action,
        input.old_values ? JSON.stringify(input.old_values) : null,
        input.new_values ? JSON.stringify(input.new_values) : null,
        input.notes?.trim() || null,
        now,
      ],
    )

    const rows = await db.select<AuditTrailRow[]>(
      `SELECT * FROM audit_trail ORDER BY id DESC LIMIT 1`,
    )
    return rows[0]
  } catch (error) {
    console.error('[DB] Error recording audit trail:', error)
    throw error
  }
}

/**
 * List all audit trail entries with entity names
 */
export async function listAuditTrail(): Promise<AuditTrailWithDetails[]> {
  try {
    const db = await getDb()

    // Get all audit trail entries
    const auditEntries = await db.select<AuditTrailRow[]>(
      `SELECT * FROM audit_trail ORDER BY created_at DESC`,
    )

    // For each entry, try to get the entity name based on entity_type
    const entriesWithNames: AuditTrailWithDetails[] = await Promise.all(
      auditEntries.map(async (entry) => {
        let entityName: string | null = null

        try {
          switch (entry.entity_type) {
            case 'product': {
              const productRows = await db.select<Array<{ name: string }>>(
                `SELECT name FROM products WHERE id = $1`,
                [entry.entity_id],
              )
              entityName = productRows[0]?.name ?? null
              break
            }
            case 'category': {
              const categoryRows = await db.select<Array<{ name: string }>>(
                `SELECT name FROM categories WHERE id = $1`,
                [entry.entity_id],
              )
              entityName = categoryRows[0]?.name ?? null
              break
            }
            case 'subcategory': {
              const subcategoryRows = await db.select<Array<{ name: string }>>(
                `SELECT name FROM subcategories WHERE id = $1`,
                [entry.entity_id],
              )
              entityName = subcategoryRows[0]?.name ?? null
              break
            }
            case 'uom': {
              const uomRows = await db.select<Array<{ name: string }>>(
                `SELECT name FROM uoms WHERE id = $1`,
                [entry.entity_id],
              )
              entityName = uomRows[0]?.name ?? null
              break
            }
            case 'location': {
              const locationRows = await db.select<Array<{ name: string }>>(
                `SELECT name FROM locations WHERE id = $1`,
                [entry.entity_id],
              )
              entityName = locationRows[0]?.name ?? null
              break
            }
            case 'procurement': {
              // For procurement, get product and location info
              const procurementRows = await db.select<
                Array<{ product_id: number; location_id: number; quantity: number }>
              >(
                `SELECT product_id, location_id, quantity FROM procurements WHERE id = $1`,
                [entry.entity_id],
              )
              if (procurementRows[0]) {
                const proc = procurementRows[0]
                const productRows = await db.select<Array<{ name: string }>>(
                  `SELECT name FROM products WHERE id = $1`,
                  [proc.product_id],
                )
                const locationRows = await db.select<Array<{ name: string }>>(
                  `SELECT name FROM locations WHERE id = $1`,
                  [proc.location_id],
                )
                entityName = `Procurement #${entry.entity_id} - ${productRows[0]?.name ?? 'Unknown'} (${locationRows[0]?.name ?? 'Unknown'}) - Qty: ${proc.quantity}`
              }
              break
            }
            case 'disposal': {
              // Similar to procurement
              const disposalRows = await db.select<
                Array<{ product_id: number; location_id: number; quantity: number }>
              >(
                `SELECT product_id, location_id, quantity FROM disposals WHERE id = $1`,
                [entry.entity_id],
              )
              if (disposalRows[0]) {
                const disp = disposalRows[0]
                const productRows = await db.select<Array<{ name: string }>>(
                  `SELECT name FROM products WHERE id = $1`,
                  [disp.product_id],
                )
                const locationRows = await db.select<Array<{ name: string }>>(
                  `SELECT name FROM locations WHERE id = $1`,
                  [disp.location_id],
                )
                entityName = `Disposal #${entry.entity_id} - ${productRows[0]?.name ?? 'Unknown'} (${locationRows[0]?.name ?? 'Unknown'}) - Qty: ${disp.quantity}`
              }
              break
            }
            case 'sale': {
              // For sale, show sale ID and location
              const saleRows = await db.select<Array<{ location_id: number; total_amount: number }>>(
                `SELECT location_id, total_amount FROM sales WHERE id = $1`,
                [entry.entity_id],
              )
              if (saleRows[0]) {
                const sale = saleRows[0]
                const locationRows = await db.select<Array<{ name: string }>>(
                  `SELECT name FROM locations WHERE id = $1`,
                  [sale.location_id],
                )
                entityName = `Sale #${entry.entity_id} - ${locationRows[0]?.name ?? 'Unknown'} - Rp ${sale.total_amount.toLocaleString('id-ID')}`
              }
              break
            }
            case 'product_location_stock': {
              // For stock, show product and location
              const stockRows = await db.select<
                Array<{ product_id: number; location_id: number; stock: number }>
              >(
                `SELECT product_id, location_id, stock FROM product_location_stocks WHERE product_id = $1 AND location_id = $2`,
                entry.entity_id.toString().includes('-')
                  ? entry.entity_id.toString().split('-').map(Number)
                  : [entry.entity_id, 0],
              )
              if (stockRows[0]) {
                const stock = stockRows[0]
                const productRows = await db.select<Array<{ name: string }>>(
                  `SELECT name FROM products WHERE id = $1`,
                  [stock.product_id],
                )
                const locationRows = await db.select<Array<{ name: string }>>(
                  `SELECT name FROM locations WHERE id = $1`,
                  [stock.location_id],
                )
                entityName = `${productRows[0]?.name ?? 'Unknown'} @ ${locationRows[0]?.name ?? 'Unknown'} - Stock: ${stock.stock}`
              }
              break
            }
            case 'stock_opname': {
              const opnameRows = await db.select<Array<{ location_id: number; opname_date: string }>>(
                `SELECT location_id, opname_date FROM stock_opnames WHERE id = $1`,
                [entry.entity_id],
              )
              if (opnameRows[0]) {
                const opname = opnameRows[0]
                const locationRows = await db.select<Array<{ name: string }>>(
                  `SELECT name FROM locations WHERE id = $1`,
                  [opname.location_id],
                )
                entityName = `Stock Opname #${entry.entity_id} - ${locationRows[0]?.name ?? 'Unknown'} - ${opname.opname_date}`
              }
              break
            }
            case 'user': {
              const userRows = await db.select<Array<{ username: string }>>(
                `SELECT username FROM users WHERE id = $1`,
                [entry.entity_id],
              )
              entityName = userRows[0]?.username ?? null
              break
            }
            case 'role': {
              const roleRows = await db.select<Array<{ name: string }>>(
                `SELECT name FROM roles WHERE id = $1`,
                [entry.entity_id],
              )
              entityName = roleRows[0]?.name ?? null
              break
            }
            case 'uom_conversion': {
              // For UOM conversion, show from and to UOMs
              const conversionRows = await db.select<Array<{ from_uom_id: number; to_uom_id: number; conversion_rate: number }>>(
                `SELECT from_uom_id, to_uom_id, conversion_rate FROM uom_conversions WHERE id = $1`,
                [entry.entity_id],
              )
              if (conversionRows[0]) {
                const conv = conversionRows[0]
                const fromUomRows = await db.select<Array<{ abbreviation: string }>>(
                  `SELECT abbreviation FROM uoms WHERE id = $1`,
                  [conv.from_uom_id],
                )
                const toUomRows = await db.select<Array<{ abbreviation: string }>>(
                  `SELECT abbreviation FROM uoms WHERE id = $1`,
                  [conv.to_uom_id],
                )
                entityName = `1 ${fromUomRows[0]?.abbreviation || ''} = ${conv.conversion_rate} ${toUomRows[0]?.abbreviation || ''}`
              }
              break
            }
          }
        } catch (error) {
          console.error(`[DB] Error getting entity name for ${entry.entity_type}:${entry.entity_id}:`, error)
        }

        return {
          ...entry,
          entity_name: entityName,
        }
      }),
    )

    return entriesWithNames
  } catch (error) {
    console.error('[DB] Error listing audit trail:', error)
    throw error
  }
}

/**
 * Get audit trail for a specific entity
 */
export async function getAuditTrailByEntity(
  entityType: AuditEntityType,
  entityId: number,
): Promise<AuditTrailRow[]> {
  try {
    const db = await getDb()
    const rows = await db.select<AuditTrailRow[]>(
      `SELECT * FROM audit_trail 
       WHERE entity_type = $1 AND entity_id = $2 
       ORDER BY created_at DESC`,
      [entityType, entityId],
    )
    return rows
  } catch (error) {
    console.error('[DB] Error getting audit trail by entity:', error)
    throw error
  }
}

