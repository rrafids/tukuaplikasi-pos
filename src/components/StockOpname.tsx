import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ChevronDownIcon,
  DocumentArrowDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'
import { listLocations } from '../db/locations'
import type { LocationRow } from '../db/locations'
import {
  completeStockOpname,
  createStockOpname,
  getProductsForOpnameTemplate,
  listStockOpnames,
  restoreStockOpname,
  softDeleteStockOpname,
  updateStockOpname,
} from '../db/stockOpname'
import type { StockOpnameWithItems, StockOpnameStatus } from '../db/stockOpname'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'

type StockOpnameFormState = {
  location_id: string
  opname_date: string
  notes: string
}

export default function StockOpname() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [opnames, setOpnames] = useState<StockOpnameWithItems[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [form, setForm] = useState<StockOpnameFormState>({
    location_id: '',
    opname_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [opnameItems, setOpnameItems] = useState<
    Array<{
      product_id: number
      product_name: string
      product_barcode: string | null
      system_stock: number
      actual_stock: number
      notes: string
    }>
  >([])

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<number | null>(null)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<StockOpnameStatus | 'all'>('all')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [opnamesList, locationsList] = await Promise.all([
          listStockOpnames(),
          listLocations(),
        ])
        setOpnames(opnamesList)
        setLocations(locationsList.filter((l) => l.deleted_at === null))
      } catch (error) {
        console.error('[StockOpname] Error loading data:', error)
        toast.error('Failed to load stock opname data')
      }
    }
    loadData()
  }, [toast])

  const filteredOpnames = useMemo(() => {
    let filtered = opnames.filter((o) => (showDeleted ? true : o.deleted_at === null))

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (o) =>
          o.location_name.toLowerCase().includes(query) ||
          o.id.toString().includes(query) ||
          o.opname_date.includes(query),
      )
    }

    // Apply location filter
    if (selectedLocationFilter !== null) {
      filtered = filtered.filter((o) => o.location_id === selectedLocationFilter)
    }

    // Apply status filter
    if (selectedStatusFilter !== 'all') {
      filtered = filtered.filter((o) => o.status === selectedStatusFilter)
    }

    return filtered
  }, [opnames, searchQuery, selectedLocationFilter, selectedStatusFilter, showDeleted])

  const visibleOpnames = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredOpnames.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredOpnames, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredOpnames.length / itemsPerPage)

  const activeCount = useMemo(
    () => opnames.filter((o) => o.deleted_at === null).length,
    [opnames],
  )

  const draftCount = useMemo(
    () => opnames.filter((o) => o.deleted_at === null && o.status === 'draft').length,
    [opnames],
  )

  const completedCount = useMemo(
    () => opnames.filter((o) => o.deleted_at === null && o.status === 'completed').length,
    [opnames],
  )

  const openCreate = async () => {
    setEditingId(null)
    setForm({
      location_id: '',
      opname_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setOpnameItems([])
    setShowForm(true)
  }

  const openEdit = async (opname: StockOpnameWithItems) => {
    setEditingId(opname.id)
    setForm({
      location_id: opname.location_id.toString(),
      opname_date: opname.opname_date.split('T')[0],
      notes: opname.notes || '',
    })
    setOpnameItems(
      opname.items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        product_barcode: item.product_barcode,
        system_stock: item.system_stock,
        actual_stock: item.actual_stock,
        notes: item.notes || '',
      })),
    )
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({
      location_id: '',
      opname_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setOpnameItems([])
  }

  const handleDownloadTemplate = async () => {
    try {
      if (!form.location_id) {
        toast.error('Please select a location first')
        return
      }

      const locationId = parseInt(form.location_id, 10)
      const products = await getProductsForOpnameTemplate(locationId)

      // Prepare template data
      const templateData = products.map((p) => ({
        'Product ID': p.product_id,
        'Product Name': p.product_name,
        'Barcode': p.product_barcode || '',
        'System Stock': p.current_stock,
        'Actual Stock': '', // Empty for user to fill
        'Notes': '', // Empty for user to fill
      }))

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(templateData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Opname Template')

      // Generate filename
      const location = locations.find((l) => l.id === locationId)
      const locationName = location?.name.replace(/[^a-z0-9]/gi, '_') || 'location'
      const filename = `stock_opname_template_${locationName}_${new Date().toISOString().split('T')[0]}.xlsx`

      // Write file
      XLSX.writeFile(wb, filename)

      toast.success(`Template downloaded: ${filename}`)
    } catch (error) {
      console.error('[StockOpname] Error downloading template:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to download template: ${errorMessage}`)
    }
  }

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0]
      if (!file) return

      if (!form.location_id) {
        toast.error('Please select a location first')
        event.target.value = ''
        return
      }

      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const data = e.target?.result
          if (!data) return

          const workbook = XLSX.read(data, { type: 'binary' })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{
            'Product ID': number
            'Product Name'?: string
            'Barcode'?: string
            'System Stock': number
            'Actual Stock': number | string
            'Notes'?: string
          }>

          // Validate and convert data
          const items = jsonData
            .map((row) => {
              const productId = row['Product ID']
              const actualStock = typeof row['Actual Stock'] === 'string' 
                ? parseFloat(row['Actual Stock']) || 0 
                : row['Actual Stock'] || 0
              const systemStock = row['System Stock'] || 0

              if (!productId || isNaN(actualStock)) {
                return null
              }

              return {
                product_id: productId,
                product_name: row['Product Name'] || 'Unknown',
                product_barcode: row['Barcode'] || null,
                system_stock: systemStock,
                actual_stock: actualStock,
                notes: row['Notes'] || '',
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)

          if (items.length === 0) {
            toast.error('No valid data found in Excel file')
            return
          }

          setOpnameItems(items)
          toast.success(`Imported ${items.length} items from Excel`)
        } catch (error) {
          console.error('[StockOpname] Error parsing Excel:', error)
          toast.error('Failed to parse Excel file. Please check the format.')
        }
      }

      reader.readAsBinaryString(file)
      event.target.value = '' // Reset input
    } catch (error) {
      console.error('[StockOpname] Error importing Excel:', error)
      toast.error('Failed to import Excel file')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!form.location_id) {
        toast.error('Please select a location')
        return
      }

      if (opnameItems.length === 0) {
        toast.error('Please add items to the stock opname')
        return
      }

      // Validate items
      const invalidItems = opnameItems.filter(
        (item) => !item.product_id || isNaN(item.actual_stock) || isNaN(item.system_stock)
      )
      if (invalidItems.length > 0) {
        toast.error('Some items have invalid data. Please check all items.')
        return
      }

      if (editingId == null) {
        await createStockOpname({
          location_id: parseInt(form.location_id, 10),
          opname_date: form.opname_date,
          notes: form.notes.trim() || null,
          items: opnameItems.map((item) => ({
            product_id: item.product_id,
            system_stock: Number(item.system_stock) || 0,
            actual_stock: Number(item.actual_stock) || 0,
            notes: item.notes?.trim() || null,
          })),
        })
        const updatedList = await listStockOpnames()
        setOpnames(updatedList)
        toast.success(t.stockOpname.created)
      } else {
        const updated = await updateStockOpname(editingId, {
          location_id: parseInt(form.location_id, 10),
          opname_date: form.opname_date,
          notes: form.notes.trim() || null,
          items: opnameItems.map((item) => ({
            product_id: item.product_id,
            system_stock: Number(item.system_stock) || 0,
            actual_stock: Number(item.actual_stock) || 0,
            notes: item.notes?.trim() || null,
          })),
        })
        if (updated) {
          const updatedList = await listStockOpnames()
          setOpnames(updatedList)
          toast.success(t.stockOpname.updated)
        }
      }
      closeForm()
    } catch (error) {
      console.error('[StockOpname] Error saving stock opname:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save stock opname: ${errorMessage}`)
    }
  }

  const handleComplete = async (id: number) => {
    try {
      await completeStockOpname(id)
      const updatedList = await listStockOpnames()
      setOpnames(updatedList)
      toast.success(t.stockOpname.completed)
    } catch (error) {
      console.error('[StockOpname] Error completing stock opname:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to complete stock opname: ${errorMessage}`)
    }
  }

  const handleSoftDelete = async (opname: StockOpnameWithItems) => {
    if (opname.deleted_at) return
    try {
      await softDeleteStockOpname(opname.id)
      const updatedList = await listStockOpnames()
      setOpnames(updatedList)
      toast.success(t.stockOpname.deleted)
    } catch (error) {
      console.error('[StockOpname] Error deleting stock opname:', error)
      toast.error('Failed to delete stock opname')
    }
  }

  const handleRestore = async (opname: StockOpnameWithItems) => {
    if (!opname.deleted_at) return
    try {
      await restoreStockOpname(opname.id)
      const updatedList = await listStockOpnames()
      setOpnames(updatedList)
      toast.success(t.stockOpname.restored)
    } catch (error) {
      console.error('[StockOpname] Error restoring stock opname:', error)
      toast.error('Failed to restore stock opname')
    }
  }

  const getStatusBadge = (status: StockOpnameStatus) => {
    const badges = {
      draft: (
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
          Draft
        </span>
      ),
      completed: (
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
          Completed
        </span>
      ),
      cancelled: (
        <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
          Cancelled
        </span>
      ),
    }
    return badges[status]
  }

  const handleExportExcel = () => {
    try {
      const exportData: Array<Record<string, unknown>> = []

      filteredOpnames.forEach((opname) => {
        if (opname.items.length === 0) {
          exportData.push({
            'Opname ID': opname.id,
            'Date': new Date(opname.opname_date).toLocaleString('id-ID', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            'Location': opname.location_name,
            'Status': opname.status.charAt(0).toUpperCase() + opname.status.slice(1),
            'Product': '-',
            'System Stock': '-',
            'Actual Stock': '-',
            'Difference': '-',
            'Notes': opname.notes || '-',
          })
        } else {
          opname.items.forEach((item, index) => {
            exportData.push({
              'Opname ID': index === 0 ? opname.id : '',
              'Date': index === 0 ? new Date(opname.opname_date).toLocaleString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }) : '',
              'Location': index === 0 ? opname.location_name : '',
              'Status': index === 0 ? opname.status.charAt(0).toUpperCase() + opname.status.slice(1) : '',
              'Product': item.product_name,
              'System Stock': item.system_stock,
              'Actual Stock': item.actual_stock,
              'Difference': item.difference > 0 ? `+${item.difference}` : item.difference.toString(),
              'Notes': index === 0 ? (opname.notes || '-') : (item.notes || '-'),
            })
          })
        }
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Opname')

      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const filename = `stock_opname_${dateStr}.xlsx`

      XLSX.writeFile(wb, filename)

      toast.success(`Exported ${filteredOpnames.length} stock opnames to ${filename}`)
    } catch (error) {
      console.error('[StockOpname] Error exporting to Excel:', error)
      toast.error('Failed to export stock opname to Excel.')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.nav.stockOpname}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.stockOpname.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 md:px-4 md:py-2 md:text-sm"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span>Export</span>
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 md:px-4 md:py-2 md:text-sm"
            >
              <PlusIcon className="h-4 w-4" />
            <span>{t.stockOpname.addOpname}</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        {/* Top stats */}
        <section className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Opnames
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {activeCount}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Draft
                </p>
                <p className="mt-2 text-2xl font-semibold text-yellow-600">
                  {draftCount}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Completed
                </p>
                <p className="mt-2 text-2xl font-semibold text-emerald-600">
                  {completedCount}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by location, date, ID..."
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="relative">
              <select
                value={selectedLocationFilter ?? ''}
                onChange={(e) =>
                  setSelectedLocationFilter(
                    e.target.value ? parseInt(e.target.value, 10) : null,
                  )
                }
                className="appearance-none rounded-md border border-slate-300 bg-white px-3 py-1.5 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="relative">
              <select
                value={selectedStatusFilter}
                onChange={(e) =>
                  setSelectedStatusFilter(e.target.value as StockOpnameStatus | 'all')
                }
                className="appearance-none rounded-md border border-slate-300 bg-white px-3 py-1.5 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Show deleted</span>
            </label>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 md:px-4 md:py-3">ID</th>
                <th className="px-3 py-2 md:px-4 md:py-3">Date & Time</th>
                <th className="px-3 py-2 md:px-4 md:py-3">Location</th>
                <th className="px-3 py-2 md:px-4 md:py-3">Items</th>
                <th className="px-3 py-2 md:px-4 md:py-3">Status</th>
                <th className="px-3 py-2 text-right md:px-4 md:py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleOpnames.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                    {t.common.noData}
                  </td>
                </tr>
              ) : (
                visibleOpnames.map((opname) => {
                  const isDeleted = opname.deleted_at !== null
                  return (
                    <tr
                      key={opname.id}
                      className={
                        isDeleted
                          ? 'bg-rose-50/40 text-slate-400'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        #{opname.id}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>
                            {new Date(opname.opname_date).toLocaleDateString('id-ID', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(opname.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className={isDeleted ? 'line-through' : ''}>
                          {opname.location_name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {opname.location_type}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        {opname.items.length} items
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 md:px-4 md:py-3">
                        {getStatusBadge(opname.status)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs md:px-4 md:py-3 md:text-sm">
                        <div className="inline-flex items-center gap-1">
                          {!isDeleted && opname.status === 'draft' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleComplete(opname.id)}
                                className="rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                                title="Complete and adjust stock"
                              >
                                Complete
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(opname)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSoftDelete(opname)}
                                className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {isDeleted && (
                            <button
                              type="button"
                              onClick={() => handleRestore(opname)}
                              className="rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredOpnames.length > 0 && (
          <div className="mt-4 border-t border-slate-200 px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-500">
                  Showing{' '}
                  <span className="font-medium text-slate-900">
                    {(currentPage - 1) * itemsPerPage + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium text-slate-900">
                    {Math.min(currentPage * itemsPerPage, filteredOpnames.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium text-slate-900">
                    {filteredOpnames.length}
                  </span>{' '}
                  results
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Items per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`rounded px-3 py-1 text-xs font-medium ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? t.stockOpname.editOpname : t.stockOpname.addOpname}
              </h2>
              <button
                onClick={closeForm}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Location <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={form.location_id}
                      onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                      className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Select location</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.type})
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Opname Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={form.opname_date}
                    onChange={(e) => setForm({ ...form, opname_date: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Optional notes..."
                />
              </div>

              {/* Excel Import/Export Section */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Items</h3>
                  <div className="flex gap-2">
                    {form.location_id && (
                      <>
                        <button
                          type="button"
                          onClick={handleDownloadTemplate}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          <DocumentArrowDownIcon className="h-4 w-4" />
                          Download Template
                        </button>
                        <label className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer">
                          <ArrowUpTrayIcon className="h-4 w-4" />
                          <span>Import Excel</span>
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleImportExcel}
                            className="hidden"
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>

                {opnameItems.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-4">
                    {form.location_id
                      ? 'Download template, fill in actual stock, then import the Excel file'
                      : 'Select a location first to download template'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Product</th>
                          <th className="px-2 py-1.5 text-right">System Stock</th>
                          <th className="px-2 py-1.5 text-right">Actual Stock</th>
                          <th className="px-2 py-1.5 text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {opnameItems.map((item, index) => {
                          const difference = item.actual_stock - item.system_stock
                          return (
                            <tr key={index} className="bg-white">
                              <td className="px-2 py-1.5">
                                <div className="font-medium">{item.product_name}</div>
                                {item.product_barcode && (
                                  <div className="text-[10px] text-slate-500">
                                    {item.product_barcode}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {item.system_stock}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <input
                                  type="number"
                                  value={item.actual_stock}
                                  onChange={(e) => {
                                    const newItems = [...opnameItems]
                                    newItems[index].actual_stock = parseFloat(e.target.value) || 0
                                    setOpnameItems(newItems)
                                  }}
                                  className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs"
                                />
                              </td>
                              <td
                                className={`px-2 py-1.5 text-right font-medium ${
                                  difference > 0
                                    ? 'text-emerald-600'
                                    : difference < 0
                                    ? 'text-rose-600'
                                    : 'text-slate-600'
                                }`}
                              >
                                {difference > 0 ? '+' : ''}
                                {difference}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                >
                  {editingId ? t.common.save : t.common.add} {t.stockOpname.title}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

