import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { recordAuditTrail } from './auditTrail'

export type RoleRow = {
  id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type RolePermissionRow = {
  role_id: number
  view_name: string
}

export type RoleWithPermissions = RoleRow & {
  permissions: string[]
}

// Available views/menus in the application
export const AVAILABLE_VIEWS = [
  'dashboard',
  'products',
  'categories',
  'uoms',
  'locations',
  'product-location-stocks',
  'procurements',
  'disposals',
  'sales',
  'stock-movements',
  'stock-monitoring',
  'stock-opname',
  'audit-trail',
] as const

export type ViewName = (typeof AVAILABLE_VIEWS)[number]

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
      console.log('[DB] Database loaded, creating role tables if not exists...')

      // Create roles table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS roles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        )
      `)

      // Create role_permissions table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id INTEGER NOT NULL,
          view_name TEXT NOT NULL,
          PRIMARY KEY (role_id, view_name),
          FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        )
      `)

      console.log('[DB] Role tables created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== ROLES ====================

export async function listRoles(): Promise<RoleWithPermissions[]> {
  try {
    const db = await getDb()
    const roles = await db.select<RoleRow[]>(
      `SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY name ASC`,
    )

    // Get permissions for each role
    const rolesWithPermissions = await Promise.all(
      roles.map(async (role) => {
        const permissions = await db.select<RolePermissionRow[]>(
          `SELECT view_name FROM role_permissions WHERE role_id = $1`,
          [role.id],
        )
        return {
          ...role,
          permissions: permissions.map((p) => p.view_name),
        }
      }),
    )

    return rolesWithPermissions
  } catch (error) {
    console.error('[DB] Error listing roles:', error)
    throw error
  }
}

export async function getRole(id: number): Promise<RoleWithPermissions | null> {
  try {
    const db = await getDb()
    const roles = await db.select<RoleRow[]>(
      `SELECT * FROM roles WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )

    if (roles.length === 0) {
      return null
    }

    const role = roles[0]
    const permissions = await db.select<RolePermissionRow[]>(
      `SELECT view_name FROM role_permissions WHERE role_id = $1`,
      [id],
    )

    return {
      ...role,
      permissions: permissions.map((p) => p.view_name),
    }
  } catch (error) {
    console.error('[DB] Error getting role:', error)
    throw error
  }
}

export async function createRole(input: {
  name: string
  description?: string | null
  permissions: string[]
}): Promise<RoleWithPermissions> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Create role
    await db.execute(
      `
        INSERT INTO roles (name, description, created_at, updated_at, deleted_at)
        VALUES ($1, $2, $3, $4, NULL)
      `,
      [input.name, input.description || null, now, now],
    )

    const roles = await db.select<RoleRow[]>(
      `SELECT * FROM roles ORDER BY id DESC LIMIT 1`,
    )
    const role = roles[0]

    // Add permissions
    if (input.permissions.length > 0) {
      for (const viewName of input.permissions) {
        await db.execute(
          `
            INSERT INTO role_permissions (role_id, view_name)
            VALUES ($1, $2)
          `,
          [role.id, viewName],
        )
      }
    }

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'role',
      entity_id: role.id,
      action: 'create',
      new_values: {
        name: role.name,
        description: role.description,
        permissions: input.permissions,
      },
      notes: `Role created: ${role.name}`,
    })

    return {
      ...role,
      permissions: input.permissions,
    }
  } catch (error) {
    console.error('[DB] Error creating role:', error)
    throw error
  }
}

export async function updateRole(
  id: number,
  input: {
    name: string
    description?: string | null
    permissions: string[]
  },
): Promise<RoleWithPermissions | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRoles = await db.select<RoleRow[]>(
      `SELECT * FROM roles WHERE id = $1`,
      [id],
    )
    const oldRole = oldRoles[0]
    if (!oldRole) {
      return null
    }

    const oldPermissions = await db.select<RolePermissionRow[]>(
      `SELECT view_name FROM role_permissions WHERE role_id = $1`,
      [id],
    )

    // Update role
    await db.execute(
      `
        UPDATE roles
        SET name = $1,
            description = $2,
            updated_at = $3
        WHERE id = $4
      `,
      [input.name, input.description || null, now, id],
    )

    // Delete all existing permissions
    await db.execute(
      `DELETE FROM role_permissions WHERE role_id = $1`,
      [id],
    )

    // Add new permissions
    if (input.permissions.length > 0) {
      for (const viewName of input.permissions) {
        await db.execute(
          `
            INSERT INTO role_permissions (role_id, view_name)
            VALUES ($1, $2)
          `,
          [id, viewName],
        )
      }
    }

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'role',
      entity_id: id,
      action: 'update',
      old_values: {
        name: oldRole.name,
        description: oldRole.description,
        permissions: oldPermissions.map((p) => p.view_name),
      },
      new_values: {
        name: input.name,
        description: input.description,
        permissions: input.permissions,
      },
      notes: `Role updated: ${input.name}`,
    })

    return await getRole(id)
  } catch (error) {
    console.error('[DB] Error updating role:', error)
    throw error
  }
}

export async function softDeleteRole(id: number): Promise<RoleRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRoles = await db.select<RoleRow[]>(
      `SELECT * FROM roles WHERE id = $1`,
      [id],
    )
    const oldRole = oldRoles[0]
    if (!oldRole) {
      return null
    }

    await db.execute(
      `
        UPDATE roles
        SET deleted_at = $1,
            updated_at = $1
        WHERE id = $2
      `,
      [now, id],
    )

    const roles = await db.select<RoleRow[]>(
      `SELECT * FROM roles WHERE id = $1`,
      [id],
    )
    const deleted = roles[0] ?? null

    // Record audit trail
    if (deleted) {
      await recordAuditTrail({
        entity_type: 'role',
        entity_id: id,
        action: 'delete',
        old_values: {
          name: oldRole.name,
          description: oldRole.description,
        },
        notes: `Role deleted: ${oldRole.name}`,
      })
    }

    return deleted
  } catch (error) {
    console.error('[DB] Error deleting role:', error)
    throw error
  }
}

export async function restoreRole(id: number): Promise<RoleRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldRoles = await db.select<RoleRow[]>(
      `SELECT * FROM roles WHERE id = $1`,
      [id],
    )
    const oldRole = oldRoles[0]
    if (!oldRole) {
      return null
    }

    await db.execute(
      `
        UPDATE roles
        SET deleted_at = NULL,
            updated_at = $1
        WHERE id = $2
      `,
      [now, id],
    )

    const roles = await db.select<RoleRow[]>(
      `SELECT * FROM roles WHERE id = $1`,
      [id],
    )
    const restored = roles[0] ?? null

    // Record audit trail
    if (restored) {
      await recordAuditTrail({
        entity_type: 'role',
        entity_id: id,
        action: 'restore',
        new_values: {
          name: restored.name,
          description: restored.description,
        },
        notes: `Role restored: ${restored.name}`,
      })
    }

    return restored
  } catch (error) {
    console.error('[DB] Error restoring role:', error)
    throw error
  }
}

