import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { recordAuditTrail } from './auditTrail'

export type CategoryRow = {
  id: number
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SubcategoryRow = {
  id: number
  category_id: number
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProductSubcategoryRow = {
  product_id: number
  subcategory_id: number
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
      console.log('[DB] Database loaded, creating category tables if not exists...')
      
      // Create categories table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        )
      `)
      
      // Create subcategories table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS subcategories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (category_id) REFERENCES categories(id),
          UNIQUE(category_id, name)
        )
      `)
      
      // Create junction table for products and subcategories (many-to-many)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS product_subcategories (
          product_id INTEGER NOT NULL,
          subcategory_id INTEGER NOT NULL,
          PRIMARY KEY (product_id, subcategory_id),
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE CASCADE
        )
      `)
      
      console.log('[DB] Category tables created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== CATEGORIES ====================

export async function listCategories(): Promise<CategoryRow[]> {
  try {
    const db = await getDb()
    const rows = await db.select<CategoryRow[]>(
      `SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name ASC`,
    )
    return rows
  } catch (error) {
    console.error('[DB] Error listing categories:', error)
    throw error
  }
}

export async function createCategory(input: { name: string }): Promise<CategoryRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO categories (name, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, NULL)`,
      [input.name.trim(), now, now],
    )
    const rows = await db.select<CategoryRow[]>(
      `SELECT * FROM categories ORDER BY id DESC LIMIT 1`,
    )
    const category = rows[0]

    // Record audit trail
    if (category) {
      await recordAuditTrail({
        entity_type: 'category',
        entity_id: category.id,
        action: 'create',
        new_values: {
          name: category.name,
        },
        notes: `Category created: ${category.name}`,
      })
    }

    return category
  } catch (error) {
    console.error('[DB] Error creating category:', error)
    throw error
  }
}

export async function updateCategory(
  id: number,
  input: { name: string },
): Promise<CategoryRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<CategoryRow[]>(
      `SELECT * FROM categories WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE categories SET name = $1, updated_at = $2 WHERE id = $3`,
      [input.name.trim(), now, id],
    )
    const rows = await db.select<CategoryRow[]>(
      `SELECT * FROM categories WHERE id = $1`,
      [id],
    )
    const updated = rows[0] ?? null

    // Record audit trail
    if (updated && oldValues) {
      await recordAuditTrail({
        entity_type: 'category',
        entity_id: id,
        action: 'update',
        old_values: {
          name: oldValues.name,
        },
        new_values: {
          name: updated.name,
        },
        notes: `Category updated: ${updated.name}`,
      })
    }

    return updated
  } catch (error) {
    console.error('[DB] Error updating category:', error)
    throw error
  }
}

export async function softDeleteCategory(id: number): Promise<CategoryRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<CategoryRow[]>(
      `SELECT * FROM categories WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE categories SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    )
    const rows = await db.select<CategoryRow[]>(
      `SELECT * FROM categories WHERE id = $1`,
      [id],
    )
    const deleted = rows[0] ?? null

    // Record audit trail
    if (deleted && oldValues) {
      await recordAuditTrail({
        entity_type: 'category',
        entity_id: id,
        action: 'delete',
        old_values: {
          name: oldValues.name,
        },
        notes: `Category deleted: ${oldValues.name}`,
      })
    }

    return deleted
  } catch (error) {
    console.error('[DB] Error soft deleting category:', error)
    throw error
  }
}

export async function restoreCategory(id: number): Promise<CategoryRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<CategoryRow[]>(
      `SELECT * FROM categories WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE categories SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
      [now, id],
    )
    const rows = await db.select<CategoryRow[]>(
      `SELECT * FROM categories WHERE id = $1`,
      [id],
    )
    const restored = rows[0] ?? null

    // Record audit trail
    if (restored && oldValues) {
      await recordAuditTrail({
        entity_type: 'category',
        entity_id: id,
        action: 'restore',
        new_values: {
          name: restored.name,
        },
        notes: `Category restored: ${restored.name}`,
      })
    }

    return restored
  } catch (error) {
    console.error('[DB] Error restoring category:', error)
    throw error
  }
}

// ==================== SUBCATEGORIES ====================

export async function listSubcategories(
  categoryId?: number,
): Promise<SubcategoryRow[]> {
  try {
    const db = await getDb()
    let query = `SELECT * FROM subcategories WHERE deleted_at IS NULL`
    const params: unknown[] = []
    
    if (categoryId != null) {
      query += ` AND category_id = $1`
      params.push(categoryId)
    }
    
    query += ` ORDER BY name ASC`
    
    const rows = await db.select<SubcategoryRow[]>(query, params)
    return rows
  } catch (error) {
    console.error('[DB] Error listing subcategories:', error)
    throw error
  }
}

export async function createSubcategory(input: {
  category_id: number
  name: string
}): Promise<SubcategoryRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO subcategories (category_id, name, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, NULL)`,
      [input.category_id, input.name.trim(), now, now],
    )
    const rows = await db.select<SubcategoryRow[]>(
      `SELECT * FROM subcategories ORDER BY id DESC LIMIT 1`,
    )
    const subcategory = rows[0]

    // Record audit trail
    if (subcategory) {
      await recordAuditTrail({
        entity_type: 'subcategory',
        entity_id: subcategory.id,
        action: 'create',
        new_values: {
          category_id: subcategory.category_id,
          name: subcategory.name,
        },
        notes: `Subcategory created: ${subcategory.name}`,
      })
    }

    return subcategory
  } catch (error) {
    console.error('[DB] Error creating subcategory:', error)
    throw error
  }
}

export async function updateSubcategory(
  id: number,
  input: { category_id: number; name: string },
): Promise<SubcategoryRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<SubcategoryRow[]>(
      `SELECT * FROM subcategories WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE subcategories SET category_id = $1, name = $2, updated_at = $3 WHERE id = $4`,
      [input.category_id, input.name.trim(), now, id],
    )
    const rows = await db.select<SubcategoryRow[]>(
      `SELECT * FROM subcategories WHERE id = $1`,
      [id],
    )
    const updated = rows[0] ?? null

    // Record audit trail
    if (updated && oldValues) {
      await recordAuditTrail({
        entity_type: 'subcategory',
        entity_id: id,
        action: 'update',
        old_values: {
          category_id: oldValues.category_id,
          name: oldValues.name,
        },
        new_values: {
          category_id: updated.category_id,
          name: updated.name,
        },
        notes: `Subcategory updated: ${updated.name}`,
      })
    }

    return updated
  } catch (error) {
    console.error('[DB] Error updating subcategory:', error)
    throw error
  }
}

export async function softDeleteSubcategory(
  id: number,
): Promise<SubcategoryRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<SubcategoryRow[]>(
      `SELECT * FROM subcategories WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE subcategories SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    )
    const rows = await db.select<SubcategoryRow[]>(
      `SELECT * FROM subcategories WHERE id = $1`,
      [id],
    )
    const deleted = rows[0] ?? null

    // Record audit trail
    if (deleted && oldValues) {
      await recordAuditTrail({
        entity_type: 'subcategory',
        entity_id: id,
        action: 'delete',
        old_values: {
          category_id: oldValues.category_id,
          name: oldValues.name,
        },
        notes: `Subcategory deleted: ${oldValues.name}`,
      })
    }

    return deleted
  } catch (error) {
    console.error('[DB] Error soft deleting subcategory:', error)
    throw error
  }
}

export async function restoreSubcategory(
  id: number,
): Promise<SubcategoryRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<SubcategoryRow[]>(
      `SELECT * FROM subcategories WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE subcategories SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
      [now, id],
    )
    const rows = await db.select<SubcategoryRow[]>(
      `SELECT * FROM subcategories WHERE id = $1`,
      [id],
    )
    const restored = rows[0] ?? null

    // Record audit trail
    if (restored && oldValues) {
      await recordAuditTrail({
        entity_type: 'subcategory',
        entity_id: id,
        action: 'restore',
        new_values: {
          category_id: restored.category_id,
          name: restored.name,
        },
        notes: `Subcategory restored: ${restored.name}`,
      })
    }

    return restored
  } catch (error) {
    console.error('[DB] Error restoring subcategory:', error)
    throw error
  }
}

// ==================== PRODUCT SUBCATEGORIES (JUNCTION) ====================

export async function getProductSubcategories(
  productId: number,
): Promise<SubcategoryRow[]> {
  try {
    const db = await getDb()
    const rows = await db.select<SubcategoryRow[]>(
      `SELECT s.* FROM subcategories s
       INNER JOIN product_subcategories ps ON s.id = ps.subcategory_id
       WHERE ps.product_id = $1 AND s.deleted_at IS NULL
       ORDER BY s.name ASC`,
      [productId],
    )
    return rows
  } catch (error) {
    console.error('[DB] Error getting product subcategories:', error)
    throw error
  }
}

export async function setProductSubcategories(
  productId: number,
  subcategoryIds: number[],
): Promise<void> {
  try {
    const db = await getDb()
    
    // Remove existing associations
    await db.execute(
      `DELETE FROM product_subcategories WHERE product_id = $1`,
      [productId],
    )
    
    // Add new associations
    for (const subcategoryId of subcategoryIds) {
      await db.execute(
        `INSERT INTO product_subcategories (product_id, subcategory_id)
         VALUES ($1, $2)`,
        [productId, subcategoryId],
      )
    }
  } catch (error) {
    console.error('[DB] Error setting product subcategories:', error)
    throw error
  }
}

