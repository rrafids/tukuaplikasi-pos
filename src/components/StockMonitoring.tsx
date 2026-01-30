import { useState, useEffect } from 'react'
import {
  CubeIcon,
  MapPinIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import {
  getAllProductStocks,
  getAllLocationStocks,
  getLowStockAlerts,
  getStockSummary,
  type ProductStockInfo,
  type LocationStockInfo,
  type LowStockAlert,
} from '../db/stockMonitoring'
import { useLanguage } from '../contexts/LanguageContext'

export default function StockMonitoring() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<
    'products' | 'locations' | 'alerts'
  >('products')
  const [loading, setLoading] = useState(true)
  const [productStocks, setProductStocks] = useState<ProductStockInfo[]>([])
  const [locationStocks, setLocationStocks] = useState<LocationStockInfo[]>([])
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([])
  const [summary, setSummary] = useState({
    total_products: 0,
    total_locations: 0,
    total_stock_quantity: 0,
    total_stock_value: 0,
    products_with_stock: 0,
    products_out_of_stock: 0,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [lowStockThreshold, setLowStockThreshold] = useState(10)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [products, locations, alerts, summaryData] = await Promise.all([
        getAllProductStocks(lowStockThreshold),
        getAllLocationStocks(),
        getLowStockAlerts(lowStockThreshold),
        getStockSummary(),
      ])

      setProductStocks(products)
      setLocationStocks(locations)
      setLowStockAlerts(alerts)
      setSummary(summaryData)
    } catch (error) {
      console.error('[StockMonitoring] Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [lowStockThreshold])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadData()
      }, 5000) // Refresh every 5 seconds

      return () => clearInterval(interval)
    }
  }, [autoRefresh, lowStockThreshold])

  const formatCurrency = (value: number) => {
    return `Rp ${value.toLocaleString('id-ID')}`
  }

  const filteredProductStocks = productStocks.filter((p) =>
    p.product_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredLocationStocks = locationStocks.filter((l) =>
    l.location_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredAlerts = lowStockAlerts.filter(
    (a) =>
      a.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.location_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-slate-500">Loading stock data...</div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.nav.stockMonitoring}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.stockMonitoring.description}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="autoRefresh" className="text-sm text-slate-600">
              Auto-refresh (5s)
            </label>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">
                  Total Stock Value
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {formatCurrency(summary.total_stock_value)}
                </p>
              </div>
              <div className="rounded-full bg-primary-100 p-3">
                <CubeIcon className="h-6 w-6 text-primary-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">
                  Total Quantity
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {summary.total_stock_quantity.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <CubeIcon className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">
                  Low Stock Alerts
                </p>
                <p className="mt-1 text-2xl font-bold text-rose-600">
                  {lowStockAlerts.length}
                </p>
              </div>
              <div className="rounded-full bg-rose-100 p-3">
                <ExclamationTriangleIcon className="h-6 w-6 text-rose-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">
                  Products with Stock
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {summary.products_with_stock} / {summary.total_products}
                </p>
                <p className="text-xs text-slate-500">
                  {summary.products_out_of_stock} out of stock
                </p>
              </div>
              <div className="rounded-full bg-primary-100 p-3">
                <MapPinIcon className="h-6 w-6 text-primary-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs and Search */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('products')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeTab === 'products'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Products ({productStocks.length})
            </button>
            <button
              onClick={() => setActiveTab('locations')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeTab === 'locations'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Locations ({locationStocks.length})
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeTab === 'alerts'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              } ${lowStockAlerts.length > 0 ? 'relative' : ''}`}
            >
              Low Stock ({lowStockAlerts.length})
              {lowStockAlerts.length > 0 && (
                <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">
                Low Stock Threshold:
              </label>
              <input
                type="number"
                value={lowStockThreshold}
                onChange={(e) =>
                  setLowStockThreshold(
                    Math.max(0, parseInt(e.target.value) || 0)
                  )
                }
                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                min="0"
              />
            </div>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="rounded-lg bg-white shadow-sm">
          {activeTab === 'products' && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Product
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Price
                    </th>
                    {locationStocks.map((loc) => (
                      <th
                        key={loc.location_id}
                        className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-700"
                      >
                        {loc.location_name}
                        <div className="text-[10px] font-normal text-slate-500">
                          {loc.location_type}
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Total Stock
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Total Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProductStocks.map((product) => (
                    <tr key={product.product_id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                        {product.product_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {formatCurrency(product.product_price)}
                      </td>
                      {product.location_stocks.map((ls) => (
                        <td
                          key={ls.location_id}
                          className={`whitespace-nowrap px-4 py-3 text-center text-sm ${
                            ls.stock <= lowStockThreshold
                              ? 'font-semibold text-rose-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {ls.stock}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {product.total_stock}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {formatCurrency(product.total_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'locations' && (
            <div className="p-4">
              <div className="grid gap-4 md:grid-cols-2">
                {filteredLocationStocks.map((location) => (
                  <div
                    key={location.location_id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {location.location_name}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {location.location_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-600">Total Value</p>
                        <p className="text-lg font-bold text-slate-900">
                          {formatCurrency(location.total_value)}
                        </p>
                      </div>
                    </div>
                    <div className="mb-3 flex gap-4 text-sm">
                      <div>
                        <span className="text-slate-600">Products: </span>
                        <span className="font-medium text-slate-900">
                          {location.total_products}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600">Quantity: </span>
                        <span className="font-medium text-slate-900">
                          {location.total_stock}
                        </span>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-2 py-1 text-left text-xs font-semibold text-slate-700">
                              Product
                            </th>
                            <th className="px-2 py-1 text-center text-xs font-semibold text-slate-700">
                              Stock
                            </th>
                            <th className="px-2 py-1 text-right text-xs font-semibold text-slate-700">
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {location.products.map((product) => (
                            <tr key={product.product_id}>
                              <td className="px-2 py-1 text-xs text-slate-900">
                                {product.product_name}
                              </td>
                              <td className="px-2 py-1 text-center text-xs text-slate-600">
                                {product.stock}
                              </td>
                              <td className="px-2 py-1 text-right text-xs text-slate-600">
                                {formatCurrency(product.value)}
                              </td>
                            </tr>
                          ))}
                          {location.products.length === 0 && (
                            <tr>
                              <td
                                colSpan={3}
                                className="px-2 py-4 text-center text-xs text-slate-500"
                              >
                                No stock available
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Product
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Location
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Current Stock
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Threshold
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Product Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAlerts.map((alert, index) => (
                    <tr
                      key={`${alert.product_id}-${alert.location_id}-${index}`}
                      className="bg-rose-50/30 hover:bg-rose-50/50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                        {alert.product_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        <div>
                          <span className="font-medium">
                            {alert.location_name}
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            ({alert.location_type})
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm font-bold text-rose-600">
                        {alert.current_stock}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-slate-600">
                        ≤ {lowStockThreshold}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                        {formatCurrency(alert.product_price)}
                      </td>
                    </tr>
                  ))}
                  {filteredAlerts.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-sm text-slate-500"
                      >
                        No low stock alerts. All products are above the
                        threshold.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
