import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'
import { recordAuditTrail } from './auditTrail'
import { getRole } from './roles'

export type UserRow = {
  id: number
  username: string
  password_hash: string
  role_id: number | null
  is_superadmin: number // SQLite uses 0/1 for boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type UserWithRole = UserRow & {
  role_name: string | null
  role_permissions: string[]
}

// Simple password hashing (for production, use bcrypt or similar)
// This is a basic implementation - in production, use a proper hashing library
async function hashPassword(password: string): Promise<string> {
  // Simple hash function (for production, use crypto.subtle or bcrypt)
  // This is just for demonstration - use proper password hashing in production
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password)
  return passwordHash === hash
}

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
      console.log('[DB] Database loaded, creating user tables if not exists...')

      // Create roles table first (needed for foreign key constraint)
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

      // Create users table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role_id INTEGER,
          is_superadmin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (role_id) REFERENCES roles(id)
        )
      `)

      // Create default superadmin if it doesn't exist
      try {
        const existingUsers = await db.select<UserRow[]>(
          `SELECT * FROM users WHERE username = 'admin' AND deleted_at IS NULL`,
        )
        if (existingUsers.length === 0) {
          const defaultPassword = await hashPassword('admin123')
          const now = new Date().toISOString()
          await db.execute(
            `
              INSERT INTO users (username, password_hash, role_id, is_superadmin, created_at, updated_at, deleted_at)
              VALUES ($1, $2, NULL, 1, $3, $4, NULL)
            `,
            ['admin', defaultPassword, now, now],
          )
          console.log('[DB] Default superadmin user created (username: admin, password: admin123)')
        }
      } catch (error) {
        console.warn('[DB] Could not create default superadmin:', error)
      }

      console.log('[DB] User tables created/verified successfully')
    } catch (error) {
      console.error('[DB] Error initializing database:', error)
      throw error
    }
  }
  return dbPromise
}

// ==================== USERS ====================

export async function listUsers(): Promise<UserWithRole[]> {
  try {
    const db = await getDb()
    const users = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE deleted_at IS NULL ORDER BY username ASC`,
    )

    // Get role information for each user
    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        let roleName: string | null = null
        let rolePermissions: string[] = []

        if (user.role_id) {
          const role = await getRole(user.role_id)
          if (role) {
            roleName = role.name
            rolePermissions = role.permissions
          }
        }

        return {
          ...user,
          role_name: roleName,
          role_permissions: rolePermissions,
        }
      }),
    )

    return usersWithRoles
  } catch (error) {
    console.error('[DB] Error listing users:', error)
    throw error
  }
}

export async function getUser(id: number): Promise<UserWithRole | null> {
  try {
    const db = await getDb()
    const users = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )

    if (users.length === 0) {
      return null
    }

    const user = users[0]
    let roleName: string | null = null
    let rolePermissions: string[] = []

    if (user.role_id) {
      const role = await getRole(user.role_id)
      if (role) {
        roleName = role.name
        rolePermissions = role.permissions
      }
    }

    return {
      ...user,
      role_name: roleName,
      role_permissions: rolePermissions,
    }
  } catch (error) {
    console.error('[DB] Error getting user:', error)
    throw error
  }
}

export async function getUserByUsername(username: string): Promise<UserWithRole | null> {
  try {
    const db = await getDb()
    const users = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL`,
      [username],
    )

    if (users.length === 0) {
      return null
    }

    const user = users[0]
    let roleName: string | null = null
    let rolePermissions: string[] = []

    if (user.role_id) {
      const role = await getRole(user.role_id)
      if (role) {
        roleName = role.name
        rolePermissions = role.permissions
      }
    }

    return {
      ...user,
      role_name: roleName,
      role_permissions: rolePermissions,
    }
  } catch (error) {
    console.error('[DB] Error getting user by username:', error)
    throw error
  }
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<UserWithRole | null> {
  try {
    const user = await getUserByUsername(username)
    if (!user) {
      return null
    }

    const isValid = await verifyPassword(password, user.password_hash)
    if (!isValid) {
      return null
    }

    // Don't return password hash
    const { password_hash, ...userWithoutPassword } = user
    return userWithoutPassword as UserWithRole
  } catch (error) {
    console.error('[DB] Error authenticating user:', error)
    throw error
  }
}

export async function createUser(input: {
  username: string
  password: string
  role_id?: number | null
  is_superadmin?: boolean
}): Promise<UserWithRole> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()
    const passwordHash = await hashPassword(input.password)

    await db.execute(
      `
        INSERT INTO users (username, password_hash, role_id, is_superadmin, created_at, updated_at, deleted_at)
        VALUES ($1, $2, $3, $4, $5, $6, NULL)
      `,
      [
        input.username,
        passwordHash,
        input.role_id ?? null,
        input.is_superadmin ? 1 : 0,
        now,
        now,
      ],
    )

    const users = await db.select<UserRow[]>(
      `SELECT * FROM users ORDER BY id DESC LIMIT 1`,
    )
    const user = users[0]

    // Get role information
    let roleName: string | null = null
    let rolePermissions: string[] = []

    if (user.role_id) {
      const role = await getRole(user.role_id)
      if (role) {
        roleName = role.name
        rolePermissions = role.permissions
      }
    }

    // Record audit trail
    await recordAuditTrail({
      entity_type: 'user',
      entity_id: user.id,
      action: 'create',
      new_values: {
        username: user.username,
        role_id: user.role_id,
        is_superadmin: user.is_superadmin === 1,
      },
      notes: `User created: ${user.username}`,
    })

    return {
      ...user,
      role_name: roleName,
      role_permissions: rolePermissions,
    }
  } catch (error) {
    console.error('[DB] Error creating user:', error)
    throw error
  }
}

export async function updateUser(
  id: number,
  input: {
    username?: string
    password?: string
    role_id?: number | null
    is_superadmin?: boolean
  },
): Promise<UserWithRole | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldUsers = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE id = $1`,
      [id],
    )
    const oldUser = oldUsers[0]
    if (!oldUser) {
      return null
    }

    // Build update query dynamically
    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (input.username !== undefined) {
      updates.push(`username = $${paramIndex}`)
      values.push(input.username)
      paramIndex++
    }

    if (input.password !== undefined) {
      const passwordHash = await hashPassword(input.password)
      updates.push(`password_hash = $${paramIndex}`)
      values.push(passwordHash)
      paramIndex++
    }

    if (input.role_id !== undefined) {
      updates.push(`role_id = $${paramIndex}`)
      values.push(input.role_id ?? null)
      paramIndex++
    }

    if (input.is_superadmin !== undefined) {
      updates.push(`is_superadmin = $${paramIndex}`)
      values.push(input.is_superadmin ? 1 : 0)
      paramIndex++
    }

    updates.push(`updated_at = $${paramIndex}`)
    values.push(now)
    paramIndex++

    values.push(id)

    if (updates.length > 1) {
      await db.execute(
        `
          UPDATE users
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex}
        `,
        values,
      )
    }

    // Get role information
    const updatedUsers = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE id = $1`,
      [id],
    )
    const updatedUser = updatedUsers[0]
    if (!updatedUser) {
      return null
    }

    let roleName: string | null = null
    let rolePermissions: string[] = []

    if (updatedUser.role_id) {
      const role = await getRole(updatedUser.role_id)
      if (role) {
        roleName = role.name
        rolePermissions = role.permissions
      }
    }

    // Record audit trail
    const oldValues: Record<string, unknown> = {
      username: oldUser.username,
      role_id: oldUser.role_id,
      is_superadmin: oldUser.is_superadmin === 1,
    }
    const newValues: Record<string, unknown> = {
      username: updatedUser.username,
      role_id: updatedUser.role_id,
      is_superadmin: updatedUser.is_superadmin === 1,
    }
    if (input.password !== undefined) {
      newValues.password_changed = true
    }

    await recordAuditTrail({
      entity_type: 'user',
      entity_id: id,
      action: 'update',
      old_values: oldValues,
      new_values: newValues,
      notes: `User updated: ${updatedUser.username}`,
    })

    return {
      ...updatedUser,
      role_name: roleName,
      role_permissions: rolePermissions,
    }
  } catch (error) {
    console.error('[DB] Error updating user:', error)
    throw error
  }
}

export async function softDeleteUser(id: number): Promise<UserRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldUsers = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE id = $1`,
      [id],
    )
    const oldUser = oldUsers[0]
    if (!oldUser) {
      return null
    }

    await db.execute(
      `
        UPDATE users
        SET deleted_at = $1,
            updated_at = $1
        WHERE id = $2
      `,
      [now, id],
    )

    const users = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE id = $1`,
      [id],
    )
    const deleted = users[0] ?? null

    // Record audit trail
    if (deleted) {
      await recordAuditTrail({
        entity_type: 'user',
        entity_id: id,
        action: 'delete',
        old_values: {
          username: oldUser.username,
          role_id: oldUser.role_id,
          is_superadmin: oldUser.is_superadmin === 1,
        },
        notes: `User deleted: ${oldUser.username}`,
      })
    }

    return deleted
  } catch (error) {
    console.error('[DB] Error deleting user:', error)
    throw error
  }
}

export async function restoreUser(id: number): Promise<UserRow | null> {
  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Get old values for audit trail
    const oldUsers = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE id = $1`,
      [id],
    )
    const oldUser = oldUsers[0]
    if (!oldUser) {
      return null
    }

    await db.execute(
      `
        UPDATE users
        SET deleted_at = NULL,
            updated_at = $1
        WHERE id = $2
      `,
      [now, id],
    )

    const users = await db.select<UserRow[]>(
      `SELECT * FROM users WHERE id = $1`,
      [id],
    )
    const restored = users[0] ?? null

    // Record audit trail
    if (restored) {
      await recordAuditTrail({
        entity_type: 'user',
        entity_id: id,
        action: 'restore',
        new_values: {
          username: restored.username,
          role_id: restored.role_id,
          is_superadmin: restored.is_superadmin === 1,
        },
        notes: `User restored: ${restored.username}`,
      })
    }

    return restored
  } catch (error) {
    console.error('[DB] Error restoring user:', error)
    throw error
  }
}

// Check if user has permission to access a view
export function hasPermission(
  user: UserWithRole | null,
  viewName: string,
): boolean {
  if (!user) {
    return false
  }

  // Superadmin has access to everything
  if (user.is_superadmin === 1) {
    return true
  }

  // Check if user's role has permission for this view
  return user.role_permissions.includes(viewName)
}

