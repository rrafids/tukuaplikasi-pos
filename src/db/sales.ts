import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { setProductLocationStock } from './locations'
import { recordStockMovement } from './stockMovements'
import { recordAuditTrail } from './auditTrail'
import { convertUOMQuantity } from './uoms'

export type SaleRow = {
  id: number
  location_id: number
  customer_name: string | null
  invoice_number: string | null
  total_amount: number
  discount_type: 'percentage' | 'fixed' | null
  discount_value: number | null
  notes: string | null
  user_id: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SaleItemRow = {
  id: number
  sale_id: number
  product_id: number
  quantity: number
  unit_price: number
  subtotal: number
  uom_id: number | null
  created_at: string
}

export type SaleWithItems = SaleRow & {
  location_name: string
  location_type: string
  user_name: string | null
  items: Array<SaleItemRow & { product_name: string }>
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
      console.log('[DB] Database loaded, creating sales tables if not exists...')

      // Create sales table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          location_id INTEGER NOT NULL,
          customer_name TEXT,
          invoice_number TEXT,
          total_amount REAL NOT NULL CHECK(total_amount >= 0),
          notes TEXT,
          user_id INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `)

      // Add customer_name column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE sales ADD COLUMN customer_name TEXT`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] customer_name column already exists or error adding it:', error)
      }

      // Add invoice_number column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE sales ADD COLUMN invoice_number TEXT`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] invoice_number column already exists or error adding it:', error)
      }

      // Add user_id column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE sales ADD COLUMN user_id INTEGER REFERENCES users(id)`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] user_id column already exists or error adding it:', error)
      }

      // Add discount_type column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE sales ADD COLUMN discount_type TEXT CHECK(discount_type IN ('percentage', 'fixed'))`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] discount_type column already exists or error adding it:', error)
      }

      // Add discount_value column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE sales ADD COLUMN discount_value REAL CHECK(discount_value >= 0)`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] discount_value column already exists or error adding it:', error)
      }

      // Create sales_items table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sales_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          quantity REAL NOT NULL CHECK(quantity > 0),
          unit_price REAL NOT NULL CHECK(unit_price >= 0),
          subtotal REAL NOT NULL CHECK(subtotal >= 0),
          uom_id INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (uom_id) REFERENCES uoms(id)
        )
      `)

      // Add uom_id column if it doesn't exist (for existing databases)
      try {
        await db.execute(`ALTER TABLE sales_items ADD COLUMN uom_id INTEGER`)
      } catch (error) {
        // Column already exists, ignore
        console.log('[DB] uom_id column already exists or error adding it:', error)
      }

      console.log('[DB] Sales tables created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== SALES ====================

export async function listSales(): Promise<SaleWithItems[]> {
  try {
    const db = await getDb()

    // Get all sales with location info
    const sales = await db.select<
      Array<
        SaleRow & {
          location_name: string
          location_type: string
          user_name: string | null
        }
      >
    >(
      `SELECT 
        s.id,
        s.location_id,
        s.customer_name,
        s.invoice_number,
        s.total_amount,
        s.discount_type,
        s.discount_value,
        s.notes,
        s.user_id,
        s.created_at,
        s.updated_at,
        s.deleted_at,
        l.name as location_name,
        l.type as location_type,
        u.username as user_name
       FROM sales s
       INNER JOIN locations l ON s.location_id = l.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.deleted_at IS NULL AND l.deleted_at IS NULL
       ORDER BY s.created_at DESC`,
    )

    // Get items for each sale
    const salesWithItems: SaleWithItems[] = await Promise.all(
      sales.map(async (sale) => {
        const items = await db.select<
          Array<SaleItemRow & { product_name: string }>
        >(
          `SELECT 
            si.id,
            si.sale_id,
            si.product_id,
            si.quantity,
            si.unit_price,
            si.subtotal,
            si.uom_id,
            si.created_at,
            p.name as product_name
           FROM sales_items si
           INNER JOIN products p ON si.product_id = p.id
           WHERE si.sale_id = $1 AND p.deleted_at IS NULL
           ORDER BY si.id`,
          [sale.id],
        )

        return {
          ...sale,
          user_name: sale.user_name ?? null,
          items,
        }
      }),
    )

    return salesWithItems
  } catch (error) {
    console.error('[DB] Error listing sales:', error)
    throw error
  }
}

export async function createSale(input: {
  location_id: number
  customer_name?: string | null
  items: Array<{
    product_id: number
    quantity: number
    unit_price: number
    uom_id?: number | null
  }>
  discount_type?: 'percentage' | 'fixed' | null
  discount_value?: number | null
  notes?: string | null
  user_id?: number | null
}): Promise<SaleWithItems> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Validate items
    if (input.items.length === 0) {
      throw new Error('Sale must have at least one item')
    }

    // Calculate subtotal
    const subtotal = input.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    )

    // Calculate discount amount
    let discountAmount = 0
    if (input.discount_type && input.discount_value !== null && input.discount_value !== undefined) {
      if (input.discount_type === 'percentage') {
        discountAmount = (subtotal * input.discount_value) / 100
      } else if (input.discount_type === 'fixed') {
        discountAmount = input.discount_value
      }
      // Ensure discount doesn't exceed subtotal
      discountAmount = Math.min(discountAmount, subtotal)
    }

    // Calculate final total
    const totalAmount = subtotal - discountAmount

    // Validate ALL conversions and stock availability FIRST (before any database changes)
    const itemConversions: Array<{ itemIndex: number; quantityInBaseUOM: number }> = []

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i]

      // Get product's base UOM
      const productRows = await db.select<Array<{ uom_id: number | null }>>(
        `SELECT uom_id FROM products WHERE id = $1`,
        [item.product_id],
      )
      const productUomId = productRows[0]?.uom_id ?? null

      // Convert quantity to base UOM if different UOM is used
      let quantityInBaseUOM = item.quantity
      if (item.uom_id && productUomId && item.uom_id !== productUomId) {
        const converted = await convertUOMQuantity(
          item.quantity,
          item.uom_id,
          productUomId,
        )
        if (converted === null) {
          throw new Error(
            `No conversion available from selected UOM to product's base UOM for item ${i + 1}. Please define a conversion in the UOMs menu.`,
          )
        }
        quantityInBaseUOM = converted
      } else if (item.uom_id && !productUomId) {
        // Product has no UOM, but item has UOM - use item quantity as-is
        quantityInBaseUOM = item.quantity
      }

      // Validate stock availability
      const stockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [item.product_id, input.location_id],
      )
      const currentStock = stockRows[0]?.stock ?? 0

      if (currentStock < quantityInBaseUOM) {
        throw new Error(
          `Insufficient stock for product in item ${i + 1}. Available: ${currentStock}, Requested: ${quantityInBaseUOM}`,
        )
      }

      itemConversions.push({ itemIndex: i, quantityInBaseUOM })
    }

    // Generate invoice number
    const year = new Date().getFullYear()
    const month = String(new Date().getMonth() + 1).padStart(2, '0')

    // Get the last invoice number for this year-month to generate sequential number
    const lastInvoiceRows = await db.select<Array<{ invoice_number: string | null }>>(
      `SELECT invoice_number FROM sales 
       WHERE invoice_number IS NOT NULL 
       AND invoice_number LIKE $1 
       ORDER BY invoice_number DESC LIMIT 1`,
      [`INV-${year}${month}%`],
    )

    let invoiceNumber: string
    if (lastInvoiceRows.length > 0 && lastInvoiceRows[0].invoice_number) {
      // Extract the sequence number and increment
      const lastNumber = lastInvoiceRows[0].invoice_number
      const match = lastNumber.match(/INV-(\d{6})-(\d+)/)
      if (match) {
        const sequence = parseInt(match[2], 10) + 1
        invoiceNumber = `INV-${year}${month}-${String(sequence).padStart(4, '0')}`
      } else {
        // Fallback if format doesn't match
        invoiceNumber = `INV-${year}${month}-0001`
      }
    } else {
      // First invoice for this month
      invoiceNumber = `INV-${year}${month}-0001`
    }

    // Now reduce stock (after all validations passed)
    for (const conversion of itemConversions) {
      const item = input.items[conversion.itemIndex]
      const stockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [item.product_id, input.location_id],
      )
      const currentStock = stockRows[0]?.stock ?? 0
      const newStock = currentStock - conversion.quantityInBaseUOM

      await setProductLocationStock(
        item.product_id,
        input.location_id,
        newStock,
      )
    }

    // Create sale
    await db.execute(
      `INSERT INTO sales (location_id, customer_name, invoice_number, total_amount, discount_type, discount_value, notes, user_id, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)`,
      [
        input.location_id,
        input.customer_name?.trim() || null,
        invoiceNumber,
        totalAmount,
        input.discount_type ?? null,
        input.discount_value ?? null,
        input.notes?.trim() || null,
        input.user_id ?? null,
        now,
        now,
      ],
    )

    // Get the created sale ID
    const saleRows = await db.select<SaleRow[]>(
      `SELECT * FROM sales ORDER BY id DESC LIMIT 1`,
    )
    const sale = saleRows[0]

    if (!sale) {
      throw new Error('Failed to create sale')
    }

    // Create sale items
    for (const item of input.items) {
      const subtotal = item.quantity * item.unit_price
      await db.execute(
        `INSERT INTO sales_items (sale_id, product_id, quantity, unit_price, subtotal, uom_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sale.id,
          item.product_id,
          item.quantity,
          item.unit_price,
          subtotal,
          item.uom_id ?? null,
          now,
        ],
      )
    }

    // Get location info and user info
    const locationRows = await db.select<
      Array<{ name: string; type: string }>
    >(
      `SELECT name, type FROM locations WHERE id = $1`,
      [input.location_id],
    )
    const location = locationRows[0]

    if (!location) {
      throw new Error('Location not found')
    }

    // Get user name if user_id is provided
    let userName: string | null = null
    if (input.user_id) {
      const userRows = await db.select<Array<{ username: string }>>(
        `SELECT username FROM users WHERE id = $1`,
        [input.user_id],
      )
      userName = userRows[0]?.username ?? null
    }

    // Get items with product names
    const items = await db.select<
      Array<SaleItemRow & { product_name: string }>
    >(
      `SELECT 
        si.id,
        si.sale_id,
        si.product_id,
        si.quantity,
        si.unit_price,
        si.subtotal,
        si.uom_id,
        si.created_at,
        p.name as product_name
       FROM sales_items si
       INNER JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1
       ORDER BY si.id`,
      [sale.id],
    )

    // Record stock movements for each item (using base UOM quantity from pre-calculated conversions)
    for (const conversion of itemConversions) {
      const item = input.items[conversion.itemIndex]
      const productRows = await db.select<Array<{ uom_id: number | null }>>(
        `SELECT uom_id FROM products WHERE id = $1`,
        [item.product_id],
      )
      const productUomId = productRows[0]?.uom_id ?? null

      await recordStockMovement({
        product_id: item.product_id,
        location_id: input.location_id,
        movement_type: 'sale',
        quantity: -conversion.quantityInBaseUOM, // Negative for decrease
        reference_id: sale.id,
        reference_type: 'sale',
        notes: `Sale: ${item.quantity} units${item.uom_id && productUomId && item.uom_id !== productUomId ? ` (${conversion.quantityInBaseUOM} in base UOM)` : ''}`,
      })
    }

    return {
      ...sale,
      location_name: location.name,
      location_type: location.type,
      user_name: userName,
      items,
    }
  } catch (error) {
    console.error('[DB] Error creating sale:', error)
    throw error
  }
}

export async function updateSale(
  id: number,
  input: {
    location_id?: number
    customer_name?: string | null
    items?: Array<{
      product_id: number
      quantity: number
      unit_price: number
    }>
    discount_type?: 'percentage' | 'fixed' | null
    discount_value?: number | null
    notes?: string | null
  },
): Promise<SaleWithItems | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get existing sale
    const existingRows = await db.select<SaleRow[]>(
      `SELECT * FROM sales WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Get existing items
    const existingItems = await db.select<SaleItemRow[]>(
      `SELECT * FROM sales_items WHERE sale_id = $1`,
      [id],
    )

    // Restore stock from existing items
    for (const item of existingItems) {
      const stockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [item.product_id, existing.location_id],
      )
      const currentStock = stockRows[0]?.stock ?? 0
      const newStock = currentStock + item.quantity
      await setProductLocationStock(
        item.product_id,
        existing.location_id,
        newStock,
      )
    }

    // Delete existing items
    await db.execute(`DELETE FROM sales_items WHERE sale_id = $1`, [id])

    // Use new items or existing items
    const items = input.items ?? existingItems.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }))

    const locationId = input.location_id ?? existing.location_id

    // Validate and reduce stock for new items
    for (const item of items) {
      const stockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [item.product_id, locationId],
      )
      const currentStock = stockRows[0]?.stock ?? 0

      if (currentStock < item.quantity) {
        throw new Error(
          `Insufficient stock for product. Available: ${currentStock}, Requested: ${item.quantity}`,
        )
      }

      // Reduce stock
      const newStock = currentStock - item.quantity
      await setProductLocationStock(item.product_id, locationId, newStock)
    }

    // Calculate subtotal
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    )

    // Calculate discount amount
    const discountType = input.discount_type !== undefined ? input.discount_type : existing.discount_type
    const discountValue = input.discount_value !== undefined ? input.discount_value : existing.discount_value

    let discountAmount = 0
    if (discountType && discountValue !== null && discountValue !== undefined) {
      if (discountType === 'percentage') {
        discountAmount = (subtotal * discountValue) / 100
      } else if (discountType === 'fixed') {
        discountAmount = discountValue
      }
      // Ensure discount doesn't exceed subtotal
      discountAmount = Math.min(discountAmount, subtotal)
    }

    // Calculate final total
    const totalAmount = subtotal - discountAmount

    // Update sale
    await db.execute(
      `UPDATE sales 
       SET location_id = $1, customer_name = $2, total_amount = $3, discount_type = $4, discount_value = $5, notes = $6, updated_at = $7
       WHERE id = $8`,
      [
        locationId,
        input.customer_name !== undefined ? (input.customer_name?.trim() || null) : existing.customer_name,
        totalAmount,
        discountType,
        discountValue,
        input.notes !== undefined ? (input.notes?.trim() || null) : existing.notes,
        now,
        id,
      ],
    )

    // Create new items
    for (const item of items) {
      const subtotal = item.quantity * item.unit_price
      await db.execute(
        `INSERT INTO sales_items (sale_id, product_id, quantity, unit_price, subtotal, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, item.product_id, item.quantity, item.unit_price, subtotal, now],
      )
    }

    // Return updated sale with items
    const updatedRows = await db.select<
      Array<
        SaleRow & {
          location_name: string
          location_type: string
          user_name: string | null
        }
      >
    >(
      `SELECT 
        s.id,
        s.location_id,
        s.customer_name,
        s.invoice_number,
        s.total_amount,
        s.notes,
        s.user_id,
        s.created_at,
        s.updated_at,
        s.deleted_at,
        l.name as location_name,
        l.type as location_type,
        u.username as user_name
       FROM sales s
       INNER JOIN locations l ON s.location_id = l.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [id],
    )

    if (updatedRows.length === 0) {
      return null
    }

    const updatedSale = updatedRows[0]

    const updatedItems = await db.select<
      Array<SaleItemRow & { product_name: string }>
    >(
      `SELECT 
        si.id,
        si.sale_id,
        si.product_id,
        si.quantity,
        si.unit_price,
        si.subtotal,
        si.uom_id,
        si.created_at,
        p.name as product_name
       FROM sales_items si
       INNER JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1
       ORDER BY si.id`,
      [id],
    )

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'sale',
      entity_id: id,
      action: 'update',
      old_values: {
        location_id: existing.location_id,
        customer_name: existing.customer_name,
        total_amount: existing.total_amount,
        items_count: existingItems.length,
      },
      new_values: {
        location_id: updatedSale.location_id,
        customer_name: updatedSale.customer_name,
        total_amount: updatedSale.total_amount,
        items_count: items.length,
      },
      notes: `Sale updated: ${items.length} items, Total: Rp ${updatedSale.total_amount.toLocaleString('id-ID')}`,
    })

    return {
      ...updatedSale,
      user_name: updatedSale.user_name ?? null,
      items: updatedItems,
    }
  } catch (error) {
    console.error('[DB] Error updating sale:', error)
    throw error
  }
}

export async function softDeleteSale(id: number): Promise<SaleRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get existing sale
    const existingRows = await db.select<SaleRow[]>(
      `SELECT * FROM sales WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Get items and restore stock
    const items = await db.select<SaleItemRow[]>(
      `SELECT * FROM sales_items WHERE sale_id = $1`,
      [id],
    )

    for (const item of items) {
      const stockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [item.product_id, existing.location_id],
      )
      const currentStock = stockRows[0]?.stock ?? 0
      const newStock = currentStock + item.quantity
      await setProductLocationStock(
        item.product_id,
        existing.location_id,
        newStock,
      )
    }

    // Soft delete sale
    await db.execute(
      `UPDATE sales SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'sale',
      entity_id: id,
      action: 'delete',
      old_values: {
        location_id: existing.location_id,
        customer_name: existing.customer_name,
        total_amount: existing.total_amount,
        items_count: items.length,
      },
      notes: `Sale deleted: ${items.length} items, Total: Rp ${existing.total_amount.toLocaleString('id-ID')}`,
    })

    const rows = await db.select<SaleRow[]>(
      `SELECT * FROM sales WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error soft deleting sale:', error)
    throw error
  }
}

export async function restoreSale(id: number): Promise<SaleRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get existing sale
    const existingRows = await db.select<SaleRow[]>(
      `SELECT * FROM sales WHERE id = $1`,
      [id],
    )

    if (existingRows.length === 0) {
      return null
    }

    const existing = existingRows[0]

    // Get items and reduce stock
    const items = await db.select<SaleItemRow[]>(
      `SELECT * FROM sales_items WHERE sale_id = $1`,
      [id],
    )

    for (const item of items) {
      const stockRows = await db.select<Array<{ stock: number }>>(
        `SELECT stock FROM product_location_stocks 
         WHERE product_id = $1 AND location_id = $2`,
        [item.product_id, existing.location_id],
      )
      const currentStock = stockRows[0]?.stock ?? 0

      if (currentStock < item.quantity) {
        throw new Error(
          `Insufficient stock to restore sale. Available: ${currentStock}, Required: ${item.quantity}`,
        )
      }

      const newStock = currentStock - item.quantity
      await setProductLocationStock(
        item.product_id,
        existing.location_id,
        newStock,
      )
    }

    // Restore sale
    await db.execute(
      `UPDATE sales SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
      [now, id],
    )

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'sale',
      entity_id: id,
      action: 'restore',
      new_values: {
        location_id: existing.location_id,
        customer_name: existing.customer_name,
        total_amount: existing.total_amount,
        items_count: items.length,
      },
      notes: `Sale restored: ${items.length} items, Total: Rp ${existing.total_amount.toLocaleString('id-ID')}`,
    })

    const rows = await db.select<SaleRow[]>(
      `SELECT * FROM sales WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  } catch (error) {
    console.error('[DB] Error restoring sale:', error)
    throw error
  }
}

