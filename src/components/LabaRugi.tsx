import { useState, useEffect } from 'react'
import { getLabaRugiReport, getLabaRugiDaily, type LabaRugiData, type DailyLabaRugi } from '../db/reports'
import { useLanguage } from '../contexts/LanguageContext'
import { ChartBarIcon, CalendarIcon, BanknotesIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline'

export default function LabaRugi() {
  const { t } = useLanguage()

  // Default to current month
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })

  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })

  // State
  const [data, setData] = useState<LabaRugiData | null>(null)
  const [dailyData, setDailyData] = useState<DailyLabaRugi[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const report = await getLabaRugiReport(startDate, endDate)
      const daily = await getLabaRugiDaily(startDate, endDate)
      setData(report)
      setDailyData(daily)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, []) // Fetch on mount

  const formatCurrency = (value: number) => {
    return `Rp ${value.toLocaleString('id-ID')}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t.labaRugi.title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t.labaRugi.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">{t.labaRugi.dateFrom}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <span className="text-slate-400 px-1">-</span>
            <div className="relative flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">{t.labaRugi.dateTo}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="ml-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              <ChartBarIcon className="h-4 w-4" />
              {t.labaRugi.filter}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-slate-500">{t.labaRugi.loading}</div>
          </div>
        ) : !data ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-slate-500">{t.labaRugi.noData}</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                    <BanknotesIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">{t.labaRugi.revenue}</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(data.revenue)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-rose-100 p-3 text-rose-600">
                    <ArrowTrendingDownIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">{t.labaRugi.cogs}</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(data.cogs)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-emerald-100 p-3 text-emerald-600">
                    <ChartBarIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">{t.labaRugi.grossProfit}</p>
                    <p className={`text-2xl font-bold ${data.gross_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(data.gross_profit)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-slate-100 p-3 text-slate-600">
                    <CalendarIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">{t.labaRugi.procurements}</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(data.procurements_total)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Details Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">{t.labaRugi.dailyDetails}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 font-medium">{t.labaRugi.date}</th>
                      <th className="px-6 py-3 font-medium text-right">{t.labaRugi.revenue}</th>
                      <th className="px-6 py-3 font-medium text-right">{t.labaRugi.cogs}</th>
                      <th className="px-6 py-3 font-medium text-right">{t.labaRugi.grossProfit}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dailyData.length > 0 ? (
                      dailyData.map((row) => (
                        <tr key={row.date} className="hover:bg-slate-50/50">
                          <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                            {formatDate(row.date)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right">
                            {formatCurrency(row.revenue)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right">
                            {formatCurrency(row.cogs)}
                          </td>
                          <td className={`whitespace-nowrap px-6 py-4 text-right font-semibold ${row.gross_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatCurrency(row.gross_profit)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                          {t.labaRugi.noData}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
