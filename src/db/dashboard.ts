import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'

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
      await dbPromise
    } catch (error) {
      console.error('[DB] Error loading database:', error)
      throw error
    }
  }
  return dbPromise
}

export type SalesByDate = {
  date: string
  total_sales: number
  total_revenue: number
  transaction_count: number
}

export type ProcurementsByDate = {
  date: string
  total_procurements: number
  total_quantity: number
  total_value: number
  approved_count: number
  pending_count: number
}

export type DisposalsByDate = {
  date: string
  total_disposals: number
  total_quantity: number
  approved_count: number
  pending_count: number
}

export type TopProduct = {
  product_id: number
  product_name: string
  total_quantity_sold: number
  total_revenue: number
  transaction_count: number
}

export type LocationStats = {
  location_id: number
  location_name: string
  location_type: string
  total_sales: number
  total_revenue: number
  transaction_count: number
}

export type DashboardSummary = {
  total_revenue: number
  total_sales_count: number
  total_procurements_value: number
  total_procurements_count: number
  total_disposals_count: number
  total_products: number
  total_locations: number
}

// Get sales data grouped by date
export async function getSalesByDate(
  dateFrom?: string,
  dateTo?: string,
): Promise<SalesByDate[]> {
  try {
    const db = await getDb()
    let query = `
      SELECT 
        DATE(s.created_at) as date,
        COUNT(DISTINCT s.id) as transaction_count,
        SUM(s.total_amount) as total_revenue,
        COUNT(DISTINCT s.id) as total_sales
      FROM sales s
      WHERE s.deleted_at IS NULL
    `
    const params: unknown[] = []

    if (dateFrom) {
      query += ` AND DATE(s.created_at) >= DATE($${params.length + 1})`
      params.push(dateFrom)
    }

    if (dateTo) {
      query += ` AND DATE(s.created_at) <= DATE($${params.length + 1})`
      params.push(dateTo)
    }

    query += ` GROUP BY DATE(s.created_at) ORDER BY date ASC`

    const rows = await db.select<
      Array<{
        date: string
        transaction_count: number
        total_revenue: number
        total_sales: number
      }>
    >(query, params)

    return rows.map((row) => ({
      date: row.date,
      total_sales: row.total_sales,
      total_revenue: row.total_revenue || 0,
      transaction_count: row.transaction_count,
    }))
  } catch (error) {
    console.error('[DB] Error getting sales by date:', error)
    throw error
  }
}

// Get procurements data grouped by date
export async function getProcurementsByDate(
  dateFrom?: string,
  dateTo?: string,
): Promise<ProcurementsByDate[]> {
  try {
    const db = await getDb()
    let query = `
      SELECT 
        DATE(pr.created_at) as date,
        COUNT(DISTINCT pr.id) as total_procurements,
        SUM(pr.quantity) as total_quantity,
        SUM(pr.quantity * COALESCE(pr.unit_price, 0)) as total_value,
        SUM(CASE WHEN pr.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN pr.status = 'pending' THEN 1 ELSE 0 END) as pending_count
      FROM procurements pr
      WHERE pr.deleted_at IS NULL
    `
    const params: unknown[] = []

    if (dateFrom) {
      query += ` AND DATE(pr.created_at) >= DATE($${params.length + 1})`
      params.push(dateFrom)
    }

    if (dateTo) {
      query += ` AND DATE(pr.created_at) <= DATE($${params.length + 1})`
      params.push(dateTo)
    }

    query += ` GROUP BY DATE(pr.created_at) ORDER BY date ASC`

    const rows = await db.select<
      Array<{
        date: string
        total_procurements: number
        total_quantity: number
        total_value: number
        approved_count: number
        pending_count: number
      }>
    >(query, params)

    return rows.map((row) => ({
      date: row.date,
      total_procurements: row.total_procurements,
      total_quantity: row.total_quantity || 0,
      total_value: row.total_value || 0,
      approved_count: row.approved_count || 0,
      pending_count: row.pending_count || 0,
    }))
  } catch (error) {
    console.error('[DB] Error getting procurements by date:', error)
    throw error
  }
}

// Get disposals data grouped by date
export async function getDisposalsByDate(
  dateFrom?: string,
  dateTo?: string,
): Promise<DisposalsByDate[]> {
  try {
    const db = await getDb()
    let query = `
      SELECT 
        DATE(d.created_at) as date,
        COUNT(DISTINCT d.id) as total_disposals,
        SUM(d.quantity) as total_quantity,
        SUM(CASE WHEN d.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN d.status = 'pending' THEN 1 ELSE 0 END) as pending_count
      FROM disposals d
      WHERE d.deleted_at IS NULL
    `
    const params: unknown[] = []

    if (dateFrom) {
      query += ` AND DATE(d.created_at) >= DATE($${params.length + 1})`
      params.push(dateFrom)
    }

    if (dateTo) {
      query += ` AND DATE(d.created_at) <= DATE($${params.length + 1})`
      params.push(dateTo)
    }

    query += ` GROUP BY DATE(d.created_at) ORDER BY date ASC`

    const rows = await db.select<
      Array<{
        date: string
        total_disposals: number
        total_quantity: number
        approved_count: number
        pending_count: number
      }>
    >(query, params)

    return rows.map((row) => ({
      date: row.date,
      total_disposals: row.total_disposals,
      total_quantity: row.total_quantity || 0,
      approved_count: row.approved_count || 0,
      pending_count: row.pending_count || 0,
    }))
  } catch (error) {
    console.error('[DB] Error getting disposals by date:', error)
    throw error
  }
}

// Get top products by sales
export async function getTopProducts(
  limit: number = 10,
  dateFrom?: string,
  dateTo?: string,
): Promise<TopProduct[]> {
  try {
    const db = await getDb()
    let query = `
      SELECT 
        si.product_id,
        p.name as product_name,
        SUM(si.quantity) as total_quantity_sold,
        SUM(si.subtotal) as total_revenue,
        COUNT(DISTINCT si.sale_id) as transaction_count
      FROM sales_items si
      INNER JOIN sales s ON si.sale_id = s.id
      INNER JOIN products p ON si.product_id = p.id
      WHERE s.deleted_at IS NULL AND p.deleted_at IS NULL
    `
    const params: unknown[] = []

    if (dateFrom) {
      query += ` AND DATE(s.created_at) >= DATE($${params.length + 1})`
      params.push(dateFrom)
    }

    if (dateTo) {
      query += ` AND DATE(s.created_at) <= DATE($${params.length + 1})`
      params.push(dateTo)
    }

    query += `
      GROUP BY si.product_id, p.name
      ORDER BY total_revenue DESC
      LIMIT $${params.length + 1}
    `
    params.push(limit)

    const rows = await db.select<
      Array<{
        product_id: number
        product_name: string
        total_quantity_sold: number
        total_revenue: number
        transaction_count: number
      }>
    >(query, params)

    return rows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      total_quantity_sold: row.total_quantity_sold,
      total_revenue: row.total_revenue || 0,
      transaction_count: row.transaction_count,
    }))
  } catch (error) {
    console.error('[DB] Error getting top products:', error)
    throw error
  }
}

// Get location statistics
export async function getLocationStats(
  dateFrom?: string,
  dateTo?: string,
): Promise<LocationStats[]> {
  try {
    const db = await getDb()
    let query = `
      SELECT 
        s.location_id,
        l.name as location_name,
        l.type as location_type,
        COUNT(DISTINCT s.id) as transaction_count,
        SUM(s.total_amount) as total_revenue,
        COUNT(DISTINCT s.id) as total_sales
      FROM sales s
      INNER JOIN locations l ON s.location_id = l.id
      WHERE s.deleted_at IS NULL AND l.deleted_at IS NULL
    `
    const params: unknown[] = []

    if (dateFrom) {
      query += ` AND DATE(s.created_at) >= DATE($${params.length + 1})`
      params.push(dateFrom)
    }

    if (dateTo) {
      query += ` AND DATE(s.created_at) <= DATE($${params.length + 1})`
      params.push(dateTo)
    }

    query += ` GROUP BY s.location_id, l.name, l.type ORDER BY total_revenue DESC`

    const rows = await db.select<
      Array<{
        location_id: number
        location_name: string
        location_type: string
        transaction_count: number
        total_revenue: number
        total_sales: number
      }>
    >(query, params)

    return rows.map((row) => ({
      location_id: row.location_id,
      location_name: row.location_name,
      location_type: row.location_type,
      total_sales: row.total_sales,
      total_revenue: row.total_revenue || 0,
      transaction_count: row.transaction_count,
    }))
  } catch (error) {
    console.error('[DB] Error getting location stats:', error)
    throw error
  }
}

// Get dashboard summary
export async function getDashboardSummary(
  dateFrom?: string,
  dateTo?: string,
): Promise<DashboardSummary> {
  try {
    const db = await getDb()

    // Total revenue
    let revenueQuery = `
      SELECT COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales
      WHERE deleted_at IS NULL
    `
    const revenueParams: unknown[] = []
    if (dateFrom) {
      revenueQuery += ` AND DATE(created_at) >= DATE($${revenueParams.length + 1})`
      revenueParams.push(dateFrom)
    }
    if (dateTo) {
      revenueQuery += ` AND DATE(created_at) <= DATE($${revenueParams.length + 1})`
      revenueParams.push(dateTo)
    }
    const revenueRows = await db.select<Array<{ total_revenue: number }>>(
      revenueQuery,
      revenueParams,
    )

    // Total sales count
    let salesCountQuery = `
      SELECT COUNT(*) as total_sales_count
      FROM sales
      WHERE deleted_at IS NULL
    `
    const salesCountParams: unknown[] = []
    if (dateFrom) {
      salesCountQuery += ` AND DATE(created_at) >= DATE($${salesCountParams.length + 1})`
      salesCountParams.push(dateFrom)
    }
    if (dateTo) {
      salesCountQuery += ` AND DATE(created_at) <= DATE($${salesCountParams.length + 1})`
      salesCountParams.push(dateTo)
    }
    const salesCountRows = await db.select<Array<{ total_sales_count: number }>>(
      salesCountQuery,
      salesCountParams,
    )

    // Total procurements value
    let procurementsQuery = `
      SELECT 
        COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0) as total_procurements_value,
        COUNT(*) as total_procurements_count
      FROM procurements
      WHERE deleted_at IS NULL
    `
    const procurementsParams: unknown[] = []
    if (dateFrom) {
      procurementsQuery += ` AND DATE(created_at) >= DATE($${procurementsParams.length + 1})`
      procurementsParams.push(dateFrom)
    }
    if (dateTo) {
      procurementsQuery += ` AND DATE(created_at) <= DATE($${procurementsParams.length + 1})`
      procurementsParams.push(dateTo)
    }
    const procurementsRows = await db.select<
      Array<{ total_procurements_value: number; total_procurements_count: number }>
    >(procurementsQuery, procurementsParams)

    // Total disposals count
    let disposalsQuery = `
      SELECT COUNT(*) as total_disposals_count
      FROM disposals
      WHERE deleted_at IS NULL
    `
    const disposalsParams: unknown[] = []
    if (dateFrom) {
      disposalsQuery += ` AND DATE(created_at) >= DATE($${disposalsParams.length + 1})`
      disposalsParams.push(dateFrom)
    }
    if (dateTo) {
      disposalsQuery += ` AND DATE(created_at) <= DATE($${disposalsParams.length + 1})`
      disposalsParams.push(dateTo)
    }
    const disposalsRows = await db.select<Array<{ total_disposals_count: number }>>(
      disposalsQuery,
      disposalsParams,
    )

    // Total products
    const productsRows = await db.select<Array<{ total_products: number }>>(
      `SELECT COUNT(*) as total_products FROM products WHERE deleted_at IS NULL`,
    )

    // Total locations
    const locationsRows = await db.select<Array<{ total_locations: number }>>(
      `SELECT COUNT(*) as total_locations FROM locations WHERE deleted_at IS NULL`,
    )

    return {
      total_revenue: revenueRows[0]?.total_revenue || 0,
      total_sales_count: salesCountRows[0]?.total_sales_count || 0,
      total_procurements_value: procurementsRows[0]?.total_procurements_value || 0,
      total_procurements_count: procurementsRows[0]?.total_procurements_count || 0,
      total_disposals_count: disposalsRows[0]?.total_disposals_count || 0,
      total_products: productsRows[0]?.total_products || 0,
      total_locations: locationsRows[0]?.total_locations || 0,
    }
  } catch (error) {
    console.error('[DB] Error getting dashboard summary:', error)
    throw error
  }
}

