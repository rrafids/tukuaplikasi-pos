import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  getSalesByDate,
  getProcurementsByDate,
  getDisposalsByDate,
  getTopProducts,
  getLocationStats,
  getDashboardSummary,
  type SalesByDate,
  type ProcurementsByDate,
  type DisposalsByDate,
  type TopProduct,
  type LocationStats,
  type DashboardSummary,
} from '../db/dashboard'
import {
  CurrencyDollarIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useLanguage } from '../contexts/LanguageContext'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']

export default function Dashboard() {
  const { t } = useLanguage()
  const [dateFrom, setDateFrom] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
  )
  const [dateTo, setDateTo] = useState<string>(
    new Date().toISOString().split('T')[0],
  )
  const [loading, setLoading] = useState(true)
  const [salesData, setSalesData] = useState<SalesByDate[]>([])
  const [procurementsData, setProcurementsData] = useState<ProcurementsByDate[]>([])
  const [disposalsData, setDisposalsData] = useState<DisposalsByDate[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [locationStats, setLocationStats] = useState<LocationStats[]>([])
  const [summary, setSummary] = useState<DashboardSummary>({
    total_revenue: 0,
    total_sales_count: 0,
    total_procurements_value: 0,
    total_procurements_count: 0,
    total_disposals_count: 0,
    total_products: 0,
    total_locations: 0,
  })

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      const [sales, procurements, disposals, products, locations, summaryData] =
        await Promise.all([
          getSalesByDate(dateFrom, dateTo),
          getProcurementsByDate(dateFrom, dateTo),
          getDisposalsByDate(dateFrom, dateTo),
          getTopProducts(10, dateFrom, dateTo),
          getLocationStats(dateFrom, dateTo),
          getDashboardSummary(dateFrom, dateTo),
        ])

      setSalesData(sales)
      setProcurementsData(procurements)
      setDisposalsData(disposals)
      setTopProducts(products)
      setLocationStats(locations)
      setSummary(summaryData)
    } catch (error) {
      console.error('[Dashboard] Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [dateFrom, dateTo])

  const formatCurrency = (value: number) => {
    return `Rp ${value.toLocaleString('id-ID')}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-slate-500">{t.dashboard.loading}</div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.dashboard.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.dashboard.overview}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t.dashboard.dateFrom}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t.dashboard.dateTo}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">{t.dashboard.totalRevenue}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {formatCurrency(summary.total_revenue)}
                </p>
              </div>
              <div className="rounded-full bg-primary-100 p-3">
                <CurrencyDollarIcon className="h-6 w-6 text-primary-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">{t.dashboard.totalSales}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {summary.total_sales_count}
                </p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <ShoppingBagIcon className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">{t.dashboard.procurements}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {summary.total_procurements_count}
                </p>
                <p className="text-xs text-slate-500">
                  {formatCurrency(summary.total_procurements_value)}
                </p>
              </div>
              <div className="rounded-full bg-primary-100 p-3">
                <ShoppingCartIcon className="h-6 w-6 text-primary-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">{t.dashboard.disposals}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {summary.total_disposals_count}
                </p>
              </div>
              <div className="rounded-full bg-red-100 p-3">
                <TrashIcon className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Sales Revenue Chart */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t.dashboard.salesRevenueTrend}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  tickFormatter={(value) => `Rp ${(value / 1000).toFixed(0)}k`}
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <Tooltip
                  formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                  labelFormatter={(label) => formatDate(label)}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total_revenue"
                  stroke="#6366f1"
                  strokeWidth={2}
                  name={t.dashboard.revenue}
                  dot={{ fill: '#6366f1', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Sales Transactions Chart */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t.dashboard.salesTransactions}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                <Tooltip
                  labelFormatter={(label) => formatDate(label)}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="transaction_count" fill="#10b981" name="Transactions" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Procurements Chart */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t.dashboard.procurementsOverview}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={procurementsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                <Tooltip
                  labelFormatter={(label) => formatDate(label)}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="approved_count" fill="#10b981" name="Approved" />
                <Bar dataKey="pending_count" fill="#f59e0b" name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Products Chart */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t.dashboard.topProductsByRevenue}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={topProducts.slice(0, 5)}
                layout="vertical"
                margin={{ left: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tickFormatter={(value) => `Rp ${(value / 1000).toFixed(0)}k`}
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  type="category"
                  dataKey="product_name"
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                  width={70}
                />
                <Tooltip
                  formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="total_revenue" fill="#6366f1" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Location Performance */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t.dashboard.locationPerformance}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={locationStats}
                  dataKey="total_revenue"
                  nameKey="location_name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(props: any) => {
                    const data = props as { location_name?: string; percent?: number }
                    return `${data.location_name || ''}: ${data.percent ? (data.percent * 100).toFixed(0) : 0}%`
                  }}
                >
                  {locationStats.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Disposals Chart */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t.dashboard.disposalsOverview}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={disposalsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                <Tooltip
                  labelFormatter={(label) => formatDate(label)}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="approved_count" fill="#ef4444" name="Approved" />
                <Bar dataKey="pending_count" fill="#f59e0b" name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </div>
  )
}

