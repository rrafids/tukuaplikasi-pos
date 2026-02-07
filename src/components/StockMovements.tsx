import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'
import { listProducts } from '../db/products'
import type { ProductRow } from '../db/products'
import { listLocations, getProductLocationStocks } from '../db/locations'
import type { LocationRow } from '../db/locations'
import { listStockMovements, transferStock } from '../db/stockMovements'
import type {
  StockMovementWithDetails,
  StockMovementType,
} from '../db/stockMovements'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'

export default function StockMovements() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [movements, setMovements] = useState<StockMovementWithDetails[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProductFilter, setSelectedProductFilter] = useState<number | null>(null)
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<number | null>(null)
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<StockMovementType | 'all'>('all')
  const [dateFromFilter, setDateFromFilter] = useState<string>('')
  const [dateToFilter, setDateToFilter] = useState<string>('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  // Transfer form state
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [transferForm, setTransferForm] = useState({
    product_id: '',
    from_location_id: '',
    to_location_id: '',
    quantity: '',
    notes: '',
  })
  const [availableStock, setAvailableStock] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [movementsData, prods, locs] = await Promise.all([
          listStockMovements(),
          listProducts(),
          listLocations(),
        ])
        setMovements(movementsData)
        setProducts(prods.filter((p) => p.deleted_at === null))
        setLocations(locs.filter((l) => l.deleted_at === null))
      } catch (error) {
        console.error('[StockMovements] Error loading:', error)
        toast.error('Failed to load stock movements data.')
      }
    }
    void load()
  }, [toast])

  const filteredMovements = useMemo(() => {
    let filtered = movements.filter((m) => {
      const matchesSearch =
        searchQuery === '' ||
        m.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.location_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.notes?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesProduct =
        selectedProductFilter === null || m.product_id === selectedProductFilter

      const matchesLocation =
        selectedLocationFilter === null || m.location_id === selectedLocationFilter

      const matchesType =
        selectedTypeFilter === 'all' || m.movement_type === selectedTypeFilter

      // Date range filter
      const movementDate = new Date(m.created_at)
      const matchesDateFrom =
        dateFromFilter === '' ||
        movementDate >= new Date(dateFromFilter + 'T00:00:00')

      const matchesDateTo =
        dateToFilter === '' ||
        movementDate <= new Date(dateToFilter + 'T23:59:59')

      return (
        matchesSearch &&
        matchesProduct &&
        matchesLocation &&
        matchesType &&
        matchesDateFrom &&
        matchesDateTo
      )
    })

    return filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime()
      const dateB = new Date(b.created_at).getTime()
      return dateB - dateA
    })
  }, [
    movements,
    searchQuery,
    selectedProductFilter,
    selectedLocationFilter,
    selectedTypeFilter,
    dateFromFilter,
    dateToFilter,
  ])

  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage)
  const paginatedMovements = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredMovements.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredMovements, currentPage, itemsPerPage])

  const visibleMovements = paginatedMovements

  // Stats
  const totalMovements = movements.length
  const totalIncreases = useMemo(
    () => movements.filter((m) => m.quantity > 0).length,
    [movements],
  )
  const totalDecreases = useMemo(
    () => movements.filter((m) => m.quantity < 0).length,
    [movements],
  )
  const totalQuantityIncrease = useMemo(
    () =>
      movements
        .filter((m) => m.quantity > 0)
        .reduce((sum, m) => sum + m.quantity, 0),
    [movements],
  )
  const totalQuantityDecrease = useMemo(
    () =>
      Math.abs(
        movements
          .filter((m) => m.quantity < 0)
          .reduce((sum, m) => sum + m.quantity, 0),
      ),
    [movements],
  )

  const getMovementTypeBadge = (type: StockMovementType) => {
    const badges = {
      procurement: (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
          Procurement
        </span>
      ),
      sale: (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-800">
          Sale
        </span>
      ),
      disposal: (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800">
          Disposal
        </span>
      ),
      adjustment: (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Adjustment
        </span>
      ),
      transfer: (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">
          Transfer
        </span>
      ),
    }
    return badges[type]
  }

  // Check available stock when product and source location are selected
  useEffect(() => {
    const checkStock = async () => {
      if (
        transferForm.product_id &&
        transferForm.from_location_id &&
        !showTransferForm
      ) {
        return
      }

      if (transferForm.product_id && transferForm.from_location_id) {
        try {
          const stocks = await getProductLocationStocks(
            parseInt(transferForm.product_id, 10),
          )
          const stock = stocks.find(
            (s) => s.location_id === parseInt(transferForm.from_location_id, 10),
          )
          setAvailableStock(stock?.stock ?? 0)
        } catch (error) {
          console.error('[StockMovements] Error checking stock:', error)
          setAvailableStock(null)
        }
      } else {
        setAvailableStock(null)
      }
    }
    void checkStock()
  }, [transferForm.product_id, transferForm.from_location_id, showTransferForm])

  const openTransferForm = () => {
    setTransferForm({
      product_id: '',
      from_location_id: '',
      to_location_id: '',
      quantity: '',
      notes: '',
    })
    setAvailableStock(null)
    setShowTransferForm(true)
  }

  const closeTransferForm = () => {
    setShowTransferForm(false)
    setTransferForm({
      product_id: '',
      from_location_id: '',
      to_location_id: '',
      quantity: '',
      notes: '',
    })
    setAvailableStock(null)
  }

  const handleCloseTransferForm = () => {
    if (confirm(t.common.closeConfirm)) closeTransferForm()
  }

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const quantity = parseFloat(transferForm.quantity || '0')

      if (quantity <= 0) {
        toast.error(t.stockMovements.quantityMustBePositive)
        return
      }

      if (transferForm.from_location_id === transferForm.to_location_id) {
        toast.error(t.stockMovements.locationsMustBeDifferent)
        return
      }

      if (availableStock !== null && quantity > availableStock) {
        toast.error(
          t.stockMovements.insufficientStock.replace(
            '{available}',
            availableStock.toString(),
          ),
        )
        return
      }

      await transferStock({
        product_id: parseInt(transferForm.product_id, 10),
        from_location_id: parseInt(transferForm.from_location_id, 10),
        to_location_id: parseInt(transferForm.to_location_id, 10),
        quantity,
        notes: transferForm.notes.trim() || null,
      })

      // Reload movements
      const updatedMovements = await listStockMovements()
      setMovements(updatedMovements)

      toast.success(t.stockMovements.transferSuccess)
      closeTransferForm()
    } catch (error) {
      console.error('[StockMovements] Error transferring stock:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(
        `${t.stockMovements.transferFailed}: ${errorMessage}`,
      )
    }
  }

  const handleExportExcel = () => {
    try {
      const exportData = filteredMovements.map((m) => {
        return {
          'ID': m.id,
          'Date': new Date(m.created_at).toLocaleDateString('id-ID'),
          'Time': new Date(m.created_at).toLocaleTimeString('id-ID'),
          'Product': m.product_name,
          'Location': m.location_name,
          'Location Type': m.location_type,
          'Movement Type': m.movement_type.charAt(0).toUpperCase() + m.movement_type.slice(1),
          'Quantity': m.quantity > 0 ? `+${m.quantity}` : m.quantity.toString(),
          'Reference ID': m.reference_id || '-',
          'Reference Type': m.reference_type || '-',
          'Notes': m.notes || '-',
          'Created At': new Date(m.created_at).toLocaleString('id-ID'),
        }
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Movements')

      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const filename = `stock_movements_${dateStr}.xlsx`

      XLSX.writeFile(wb, filename)

      toast.success(`Exported ${exportData.length} stock movements to ${filename}`)
    } catch (error) {
      console.error('[StockMovements] Error exporting to Excel:', error)
      toast.error('Failed to export stock movements to Excel.')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.stockMovements.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.stockMovements.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 md:px-4 md:py-2 md:text-sm"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span className="hidden md:inline">Export Excel</span>
            <span className="md:hidden">Export</span>
          </button>
          <button
            type="button"
            onClick={openTransferForm}
            className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t.stockMovements.transferStock}</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        {/* Stats */}
        <section className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Movements
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalMovements}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <ArrowTrendingUpIcon className="h-5 w-5 text-primary-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Increases
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalIncreases}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {totalQuantityIncrease.toLocaleString('id-ID')} units
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                <ArrowTrendingUpIcon className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Decreases
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalDecreases}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {totalQuantityDecrease.toLocaleString('id-ID')} units
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50">
                <ArrowTrendingDownIcon className="h-5 w-5 text-rose-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Net Change
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalQuantityIncrease - totalQuantityDecrease >= 0 ? '+' : ''}
                  {(totalQuantityIncrease - totalQuantityDecrease).toLocaleString('id-ID')}
                </p>
                <p className="mt-1 text-xs text-slate-500">units</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50">
                <ArrowTrendingUpIcon className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </div>
        </section>

        {/* Stock movements table card */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Search and filter */}
          <div className="border-b border-slate-200 p-3 md:p-4">
            <div className="flex flex-col gap-3">
              {/* Search bar */}
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product, location, or notes..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              {/* Filters */}
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
                <div className="relative">
                  <select
                    value={selectedProductFilter ?? ''}
                    onChange={(e) => {
                      setSelectedProductFilter(
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                      setCurrentPage(1)
                    }}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
                  >
                    <option value="">All Products</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <div className="relative">
                  <select
                    value={selectedLocationFilter ?? ''}
                    onChange={(e) => {
                      setSelectedLocationFilter(
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                      setCurrentPage(1)
                    }}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
                  >
                    <option value="">All Locations</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <div className="relative">
                  <select
                    value={selectedTypeFilter}
                    onChange={(e) => {
                      setSelectedTypeFilter(
                        e.target.value as StockMovementType | 'all',
                      )
                      setCurrentPage(1)
                    }}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
                  >
                    <option value="all">All Types</option>
                    <option value="procurement">Procurement</option>
                    <option value="sale">Sale</option>
                    <option value="disposal">Disposal</option>
                    <option value="adjustment">Adjustment</option>
                    <option value="transfer">Transfer</option>
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <div className="relative">
                  <input
                    type="date"
                    value={dateFromFilter}
                    onChange={(e) => {
                      setDateFromFilter(e.target.value)
                      setCurrentPage(1)
                    }}
                    placeholder="From Date"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
                  />
                </div>
                <div className="relative">
                  <input
                    type="date"
                    value={dateToFilter}
                    onChange={(e) => {
                      setDateToFilter(e.target.value)
                      setCurrentPage(1)
                    }}
                    placeholder="To Date"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
                  />
                </div>
              </div>
              {(dateFromFilter || dateToFilter) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDateFromFilter('')
                      setDateToFilter('')
                      setCurrentPage(1)
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Clear Dates
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 md:px-4 md:py-3">Date & Time</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Product</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Location</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Type</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Quantity</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Reference</th>
                  <th className="hidden px-3 py-2 md:table-cell md:px-4 md:py-3">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleMovements.map((movement) => {
                  const isIncrease = movement.quantity > 0
                  return (
                    <tr key={movement.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>
                            {new Date(movement.created_at).toLocaleDateString('id-ID', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(movement.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-slate-900 md:px-4 md:py-3 md:text-sm">
                        {movement.product_name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>{movement.location_name}</span>
                          <span className="text-[10px] text-slate-500">
                            {movement.location_type}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 md:px-4 md:py-3">
                        {getMovementTypeBadge(movement.movement_type)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold md:px-4 md:py-3 md:text-sm">
                        <span
                          className={
                            isIncrease
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }
                        >
                          {isIncrease ? '+' : ''}
                          {movement.quantity.toLocaleString('id-ID')}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        {movement.reference_id ? (
                          <span>
                            {movement.reference_type} #{movement.reference_id}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="hidden max-w-xs truncate px-3 py-2 text-xs text-slate-500 md:table-cell md:px-4 md:py-3 md:text-sm">
                        {movement.notes || '-'}
                      </td>
                    </tr>
                  )
                })}

                {visibleMovements.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-xs text-slate-500"
                    >
                      {searchQuery ||
                      selectedProductFilter !== null ||
                      selectedLocationFilter !== null ||
                      selectedTypeFilter !== 'all' ||
                      dateFromFilter ||
                      dateToFilter
                        ? 'No stock movements match your search or filter criteria.'
                        : 'No stock movements found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredMovements.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">
                    Showing{' '}
                    <span className="font-medium text-slate-900">
                      {(currentPage - 1) * itemsPerPage + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-medium text-slate-900">
                      {Math.min(currentPage * itemsPerPage, filteredMovements.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {filteredMovements.length}
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
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
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
                    type="button"
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
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`rounded px-3 py-1 text-xs font-medium ${
                            currentPage === pageNum
                              ? 'bg-primary-600 text-white'
                              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Transfer Stock Form */}
      {showTransferForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-end bg-black/20">
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {t.stockMovements.transferStock}
              </h2>
              <button
                type="button"
                onClick={handleCloseTransferForm}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleTransferSubmit}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.stockMovements.product} <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={transferForm.product_id}
                      onChange={(e) => {
                        setTransferForm({
                          ...transferForm,
                          product_id: e.target.value,
                        })
                      }}
                      className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">{t.stockMovements.selectProduct}</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.stockMovements.fromLocation} <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={transferForm.from_location_id}
                      onChange={(e) => {
                        setTransferForm({
                          ...transferForm,
                          from_location_id: e.target.value,
                          to_location_id:
                            e.target.value === transferForm.to_location_id
                              ? ''
                              : transferForm.to_location_id,
                        })
                      }}
                      className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">{t.stockMovements.selectFromLocation}</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} ({location.type})
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  {availableStock !== null && (
                    <p className="text-[10px] text-slate-500">
                      {t.stockMovements.availableStock}:{' '}
                      <span className="font-medium">{availableStock.toLocaleString('id-ID')}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.stockMovements.toLocation} <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={transferForm.to_location_id}
                      onChange={(e) => {
                        setTransferForm({
                          ...transferForm,
                          to_location_id: e.target.value,
                        })
                      }}
                      className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">{t.stockMovements.selectToLocation}</option>
                      {locations
                        .filter(
                          (location) =>
                            location.id !== parseInt(transferForm.from_location_id, 10),
                        )
                        .map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name} ({location.type})
                          </option>
                        ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.stockMovements.quantity} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    value={transferForm.quantity}
                    onChange={(e) => {
                      setTransferForm({
                        ...transferForm,
                        quantity: e.target.value,
                      })
                    }}
                    placeholder="0"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                  {availableStock !== null && (
                    <p className="text-[10px] text-slate-500">
                      {t.stockMovements.maxQuantity}:{' '}
                      <span className="font-medium">{availableStock.toLocaleString('id-ID')}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.stockMovements.notes} ({t.common.optional})
                  </label>
                  <textarea
                    value={transferForm.notes}
                    onChange={(e) => {
                      setTransferForm({
                        ...transferForm,
                        notes: e.target.value,
                      })
                    }}
                    placeholder={t.stockMovements.notesPlaceholder}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCloseTransferForm}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                  >
                    {t.stockMovements.transfer}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

