import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShoppingCartIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'
import { listProducts } from '../db/products'
import type { ProductRow } from '../db/products'
import { listLocations } from '../db/locations'
import type { LocationRow } from '../db/locations'
import { listUOMs } from '../db/uoms'
import type { UOMRow } from '../db/uoms'
import { getUOMConversion } from '../db/uoms'
import {
  approveProcurement,
  createProcurement,
  listProcurements,
  rejectProcurement,
  restoreProcurement,
  softDeleteProcurement,
  updateProcurement,
} from '../db/procurements'
import type { ProcurementRow, ProcurementStatus } from '../db/procurements'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import SearchableSelect from './SearchableSelect'

type Procurement = ProcurementRow & {
  product_name: string
  location_name: string
  location_type: string
}

type ProcurementFormState = {
  product_id: string
  location_id: string
  quantity: string
  unit_price: string
  supplier: string
  pic: string
  notes: string
  uom_id: string
  product_uom_id: number | null
  converted_quantity: number | null
}

export default function Procurements() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [procurements, setProcurements] = useState<Procurement[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [uoms, setUOMs] = useState<UOMRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'approval' | 'completed'>('all')
  const [form, setForm] = useState<ProcurementFormState>({
    product_id: '',
    location_id: '',
    quantity: '',
    unit_price: '',
    supplier: '',
    pic: '',
    notes: '',
    uom_id: '',
    product_uom_id: null,
    converted_quantity: null,
  })

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProductFilter, setSelectedProductFilter] = useState<number | null>(null)
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<number | null>(null)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<ProcurementStatus | 'all'>('all')
  const [dateFromFilter, setDateFromFilter] = useState<string>('')
  const [dateToFilter, setDateToFilter] = useState<string>('')

  // Lock status filter based on active tab
  const isStatusFilterLocked = activeTab === 'approval' || activeTab === 'completed'
  const lockedStatusFilter: ProcurementStatus | 'all' = activeTab === 'approval' ? 'pending' : activeTab === 'completed' ? 'approved' : 'all'

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const filteredProcurements = useMemo(() => {
    let filtered = procurements.filter((p) => {
      if (showDeleted && p.deleted_at === null) return false
      if (!showDeleted && p.deleted_at !== null) return false

      // Filter by active tab
      if (activeTab === 'all') {
        // Show all statuses - no filter
      } else if (activeTab === 'approval') {
        if (p.status !== 'pending') return false
      } else if (activeTab === 'completed') {
        if (p.status !== 'approved') return false
      }

      const matchesSearch =
        searchQuery === '' ||
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.notes?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesProduct =
        selectedProductFilter === null || p.product_id === selectedProductFilter

      const matchesLocation =
        selectedLocationFilter === null || p.location_id === selectedLocationFilter

      // Status filter: use locked status if tab is locked, otherwise use selected filter
      const effectiveStatusFilter = isStatusFilterLocked ? lockedStatusFilter : selectedStatusFilter
      const matchesStatus =
        effectiveStatusFilter === 'all' || p.status === effectiveStatusFilter

      // Date range filter
      const procurementDate = new Date(p.created_at)
      const matchesDateFrom =
        dateFromFilter === '' ||
        procurementDate >= new Date(dateFromFilter + 'T00:00:00')

      const matchesDateTo =
        dateToFilter === '' ||
        procurementDate <= new Date(dateToFilter + 'T23:59:59')

      return (
        matchesSearch &&
        matchesProduct &&
        matchesLocation &&
        matchesStatus &&
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
    procurements,
    searchQuery,
    selectedProductFilter,
    selectedLocationFilter,
    selectedStatusFilter,
    dateFromFilter,
    dateToFilter,
    showDeleted,
    activeTab,
  ])

  const totalPages = Math.ceil(filteredProcurements.length / itemsPerPage)
  const paginatedProcurements = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredProcurements.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredProcurements, currentPage, itemsPerPage])

  const visibleProcurements = paginatedProcurements

  const editingProcurement =
    editingId != null
      ? procurements.find((p) => p.id === editingId) ?? null
      : null

  useEffect(() => {
    const load = async () => {
      try {
        const [procs, prods, locs, uomsList] = await Promise.all([
          listProcurements(),
          listProducts(),
          listLocations(),
          listUOMs(),
        ])
        setProcurements(procs)
        setProducts(prods.filter((p) => p.deleted_at === null))
        setLocations(locs.filter((l) => l.deleted_at === null))
        setUOMs(uomsList)
      } catch (error) {
        console.error('[Procurements] Error loading:', error)
      }
    }
    void load()
  }, [])

  const resetForm = () =>
    setForm({
      product_id: '',
      location_id: '',
      quantity: '',
      unit_price: '',
      supplier: '',
      pic: '',
      notes: '',
      uom_id: '',
      product_uom_id: null,
      converted_quantity: null,
    })

  const openCreate = () => {
    setEditingId(null)
    resetForm()
    setShowForm(true)
  }

  const openEdit = (procurement: Procurement) => {
    setEditingId(procurement.id)
    const product = products.find((p) => p.id === procurement.product_id)
    setForm({
      product_id: procurement.product_id.toString(),
      location_id: procurement.location_id.toString(),
      quantity: procurement.quantity.toString(),
      unit_price: procurement.unit_price?.toString() ?? '',
      supplier: procurement.supplier ?? '',
      pic: procurement.pic ?? '',
      notes: procurement.notes ?? '',
      uom_id: procurement.uom_id?.toString() ?? '',
      product_uom_id: product?.uom_id ?? null,
      converted_quantity: null,
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const quantity = parseFloat(form.quantity || '0')
      const unitPrice = form.unit_price ? parseFloat(form.unit_price) : null

      if (quantity <= 0) {
        toast.error('Quantity must be greater than 0')
        return
      }

      if (editingId == null) {
        await createProcurement({
          product_id: parseInt(form.product_id, 10),
          location_id: parseInt(form.location_id, 10),
          quantity,
          unit_price: unitPrice,
          supplier: form.supplier.trim() || null,
          pic: form.pic.trim() || null,
          notes: form.notes.trim() || null,
          uom_id: form.uom_id ? parseInt(form.uom_id, 10) : null,
        })
        // Reload procurements to get updated data with joins
        const updatedList = await listProcurements()
        setProcurements(updatedList)
        toast.success(t.procurements.created)
      } else {
        const updated = await updateProcurement(editingId, {
          product_id: parseInt(form.product_id, 10),
          location_id: parseInt(form.location_id, 10),
          quantity,
          unit_price: unitPrice,
          supplier: form.supplier.trim() || null,
          pic: form.pic.trim() || null,
          notes: form.notes.trim() || null,
          uom_id: form.uom_id ? parseInt(form.uom_id, 10) : null,
        })
        if (updated) {
          // Reload procurements to get updated data with joins
          const updatedList = await listProcurements()
          setProcurements(updatedList)
          toast.success(t.procurements.updated)
        } else {
          toast.error(t.procurements.updated.replace('successfully', 'failed').replace('berhasil', 'gagal'))
        }
      }

      closeForm()
    } catch (error) {
      console.error('[Procurements] Error saving procurement:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save procurement: ${errorMessage}`)
    }
  }

  const handleDelete = async (procurement: Procurement) => {
    if (procurement.deleted_at) return
    try {
      const updated = await softDeleteProcurement(procurement.id)
      if (updated) {
        // Reload procurements to get updated data
        const updatedList = await listProcurements()
        setProcurements(updatedList)
        toast.success(t.procurements.deleted)
      } else {
        toast.error('Failed to delete procurement')
      }
    } catch (error) {
      console.error('[Procurements] Error deleting procurement:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete procurement: ${errorMessage}`)
    }
  }

  const handleRestore = async (procurement: Procurement) => {
    if (!procurement.deleted_at) return
    try {
      const updated = await restoreProcurement(procurement.id)
      if (updated) {
        // Reload procurements to get updated data
        const updatedList = await listProcurements()
        setProcurements(updatedList)
        toast.success(t.procurements.restored)
      } else {
        toast.error('Failed to restore procurement')
      }
    } catch (error) {
      console.error('[Procurements] Error restoring procurement:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to restore procurement: ${errorMessage}`)
    }
  }

  const handleApprove = async (procurement: Procurement) => {
    if (procurement.status !== 'pending') return
    try {
      const updated = await approveProcurement(procurement.id)
      if (updated) {
        // Reload procurements to get updated data
        const updatedList = await listProcurements()
        setProcurements(updatedList)
        toast.success(t.procurements.approved)
      } else {
        toast.error('Failed to approve procurement')
      }
    } catch (error) {
      console.error('[Procurements] Error approving procurement:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to approve procurement: ${errorMessage}`)
    }
  }

  const handleReject = async (procurement: Procurement) => {
    if (procurement.status !== 'pending') return
    try {
      const updated = await rejectProcurement(procurement.id)
      if (updated) {
        // Reload procurements to get updated data
        const updatedList = await listProcurements()
        setProcurements(updatedList)
        toast.success(t.procurements.rejected)
      } else {
        toast.error('Failed to reject procurement')
      }
    } catch (error) {
      console.error('[Procurements] Error rejecting procurement:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to reject procurement: ${errorMessage}`)
    }
  }


  // Stats for all procurements (not filtered by tab)
  const allProcurements = useMemo(
    () => procurements.filter((p) => p.deleted_at === null),
    [procurements],
  )

  const pendingCount = useMemo(
    () => allProcurements.filter((p) => p.status === 'pending').length,
    [allProcurements],
  )

  const completedCount = useMemo(
    () => allProcurements.filter((p) => p.status === 'approved').length,
    [allProcurements],
  )

  const pendingQuantity = useMemo(
    () =>
      allProcurements
        .filter((p) => p.status === 'pending')
        .reduce((sum, p) => sum + p.quantity, 0),
    [allProcurements],
  )

  const completedQuantity = useMemo(
    () =>
      allProcurements
        .filter((p) => p.status === 'approved')
        .reduce((sum, p) => sum + p.quantity, 0),
    [allProcurements],
  )

  const pendingValue = useMemo(
    () =>
      allProcurements
        .filter((p) => p.status === 'pending')
        .reduce((sum, p) => {
          const price = p.unit_price ?? 0
          return sum + p.quantity * price
        }, 0),
    [allProcurements],
  )

  const completedValue = useMemo(
    () =>
      allProcurements
        .filter((p) => p.status === 'approved')
        .reduce((sum, p) => {
          const price = p.unit_price ?? 0
          return sum + p.quantity * price
        }, 0),
    [allProcurements],
  )

  const getStatusBadge = (status: ProcurementStatus) => {
    const badges = {
      pending: (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Pending
        </span>
      ),
      approved: (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
          <CheckCircleIcon className="h-3 w-3" />
          Approved
        </span>
      ),
      rejected: (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800">
          <XCircleIcon className="h-3 w-3" />
          Rejected
        </span>
      ),
    }
    return badges[status]
  }

  const handleExportExcel = () => {
    try {
      // Prepare data for export
      const exportData = filteredProcurements.map((p) => {
        const total = (p.unit_price ?? 0) * p.quantity
        return {
          'ID': p.id,
          'Date': new Date(p.created_at).toLocaleDateString('id-ID'),
          'Product': p.product_name,
          'Location': p.location_name,
          'Location Type': p.location_type,
          'Quantity': p.quantity,
          'Unit Price': p.unit_price ? `Rp ${p.unit_price.toLocaleString('id-ID')}` : '-',
          'Total': p.unit_price ? `Rp ${total.toLocaleString('id-ID')}` : '-',
          'Supplier': p.supplier || '-',
          'Status': p.status.charAt(0).toUpperCase() + p.status.slice(1),
          'Notes': p.notes || '-',
          'Created At': new Date(p.created_at).toLocaleString('id-ID'),
          'Updated At': new Date(p.updated_at).toLocaleString('id-ID'),
        }
      })

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Procurements')

      // Generate filename with current date
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const filename = `procurements_${dateStr}.xlsx`

      // Write file
      XLSX.writeFile(wb, filename)

      toast.success(`Exported ${exportData.length} procurements to ${filename}`)
    } catch (error) {
      console.error('[Procurements] Error exporting to Excel:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to export: ${errorMessage}`)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.procurements.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.procurements.description}
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
            onClick={() => setShowDeleted(!showDeleted)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium md:px-4 md:py-2 md:text-sm ${showDeleted
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
          >
            {showDeleted ? t.common.showActive : t.common.showDeleted}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t.procurements.addProcurement}</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        {/* Tabs */}
        <section className="mb-4 border-b border-slate-200">
          <nav className="-mb-px flex space-x-4">
            <button
              type="button"
              onClick={() => {
                setActiveTab('all')
                setCurrentPage(1)
              }}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${activeTab === 'all'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('approval')
                setCurrentPage(1)
              }}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${activeTab === 'approval'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
            >
              Approval
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('completed')
                setCurrentPage(1)
              }}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${activeTab === 'completed'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
            >
              Completed
            </button>
          </nav>
        </section>

        {/* Top stats */}
        <section className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Pending Procurements
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {pendingCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {pendingQuantity.toLocaleString('id-ID')} units • Rp{' '}
                  {pendingValue.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                <ShoppingCartIcon className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Completed Procurements
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {completedCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {completedQuantity.toLocaleString('id-ID')} units • Rp{' '}
                  {completedValue.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Procurements
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {allProcurements.length}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {allProcurements.reduce((sum, p) => sum + p.quantity, 0).toLocaleString('id-ID')} units • Rp{' '}
                  {allProcurements
                    .reduce((sum, p) => {
                      const price = p.unit_price ?? 0
                      return sum + p.quantity * price
                    }, 0)
                    .toLocaleString('id-ID')}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                <ShoppingCartIcon className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </div>
        </section>

        {/* Procurements table card */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Search and filter */}
          <div className="border-b border-slate-200 p-3 md:p-4">
            <div className="flex flex-col gap-3">
              {/* Search bar */}
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product, location, supplier, or notes..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Filters row */}
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-2">
                <div className="relative">
                  <select
                    value={selectedProductFilter ?? ''}
                    onChange={(e) => {
                      setSelectedProductFilter(
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                      setCurrentPage(1)
                    }}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm"
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
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm"
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
                    value={isStatusFilterLocked ? lockedStatusFilter : selectedStatusFilter}
                    onChange={(e) => {
                      if (!isStatusFilterLocked) {
                        setSelectedStatusFilter(
                          e.target.value as ProcurementStatus | 'all',
                        )
                        setCurrentPage(1)
                      }
                    }}
                    disabled={isStatusFilterLocked}
                    className={`w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm ${isStatusFilterLocked
                        ? 'cursor-not-allowed bg-slate-100 opacity-60'
                        : ''
                      }`}
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
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
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm"
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
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm"
                  />
                </div>
                {(dateFromFilter || dateToFilter) && (
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
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 md:px-4 md:py-3">Date & Time</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Product</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Location</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Quantity</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Unit Price</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Total</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Supplier</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">PIC</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Status</th>
                  <th className="hidden px-3 py-2 md:table-cell md:px-4 md:py-3">
                    Notes
                  </th>
                  <th className="px-3 py-2 text-right md:px-4 md:py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleProcurements.map((procurement) => {
                  const isDeleted = procurement.deleted_at !== null
                  const total = (procurement.unit_price ?? 0) * procurement.quantity
                  return (
                    <tr
                      key={procurement.id}
                      className={
                        isDeleted
                          ? 'bg-rose-50/40 text-slate-400'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>
                            {new Date(procurement.created_at).toLocaleDateString('id-ID', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(procurement.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-slate-900 md:px-4 md:py-3 md:text-sm">
                        {procurement.product_name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>{procurement.location_name}</span>
                          <span className="text-[10px] text-slate-500">
                            {procurement.location_type}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {procurement.quantity.toLocaleString('id-ID')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {procurement.unit_price
                          ? `Rp ${procurement.unit_price.toLocaleString('id-ID')}`
                          : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-slate-900 md:px-4 md:py-3 md:text-sm">
                        {procurement.unit_price
                          ? `Rp ${total.toLocaleString('id-ID')}`
                          : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        {procurement.supplier || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        {procurement.pic || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 md:px-4 md:py-3">
                        {getStatusBadge(procurement.status)}
                      </td>
                      <td className="hidden max-w-xs truncate px-3 py-2 text-xs text-slate-500 md:table-cell md:px-4 md:py-3 md:text-sm">
                        {procurement.notes || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs md:px-4 md:py-3 md:text-sm">
                        <div className="inline-flex items-center gap-1">
                          {!isDeleted && (
                            <>
                              {procurement.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(procurement)}
                                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReject(procurement)}
                                    className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {procurement.status !== 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEdit(procurement)}
                                    className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(procurement)}
                                    className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </>
                          )}
                          {isDeleted && (
                            <button
                              type="button"
                              onClick={() => handleRestore(procurement)}
                              className="rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {visibleProcurements.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-xs text-slate-500"
                    >
                      {searchQuery ||
                        selectedProductFilter !== null ||
                        selectedLocationFilter !== null ||
                        selectedStatusFilter !== 'all' ||
                        dateFromFilter ||
                        dateToFilter
                        ? 'No procurements match your search or filter criteria.'
                        : 'No procurements found. Click '}
                      {!searchQuery &&
                        selectedProductFilter === null &&
                        selectedLocationFilter === null &&
                        selectedStatusFilter === 'all' &&
                        !dateFromFilter &&
                        !dateToFilter && (
                          <>
                            <span className="font-medium text-slate-900">
                              New Procurement
                            </span>{' '}
                            to add one.
                          </>
                        )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredProcurements.length > 0 && (
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
                      {Math.min(currentPage * itemsPerPage, filteredProcurements.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {filteredProcurements.length}
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
                          className={`rounded px-3 py-1 text-xs font-medium ${currentPage === pageNum
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

      {/* Slide-over form */}
      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-end bg-black/20">
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingId == null ? 'New Procurement' : 'Edit Procurement'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Product <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    options={products.map((product) => ({
                      value: product.id,
                      label: product.name,
                    }))}
                    value={form.product_id || null}
                    onChange={(val) => {
                      const productId = val ? String(val) : ''
                      const product = products.find((p) => p.id === Number(val))
                      setForm({
                        ...form,
                        product_id: productId,
                        product_uom_id: product?.uom_id ?? null,
                        uom_id: product?.uom_id?.toString() ?? '',
                        converted_quantity: null,
                      })
                    }}
                    placeholder="Select a product"
                    required
                    searchPlaceholder="Search product..."
                  />
                  {form.product_uom_id && (
                    <p className="text-[10px] text-slate-500">
                      Base UOM: {uoms.find((u) => u.id === form.product_uom_id)?.abbreviation || ''}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    UOM
                  </label>
                  <SearchableSelect
                    options={[
                      { value: '', label: 'Use product UOM' },
                      ...uoms.map((uom) => ({
                        value: uom.id,
                        label: `${uom.name} (${uom.abbreviation})`,
                      })),
                    ]}
                    value={form.uom_id || ''}
                    onChange={async (val) => {
                      const uomId = val ? String(val) : ''
                      setForm({ ...form, uom_id: uomId })

                      // Calculate conversion if UOM is different from product's UOM
                      if (uomId && form.product_uom_id && parseInt(uomId, 10) !== form.product_uom_id) {
                        const quantity = parseFloat(form.quantity || '0')
                        if (quantity > 0) {
                          const rate = await getUOMConversion(parseInt(uomId, 10), form.product_uom_id)
                          if (rate !== null) {
                            setForm((prev) => ({
                              ...prev,
                              converted_quantity: quantity * rate,
                            }))
                          } else {
                            setForm((prev) => ({ ...prev, converted_quantity: null }))
                          }
                        }
                      } else {
                        setForm((prev) => ({ ...prev, converted_quantity: null }))
                      }
                    }}
                    placeholder="Use product UOM"
                    searchPlaceholder="Search UOM..."
                  />
                  {form.converted_quantity !== null && (
                    <p className="text-[10px] text-emerald-600">
                      = {form.converted_quantity.toFixed(2)}{' '}
                      {form.product_uom_id && uoms.find((u) => u.id === form.product_uom_id)?.abbreviation}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Location <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    options={locations.map((location) => ({
                      value: location.id,
                      label: `${location.name} (${location.type})`,
                    }))}
                    value={form.location_id || null}
                    onChange={(val) =>
                      setForm({ ...form, location_id: val ? String(val) : '' })
                    }
                    placeholder="Select a location"
                    required
                    searchPlaceholder="Search location..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    value={form.quantity}
                    onChange={async (e) => {
                      const quantity = e.target.value
                      setForm({ ...form, quantity })

                      // Recalculate conversion if UOM is different
                      if (form.uom_id && form.product_uom_id && parseInt(form.uom_id, 10) !== form.product_uom_id) {
                        const qty = parseFloat(quantity || '0')
                        if (qty > 0) {
                          const rate = await getUOMConversion(parseInt(form.uom_id, 10), form.product_uom_id)
                          if (rate !== null) {
                            setForm((prev) => ({
                              ...prev,
                              converted_quantity: qty * rate,
                            }))
                          } else {
                            setForm((prev) => ({ ...prev, converted_quantity: null }))
                          }
                        }
                      } else {
                        setForm((prev) => ({ ...prev, converted_quantity: null }))
                      }
                    }}
                    placeholder="0"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    This will automatically add to the location stock (converted to base UOM if different)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Unit Price (Optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.unit_price}
                    onChange={(e) =>
                      setForm({ ...form, unit_price: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Supplier (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.supplier}
                    onChange={(e) =>
                      setForm({ ...form, supplier: e.target.value })
                    }
                    placeholder="Supplier name"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    PIC (Person In Charge) (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.pic}
                    onChange={(e) =>
                      setForm({ ...form, pic: e.target.value })
                    }
                    placeholder="Person in charge name"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    placeholder="Additional notes..."
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {editingProcurement && (
                  <div className="grid gap-3 rounded-md bg-slate-50 p-3 text-[10px] text-slate-500 md:grid-cols-2">
                    <div>
                      <div className="font-semibold text-slate-600">
                        Created at
                      </div>
                      <div>
                        {new Date(
                          editingProcurement.created_at,
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-600">
                        Updated at
                      </div>
                      <div>
                        {new Date(
                          editingProcurement.updated_at,
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                  >
                    {editingId == null ? 'Create' : 'Update'}
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

