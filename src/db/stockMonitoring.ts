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

export type ProductStockInfo = {
  product_id: number
  product_name: string
  product_price: number
  total_stock: number
  total_value: number
  location_stocks: Array<{
    location_id: number
    location_name: string
    location_type: string
    stock: number
    value: number
  }>
}

export type LocationStockInfo = {
  location_id: number
  location_name: string
  location_type: string
  total_products: number
  total_stock: number
  total_value: number
  products: Array<{
    product_id: number
    product_name: string
    stock: number
    value: number
  }>
}

export type LowStockAlert = {
  product_id: number
  product_name: string
  location_id: number
  location_name: string
  location_type: string
  current_stock: number
  product_price: number
}

// Get all products with their stock across all locations
export async function getAllProductStocks(
  _lowStockThreshold: number = 10,
): Promise<ProductStockInfo[]> {
  try {
    const db = await getDb()

    // Get all active products
    const products = await db.select<
      Array<{ id: number; name: string; price: number }>
    >(
      `SELECT id, name, price FROM products WHERE deleted_at IS NULL ORDER BY name ASC`,
    )

    // Get all active locations
    const locations = await db.select<
      Array<{ id: number; name: string; type: string }>
    >(
      `SELECT id, name, type FROM locations WHERE deleted_at IS NULL ORDER BY name ASC`,
    )

    // Get all product location stocks
    const stocks = await db.select<
      Array<{ product_id: number; location_id: number; stock: number }>
    >(
      `SELECT product_id, location_id, stock 
       FROM product_location_stocks 
       ORDER BY product_id, location_id`,
    )

    // Build stock map for quick lookup
    const stockMap = new Map<string, number>()
    stocks.forEach((s) => {
      stockMap.set(`${s.product_id}-${s.location_id}`, s.stock)
    })

    // Build result
    const result: ProductStockInfo[] = products.map((product) => {
      const locationStocks = locations.map((location) => {
        const stock =
          stockMap.get(`${product.id}-${location.id}`) ?? 0
        return {
          location_id: location.id,
          location_name: location.name,
          location_type: location.type,
          stock,
          value: stock * product.price,
        }
      })

      const totalStock = locationStocks.reduce((sum, ls) => sum + ls.stock, 0)
      const totalValue = locationStocks.reduce((sum, ls) => sum + ls.value, 0)

      return {
        product_id: product.id,
        product_name: product.name,
        product_price: product.price,
        total_stock: totalStock,
        total_value: totalValue,
        location_stocks: locationStocks,
      }
    })

    return result
  } catch (error) {
    console.error('[DB] Error getting all product stocks:', error)
    throw error
  }
}

// Get all locations with their stock information
export async function getAllLocationStocks(): Promise<LocationStockInfo[]> {
  try {
    const db = await getDb()

    // Get all active locations
    const locations = await db.select<
      Array<{ id: number; name: string; type: string }>
    >(
      `SELECT id, name, type FROM locations WHERE deleted_at IS NULL ORDER BY name ASC`,
    )

    // Get all active products
    const products = await db.select<
      Array<{ id: number; name: string; price: number }>
    >(
      `SELECT id, name, price FROM products WHERE deleted_at IS NULL ORDER BY name ASC`,
    )

    // Get all product location stocks
    const stocks = await db.select<
      Array<{ product_id: number; location_id: number; stock: number }>
    >(
      `SELECT product_id, location_id, stock 
       FROM product_location_stocks 
       ORDER BY location_id, product_id`,
    )

    // Build stock map
    const stockMap = new Map<string, number>()
    stocks.forEach((s) => {
      stockMap.set(`${s.location_id}-${s.product_id}`, s.stock)
    })

    // Build result
    const result: LocationStockInfo[] = locations.map((location) => {
      const locationProducts = products
        .map((product) => {
          const stock =
            stockMap.get(`${location.id}-${product.id}`) ?? 0
          return {
            product_id: product.id,
            product_name: product.name,
            stock,
            value: stock * product.price,
          }
        })
        .filter((p) => p.stock > 0) // Only show products with stock

      const totalStock = locationProducts.reduce(
        (sum, p) => sum + p.stock,
        0,
      )
      const totalValue = locationProducts.reduce((sum, p) => sum + p.value, 0)

      return {
        location_id: location.id,
        location_name: location.name,
        location_type: location.type,
        total_products: locationProducts.length,
        total_stock: totalStock,
        total_value: totalValue,
        products: locationProducts,
      }
    })

    return result
  } catch (error) {
    console.error('[DB] Error getting all location stocks:', error)
    throw error
  }
}

// Get low stock alerts
export async function getLowStockAlerts(
  threshold: number = 10,
): Promise<LowStockAlert[]> {
  try {
    const db = await getDb()

    const alerts = await db.select<
      Array<{
        product_id: number
        product_name: string
        location_id: number
        location_name: string
        location_type: string
        stock: number
        price: number
      }>
    >(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        l.id as location_id,
        l.name as location_name,
        l.type as location_type,
        COALESCE(pls.stock, 0) as stock,
        p.price
       FROM products p
       CROSS JOIN locations l
       LEFT JOIN product_location_stocks pls ON p.id = pls.product_id AND l.id = pls.location_id
       WHERE p.deleted_at IS NULL 
         AND l.deleted_at IS NULL
         AND COALESCE(pls.stock, 0) <= $1
       ORDER BY COALESCE(pls.stock, 0) ASC, p.name ASC, l.name ASC`,
      [threshold],
    )

    return alerts.map((alert) => ({
      product_id: alert.product_id,
      product_name: alert.product_name,
      location_id: alert.location_id,
      location_name: alert.location_name,
      location_type: alert.location_type,
      current_stock: alert.stock,
      product_price: alert.price,
    }))
  } catch (error) {
    console.error('[DB] Error getting low stock alerts:', error)
    throw error
  }
}

// Get stock summary statistics
export async function getStockSummary() {
  try {
    const db = await getDb()

    // Total products
    const productsCount = await db.select<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM products WHERE deleted_at IS NULL`,
    )

    // Total locations
    const locationsCount = await db.select<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM locations WHERE deleted_at IS NULL`,
    )

    // Total stock value
    const stockValue = await db.select<
      Array<{ total_value: number }>
    >(
      `SELECT 
        COALESCE(SUM(pls.stock * p.price), 0) as total_value
       FROM product_location_stocks pls
       INNER JOIN products p ON pls.product_id = p.id
       WHERE p.deleted_at IS NULL`,
    )

    // Total stock quantity
    const stockQuantity = await db.select<Array<{ total_stock: number }>>(
      `SELECT COALESCE(SUM(stock), 0) as total_stock 
       FROM product_location_stocks`,
    )

    // Products with stock
    const productsWithStock = await db.select<Array<{ count: number }>>(
      `SELECT COUNT(DISTINCT product_id) as count
       FROM product_location_stocks
       WHERE stock > 0`,
    )

    // Products out of stock
    const allProducts = productsCount[0]?.count ?? 0
    const withStock = productsWithStock[0]?.count ?? 0
    const outOfStock = allProducts - withStock

    return {
      total_products: allProducts,
      total_locations: locationsCount[0]?.count ?? 0,
      total_stock_quantity: stockQuantity[0]?.total_stock ?? 0,
      total_stock_value: stockValue[0]?.total_value ?? 0,
      products_with_stock: withStock,
      products_out_of_stock: outOfStock,
    }
  } catch (error) {
    console.error('[DB] Error getting stock summary:', error)
    throw error
  }
}

