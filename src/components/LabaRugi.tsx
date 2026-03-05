import { useState, useEffect } from 'react'
import { getLabaRugiReport, getLabaRugiDaily, type LabaRugiData, type DailyLabaRugi } from '../db/reports'
import { useLanguage } from '../contexts/LanguageContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToastContext } from '../contexts/ToastContext'
import {
  ChartBarIcon,
  CalendarIcon,
  BanknotesIcon,
  ArrowTrendingDownIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx-js-style'

export default function LabaRugi() {
  const { t } = useLanguage()
  const { appName } = useSettings()
  const toast = useToastContext()

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
    return `Rp ${value.toLocaleString('id-ID')} `
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const handleExportExcel = () => {
    if (!data) return

    try {
      // Create AoA (Array of Arrays) for the Excel sheet
      const aoaData: any[][] = []

      // Cell Styles
      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "0EA5E9" } }, // Tailwind primary-500
        alignment: { vertical: "center", horizontal: "center" },
        border: {
          top: { style: "thin", color: { auto: 1 } },
          bottom: { style: "thin", color: { auto: 1 } },
          left: { style: "thin", color: { auto: 1 } },
          right: { style: "thin", color: { auto: 1 } }
        }
      }

      const titleStyle = {
        font: { bold: true, sz: 14 }
      }

      const bodyStyle = {
        border: {
          top: { style: "thin", color: { rgb: "E2E8F0" } },
          bottom: { style: "thin", color: { rgb: "E2E8F0" } },
          left: { style: "thin", color: { rgb: "E2E8F0" } },
          right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      }

      const summaryStyle = {
        font: { bold: true },
        border: {
          top: { style: "thin", color: { rgb: "E2E8F0" } },
          bottom: { style: "thin", color: { rgb: "E2E8F0" } },
          left: { style: "thin", color: { rgb: "E2E8F0" } },
          right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      }

      // 0. Header / Store Name
      aoaData.push([{ v: appName, s: { font: { bold: true, sz: 18 } } }])
      aoaData.push([{ v: 'Laporan Laba Rugi', s: { font: { italic: true, sz: 12, color: { rgb: "64748B" } } } }])
      aoaData.push([])

      // 1. Overview Section
      aoaData.push([{ v: 'RINGKASAN KEUANGAN', s: titleStyle }, ''])
      aoaData.push([{ v: 'Pendapatan Penjualan', s: summaryStyle }, { v: `Rp ${data.revenue.toLocaleString('id-ID')}`, s: bodyStyle }])
      aoaData.push([{ v: 'Harga Pokok Penjualan (HPP)', s: summaryStyle }, { v: `Rp ${data.cogs.toLocaleString('id-ID')}`, s: bodyStyle }])
      aoaData.push([{ v: 'Laba Kotor', s: summaryStyle }, { v: `Rp ${data.gross_profit.toLocaleString('id-ID')}`, s: bodyStyle }])
      aoaData.push([{ v: 'Pembelian Stok (Arus Keluar)', s: summaryStyle }, { v: `Rp ${data.procurements_total.toLocaleString('id-ID')}`, s: bodyStyle }])
      aoaData.push([])

      // 2. Daily Details Section
      aoaData.push([{ v: 'DETAIL HARIAN', s: titleStyle }])

      const dailyHeader = ['Tanggal', 'Pendapatan', 'HPP', 'Laba Kotor'].map(text => ({ v: text, s: headerStyle }))
      aoaData.push(dailyHeader)

      dailyData.forEach((row) => {
        aoaData.push([
          { v: formatDate(row.date), s: bodyStyle },
          { v: row.revenue, s: bodyStyle },
          { v: row.cogs, s: bodyStyle },
          { v: row.gross_profit, s: bodyStyle }
        ])
      })

      const ws = XLSX.utils.aoa_to_sheet(aoaData)

      // Set column widths
      ws['!cols'] = [
        { wch: 30 }, // Tanggal / Label
        { wch: 20 }, // Pendapatan / Value
        { wch: 20 }, // HPP
        { wch: 20 }, // Laba Kotor
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'LabaRugi')

      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const filename = `laba_rugi_${dateStr}.xlsx`

      XLSX.writeFile(wb, filename)
      toast.success('Laporan berhasil diekspor ke Excel!')
    } catch (error) {
      console.error('[LabaRugi] Error exporting to Excel:', error)
      toast.error('Gagal mengekspor data ke Excel.')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-slate-50/50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.labaRugi.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.labaRugi.description}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={loading || !data}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Export Excel</span>
          <span className="sm:hidden">Export</span>
        </button>
      </header>

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
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.labaRugi.revenue}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(data.revenue)}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                    <BanknotesIcon className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.labaRugi.cogs}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(data.cogs)}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50">
                    <ArrowTrendingDownIcon className="h-5 w-5 text-rose-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.labaRugi.grossProfit}</p>
                    <p className={`mt - 2 text - 2xl font - semibold ${data.gross_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'} `}>
                      {formatCurrency(data.gross_profit)}
                    </p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                    <ChartBarIcon className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.labaRugi.procurements}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(data.procurements_total)}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50">
                    <CalendarIcon className="h-5 w-5 text-slate-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Search and filter */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-3 md:p-4">
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                  <div className="relative">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      placeholder={t.labaRugi?.dateFrom || 'From Date'}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      placeholder={t.labaRugi?.dateTo || 'To Date'}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
                    />
                  </div>
                  <button
                    onClick={fetchData}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 md:text-sm"
                  >
                    <ChartBarIcon className="h-4 w-4" />
                    {t.labaRugi.filter}
                  </button>
                  {(startDate || endDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStartDate('')
                        setEndDate('')
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 md:text-sm"
                    >
                      {t.auditTrail?.clearDates || 'Clear Dates'}
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Daily Details Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">{t.labaRugi.dailyDetails}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-medium md:px-4">{t.labaRugi.date}</th>
                      <th className="px-3 py-3 font-medium text-right md:px-4">{t.labaRugi.revenue}</th>
                      <th className="px-3 py-3 font-medium text-right md:px-4">{t.labaRugi.cogs}</th>
                      <th className="px-3 py-3 font-medium text-right md:px-4">{t.labaRugi.grossProfit}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {dailyData.length > 0 ? (
                      dailyData.map((row) => (
                        <tr key={row.date} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-3 text-slate-900 md:px-4">
                            {formatDate(row.date)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-slate-600 md:px-4">
                            {formatCurrency(row.revenue)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-slate-600 md:px-4">
                            {formatCurrency(row.cogs)}
                          </td>
                          <td className={`whitespace - nowrap px - 3 py - 3 text - right font - medium md: px - 4 ${row.gross_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'} `}>
                            {formatCurrency(row.gross_profit)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500 md:px-4">
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
