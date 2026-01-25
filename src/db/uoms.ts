import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { recordAuditTrail } from './auditTrail'

export type UOMRow = {
  id: number
  name: string
  abbreviation: string
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
      console.log('[DB] Database loaded, creating UOM table if not exists...')
      
      // Create UOMs table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS uoms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          abbreviation TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        )
      `)

      // Create UOM conversions table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS uom_conversions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_uom_id INTEGER NOT NULL,
          to_uom_id INTEGER NOT NULL,
          conversion_rate REAL NOT NULL CHECK(conversion_rate > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (from_uom_id) REFERENCES uoms(id) ON DELETE CASCADE,
          FOREIGN KEY (to_uom_id) REFERENCES uoms(id) ON DELETE CASCADE,
          UNIQUE(from_uom_id, to_uom_id)
        )
      `)
      
      console.log('[DB] UOM tables created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

export async function listUOMs(): Promise<UOMRow[]> {
  try {
    const db = await getDb()
    const rows = await db.select<UOMRow[]>(
      `SELECT * FROM uoms WHERE deleted_at IS NULL ORDER BY name ASC`,
    )
    return rows
  } catch (error) {
    console.error('[DB] Error listing UOMs:', error)
    throw error
  }
}

export async function createUOM(input: {
  name: string
  abbreviation: string
}): Promise<UOMRow> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO uoms (name, abbreviation, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, NULL)`,
      [input.name.trim(), input.abbreviation.trim().toUpperCase(), now, now],
    )
    const rows = await db.select<UOMRow[]>(
      `SELECT * FROM uoms ORDER BY id DESC LIMIT 1`,
    )
    const uom = rows[0]

    // Record audit trail
    if (uom) {
      await recordAuditTrail({
        entity_type: 'uom',
        entity_id: uom.id,
        action: 'create',
        new_values: {
          name: uom.name,
          abbreviation: uom.abbreviation,
        },
        notes: `UOM created: ${uom.name} (${uom.abbreviation})`,
      })
    }

    return uom
  } catch (error) {
    console.error('[DB] Error creating UOM:', error)
    throw error
  }
}

export async function updateUOM(
  id: number,
  input: { name: string; abbreviation: string },
): Promise<UOMRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<UOMRow[]>(
      `SELECT * FROM uoms WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE uoms SET name = $1, abbreviation = $2, updated_at = $3 WHERE id = $4`,
      [input.name.trim(), input.abbreviation.trim().toUpperCase(), now, id],
    )
    const rows = await db.select<UOMRow[]>(
      `SELECT * FROM uoms WHERE id = $1`,
      [id],
    )
    const updated = rows[0] ?? null

    // Record audit trail
    if (updated && oldValues) {
      await recordAuditTrail({
        entity_type: 'uom',
        entity_id: id,
        action: 'update',
        old_values: {
          name: oldValues.name,
          abbreviation: oldValues.abbreviation,
        },
        new_values: {
          name: updated.name,
          abbreviation: updated.abbreviation,
        },
        notes: `UOM updated: ${updated.name} (${updated.abbreviation})`,
      })
    }

    return updated
  } catch (error) {
    console.error('[DB] Error updating UOM:', error)
    throw error
  }
}

export async function softDeleteUOM(id: number): Promise<UOMRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<UOMRow[]>(
      `SELECT * FROM uoms WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE uoms SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    )
    const rows = await db.select<UOMRow[]>(
      `SELECT * FROM uoms WHERE id = $1`,
      [id],
    )
    const deleted = rows[0] ?? null

    // Record audit trail
    if (deleted && oldValues) {
      await recordAuditTrail({
        entity_type: 'uom',
        entity_id: id,
        action: 'delete',
        old_values: {
          name: oldValues.name,
          abbreviation: oldValues.abbreviation,
        },
        notes: `UOM deleted: ${oldValues.name} (${oldValues.abbreviation})`,
      })
    }

    return deleted
  } catch (error) {
    console.error('[DB] Error soft deleting UOM:', error)
    throw error
  }
}

export async function restoreUOM(id: number): Promise<UOMRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<UOMRow[]>(
      `SELECT * FROM uoms WHERE id = $1`,
      [id],
    )
    const oldValues = oldRows[0]

    await db.execute(
      `UPDATE uoms SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
      [now, id],
    )
    const rows = await db.select<UOMRow[]>(
      `SELECT * FROM uoms WHERE id = $1`,
      [id],
    )
    const restored = rows[0] ?? null

    // Record audit trail
    if (restored && oldValues) {
      await recordAuditTrail({
        entity_type: 'uom',
        entity_id: id,
        action: 'restore',
        new_values: {
          name: restored.name,
          abbreviation: restored.abbreviation,
        },
        notes: `UOM restored: ${restored.name} (${restored.abbreviation})`,
      })
    }

    return restored
  } catch (error) {
    console.error('[DB] Error restoring UOM:', error)
    throw error
  }
}

// ==================== UOM CONVERSIONS ====================

export type UOMConversionRow = {
  id: number
  from_uom_id: number
  to_uom_id: number
  conversion_rate: number
  created_at: string
  updated_at: string
}

export type UOMConversionWithNames = UOMConversionRow & {
  from_uom_name: string
  from_uom_abbreviation: string
  to_uom_name: string
  to_uom_abbreviation: string
}

/**
 * Get conversion rate from one UOM to another
 * Returns the multiplier to convert from fromUomId to toUomId
 * Returns null if no conversion exists
 */
export async function getUOMConversion(
  fromUomId: number,
  toUomId: number,
): Promise<number | null> {
  try {
    // Same UOM, no conversion needed
    if (fromUomId === toUomId) {
      return 1
    }

    const db = await getDb()

    // Try direct conversion
    const directRows = await db.select<UOMConversionRow[]>(
      `SELECT conversion_rate FROM uom_conversions 
       WHERE from_uom_id = $1 AND to_uom_id = $2`,
      [fromUomId, toUomId],
    )

    if (directRows.length > 0) {
      return directRows[0].conversion_rate
    }

    // Try reverse conversion (inverse)
    const reverseRows = await db.select<UOMConversionRow[]>(
      `SELECT conversion_rate FROM uom_conversions 
       WHERE from_uom_id = $1 AND to_uom_id = $2`,
      [toUomId, fromUomId],
    )

    if (reverseRows.length > 0) {
      return 1 / reverseRows[0].conversion_rate
    }

    return null
  } catch (error) {
    console.error('[DB] Error getting UOM conversion:', error)
    return null
  }
}

/**
 * Convert quantity from one UOM to another
 */
export async function convertUOMQuantity(
  quantity: number,
  fromUomId: number,
  toUomId: number,
): Promise<number | null> {
  const conversionRate = await getUOMConversion(fromUomId, toUomId)
  if (conversionRate === null) {
    return null
  }
  return quantity * conversionRate
}

/**
 * List all UOM conversions
 */
export async function listUOMConversions(): Promise<UOMConversionWithNames[]> {
  try {
    const db = await getDb()
    const rows = await db.select<
      Array<
        UOMConversionRow & {
          from_uom_name: string
          from_uom_abbreviation: string
          to_uom_name: string
          to_uom_abbreviation: string
        }
      >
    >(
      `SELECT 
        uc.id,
        uc.from_uom_id,
        uc.to_uom_id,
        uc.conversion_rate,
        uc.created_at,
        uc.updated_at,
        u1.name as from_uom_name,
        u1.abbreviation as from_uom_abbreviation,
        u2.name as to_uom_name,
        u2.abbreviation as to_uom_abbreviation
       FROM uom_conversions uc
       INNER JOIN uoms u1 ON uc.from_uom_id = u1.id
       INNER JOIN uoms u2 ON uc.to_uom_id = u2.id
       ORDER BY u1.name, u2.name`,
    )
    return rows
  } catch (error) {
    console.error('[DB] Error listing UOM conversions:', error)
    throw error
  }
}

/**
 * Get all UOM IDs that have conversions with the given UOM
 * Returns an array of UOM IDs that can be converted from/to the given UOM
 * Includes the given UOM itself (since no conversion is needed)
 */
export async function getUOMsWithConversions(uomId: number): Promise<number[]> {
  try {
    const db = await getDb()
    
    // Get all UOMs that have conversions with the given UOM (both directions)
    const rows = await db.select<Array<{ uom_id: number }>>(
      `SELECT DISTINCT to_uom_id as uom_id FROM uom_conversions WHERE from_uom_id = $1
       UNION
       SELECT DISTINCT from_uom_id as uom_id FROM uom_conversions WHERE to_uom_id = $1`,
      [uomId],
    )
    
    // Extract UOM IDs and always include the base UOM itself
    const uomIds = new Set<number>([uomId]) // Always include the base UOM
    rows.forEach((row) => uomIds.add(row.uom_id))
    
    return Array.from(uomIds)
  } catch (error) {
    console.error('[DB] Error getting UOMs with conversions:', error)
    throw error
  }
}

/**
 * Create a UOM conversion
 */
export async function createUOMConversion(input: {
  from_uom_id: number
  to_uom_id: number
  conversion_rate: number
}): Promise<UOMConversionRow> {
  try {
    if (input.from_uom_id === input.to_uom_id) {
      throw new Error('Cannot create conversion from UOM to itself')
    }
    if (input.conversion_rate <= 0) {
      throw new Error('Conversion rate must be greater than 0')
    }

    const db = await getDb()
    const now = new Date().toISOString()

    await db.execute(
      `INSERT INTO uom_conversions (from_uom_id, to_uom_id, conversion_rate, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.from_uom_id, input.to_uom_id, input.conversion_rate, now, now],
    )

    const rows = await db.select<UOMConversionRow[]>(
      `SELECT * FROM uom_conversions ORDER BY id DESC LIMIT 1`,
    )
    const conversion = rows[0]

    // Get UOM names for audit trail
    const fromUomRows = await db.select<Array<{ name: string; abbreviation: string }>>(
      `SELECT name, abbreviation FROM uoms WHERE id = $1`,
      [input.from_uom_id],
    )
    const toUomRows = await db.select<Array<{ name: string; abbreviation: string }>>(
      `SELECT name, abbreviation FROM uoms WHERE id = $1`,
      [input.to_uom_id],
    )
    const fromUom = fromUomRows[0]
    const toUom = toUomRows[0]

    // Record audit trail
    if (conversion) {
      await recordAuditTrail({
        entity_type: 'uom_conversion',
        entity_id: conversion.id,
        action: 'create',
        new_values: {
          from_uom_id: conversion.from_uom_id,
          to_uom_id: conversion.to_uom_id,
          conversion_rate: conversion.conversion_rate,
          from_uom_name: fromUom?.name,
          to_uom_name: toUom?.name,
        },
        notes: `UOM conversion created: 1 ${fromUom?.abbreviation || ''} = ${conversion.conversion_rate} ${toUom?.abbreviation || ''}`,
      })
    }

    return conversion
  } catch (error) {
    console.error('[DB] Error creating UOM conversion:', error)
    throw error
  }
}

/**
 * Update a UOM conversion
 */
export async function updateUOMConversion(
  id: number,
  input: {
    conversion_rate: number
  },
): Promise<UOMConversionRow | null> {
  try {
    if (input.conversion_rate <= 0) {
      throw new Error('Conversion rate must be greater than 0')
    }

    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRows = await db.select<UOMConversionRow[]>(
      `SELECT * FROM uom_conversions WHERE id = $1`,
      [id],
    )
    const oldConversion = oldRows[0]
    if (!oldConversion) {
      return null
    }

    // Get UOM names for audit trail
    const fromUomRows = await db.select<Array<{ name: string; abbreviation: string }>>(
      `SELECT name, abbreviation FROM uoms WHERE id = $1`,
      [oldConversion.from_uom_id],
    )
    const toUomRows = await db.select<Array<{ name: string; abbreviation: string }>>(
      `SELECT name, abbreviation FROM uoms WHERE id = $1`,
      [oldConversion.to_uom_id],
    )
    const fromUom = fromUomRows[0]
    const toUom = toUomRows[0]

    await db.execute(
      `UPDATE uom_conversions SET conversion_rate = $1, updated_at = $2 WHERE id = $3`,
      [input.conversion_rate, now, id],
    )

    const rows = await db.select<UOMConversionRow[]>(
      `SELECT * FROM uom_conversions WHERE id = $1`,
      [id],
    )
    const updated = rows[0] ?? null

    // Record audit trail
    if (updated && oldConversion) {
      await recordAuditTrail({
        entity_type: 'uom_conversion',
        entity_id: id,
        action: 'update',
        old_values: {
          conversion_rate: oldConversion.conversion_rate,
        },
        new_values: {
          conversion_rate: updated.conversion_rate,
        },
        notes: `UOM conversion updated: 1 ${fromUom?.abbreviation || ''} = ${updated.conversion_rate} ${toUom?.abbreviation || ''} (was ${oldConversion.conversion_rate})`,
      })
    }

    return updated
  } catch (error) {
    console.error('[DB] Error updating UOM conversion:', error)
    throw error
  }
}

/**
 * Delete a UOM conversion
 */
export async function deleteUOMConversion(id: number): Promise<boolean> {
  try {
    const db = await getDb()

    // Get conversion details for audit trail before deleting
    const oldRows = await db.select<UOMConversionRow[]>(
      `SELECT * FROM uom_conversions WHERE id = $1`,
      [id],
    )
    const oldConversion = oldRows[0]
    
    if (oldConversion) {
      // Get UOM names for audit trail
      const fromUomRows = await db.select<Array<{ name: string; abbreviation: string }>>(
        `SELECT name, abbreviation FROM uoms WHERE id = $1`,
        [oldConversion.from_uom_id],
      )
      const toUomRows = await db.select<Array<{ name: string; abbreviation: string }>>(
        `SELECT name, abbreviation FROM uoms WHERE id = $1`,
        [oldConversion.to_uom_id],
      )
      const fromUom = fromUomRows[0]
      const toUom = toUomRows[0]

      await db.execute(`DELETE FROM uom_conversions WHERE id = $1`, [id])

      // Record audit trail
      await recordAuditTrail({
        entity_type: 'uom_conversion',
        entity_id: id,
        action: 'delete',
        old_values: {
          from_uom_id: oldConversion.from_uom_id,
          to_uom_id: oldConversion.to_uom_id,
          conversion_rate: oldConversion.conversion_rate,
          from_uom_name: fromUom?.name,
          to_uom_name: toUom?.name,
        },
        notes: `UOM conversion deleted: 1 ${fromUom?.abbreviation || ''} = ${oldConversion.conversion_rate} ${toUom?.abbreviation || ''}`,
      })
    } else {
      await db.execute(`DELETE FROM uom_conversions WHERE id = $1`, [id])
    }

    return true
  } catch (error) {
    console.error('[DB] Error deleting UOM conversion:', error)
    throw error
  }
}

