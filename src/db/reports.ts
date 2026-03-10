import Database from '@tauri-apps/plugin-sql'
import { appDataDir } from '@tauri-apps/api/path'

export type LabaRugiData = {
  revenue: number
  cogs: number
  gross_profit: number
  procurements_total: number
}

export type DailyLabaRugi = {
  date: string
  revenue: number
  cogs: number
  gross_profit: number
}

// Get the database path
async function getDbPath(): Promise<string> {
  const dbPath = 'sqlite:satria_pos.db'

  if (import.meta.env.DEV) {
    try {
      const dataDir = await appDataDir()
      console.log('[DB] App data directory:', dataDir)
    } catch (error) {
      console.warn('[DB] Could not resolve app data directory:', error)
    }
  }

  return dbPath
}

// Cache the database promise and path
let dbPromise: ReturnType<typeof Database.load> | null = null
let dbPath: string | null = null

async function getDb() {
  if (!dbPromise) {
    if (!dbPath) {
      dbPath = await getDbPath()
    }
    dbPromise = Database.load(dbPath)
  }
  return dbPromise
}

export async function getLabaRugiReport(startDate: string, endDate: string, productId?: number | null): Promise<LabaRugiData> {
  try {
    const db = await getDb()

    const start = `${startDate}T00:00:00.000Z`
    const end = `${endDate}T23:59:59.999Z`

    // 1. Revenue
    let revenueQuery = `SELECT SUM(s.total_amount) as total FROM sales s WHERE s.deleted_at IS NULL AND s.created_at >= $1 AND s.created_at <= $2`
    let revenueParams: any[] = [start, end]

    if (productId) {
      // If product filter is active, we calculate revenue based on sales_items for that product
      // Note: Discounts are applied to the whole sale, so for per-product report, 
      // we use the item subtotal which is more accurate for product performance.
      revenueQuery = `
        SELECT SUM(si.subtotal) as total 
        FROM sales_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.deleted_at IS NULL AND s.created_at >= $1 AND s.created_at <= $2 AND si.product_id = $3`
      revenueParams.push(productId)
    }

    const salesResult = await db.select<Array<{ total: number | null }>>(revenueQuery, revenueParams)
    const revenue = salesResult[0]?.total || 0

    // 2. COGS (Harga Pokok Penjualan)
    let cogsQuery = `SELECT SUM(si.quantity * COALESCE(p.buy_price, p.price, 0)) as total 
       FROM sales_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.deleted_at IS NULL AND s.created_at >= $1 AND s.created_at <= $2`
    let cogsParams: any[] = [start, end]

    if (productId) {
      cogsQuery += ` AND si.product_id = $3`
      cogsParams.push(productId)
    }

    const cogsResult = await db.select<Array<{ total: number | null }>>(cogsQuery, cogsParams)
    const cogs = cogsResult[0]?.total || 0

    // 3. Procurements (Pembelian Stok)
    let procurementsQuery = `SELECT SUM(quantity * COALESCE(unit_price, 0)) as total 
       FROM procurements 
       WHERE deleted_at IS NULL AND status = 'approved' AND created_at >= $1 AND created_at <= $2`
    let procurementsParams: any[] = [start, end]

    if (productId) {
      procurementsQuery += ` AND product_id = $3`
      procurementsParams.push(productId)
    }

    const procurementsResult = await db.select<Array<{ total: number | null }>>(procurementsQuery, procurementsParams)
    const procurements_total = procurementsResult[0]?.total || 0

    return {
      revenue,
      cogs,
      gross_profit: revenue - cogs,
      procurements_total
    }
  } catch (error) {
    console.error('[DB] Error getting Laba Rugi report:', error)
    throw error
  }
}

export async function getLabaRugiDaily(startDate: string, endDate: string, productId?: number | null): Promise<DailyLabaRugi[]> {
  try {
    const db = await getDb()

    const start = `${startDate}T00:00:00.000Z`
    const end = `${endDate}T23:59:59.999Z`

    // Get daily revenue
    let revenueQuery = `SELECT 
        substr(s.created_at, 1, 10) as date,
        SUM(s.total_amount) as revenue
       FROM sales s
       WHERE s.deleted_at IS NULL AND s.created_at >= $1 AND s.created_at <= $2
       GROUP BY date
       ORDER BY date ASC`
    let revenueParams: any[] = [start, end]

    if (productId) {
      revenueQuery = `SELECT 
        substr(s.created_at, 1, 10) as date,
        SUM(si.subtotal) as revenue
       FROM sales_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE s.deleted_at IS NULL AND s.created_at >= $1 AND s.created_at <= $2 AND si.product_id = $3
       GROUP BY date
       ORDER BY date ASC`
      revenueParams.push(productId)
    }

    const revenueRows = await db.select<Array<{ date: string, revenue: number | null }>>(revenueQuery, revenueParams)

    // Get daily COGS
    let cogsQuery = `SELECT 
        substr(s.created_at, 1, 10) as date,
        SUM(si.quantity * COALESCE(p.buy_price, p.price, 0)) as cogs
       FROM sales_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.deleted_at IS NULL AND s.created_at >= $1 AND s.created_at <= $2
       GROUP BY date`
    let cogsParams: any[] = [start, end]

    if (productId) {
      cogsQuery += ` AND si.product_id = $3`
      cogsParams.push(productId)
    }

    const cogsRows = await db.select<Array<{ date: string, cogs: number | null }>>(cogsQuery, cogsParams)

    const cogsMap = new Map<string, number>()
    for (const row of cogsRows) {
      cogsMap.set(row.date, row.cogs || 0)
    }

    const dailyData: DailyLabaRugi[] = []

    // Merge data
    for (const row of revenueRows) {
      const revenue = row.revenue || 0
      const cogs = cogsMap.get(row.date) || 0
      dailyData.push({
        date: row.date,
        revenue,
        cogs,
        gross_profit: revenue - cogs
      })
    }

    return dailyData

  } catch (error) {
    console.error('[DB] Error getting daily Laba Rugi:', error)
    throw error
  }
}
