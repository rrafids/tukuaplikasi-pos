import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'
import { listProducts } from '../db/products'
import type { ProductRow } from '../db/products'
import { listLocations } from '../db/locations'
import type { LocationRow } from '../db/locations'
import {
  approveDisposal,
  createDisposal,
  listDisposals,
  rejectDisposal,
  restoreDisposal,
  softDeleteDisposal,
  updateDisposal,
} from '../db/disposals'
import type { DisposalRow, DisposalStatus } from '../db/disposals'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'

type Disposal = DisposalRow & {
  product_name: string
  location_name: string
  location_type: string
}

type DisposalFormState = {
  product_id: string
  location_id: string
  quantity: string
  reason: string
  pic: string
  notes: string
}

export default function Disposals() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [disposals, setDisposals] = useState<Disposal[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'approval' | 'completed'>('all')
  const [form, setForm] = useState<DisposalFormState>({
    product_id: '',
    location_id: '',
    quantity: '',
    reason: '',
    pic: '',
    notes: '',
  })

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProductFilter, setSelectedProductFilter] = useState<number | null>(null)
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<number | null>(null)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<DisposalStatus | 'all'>('all')
  const [dateFromFilter, setDateFromFilter] = useState<string>('')
  const [dateToFilter, setDateToFilter] = useState<string>('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Lock status filter based on active tab
  const isStatusFilterLocked = activeTab === 'approval' || activeTab === 'completed'
  const lockedStatusFilter: DisposalStatus | 'all' = activeTab === 'approval' ? 'pending' : activeTab === 'completed' ? 'approved' : 'all'

  const filteredDisposals = useMemo(() => {
    let filtered = disposals.filter((d) => {
      if (showDeleted && d.deleted_at === null) return false
      if (!showDeleted && d.deleted_at !== null) return false

      // Filter by active tab
      if (activeTab === 'all') {
        // Show all statuses - no filter
      } else if (activeTab === 'approval') {
        if (d.status !== 'pending') return false
      } else if (activeTab === 'completed') {
        if (d.status !== 'approved') return false
      }

      const matchesSearch =
        searchQuery === '' ||
        d.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.location_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.notes?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesProduct =
        selectedProductFilter === null || d.product_id === selectedProductFilter

      const matchesLocation =
        selectedLocationFilter === null || d.location_id === selectedLocationFilter

      // Status filter: use locked status if tab is locked, otherwise use selected filter
      const effectiveStatusFilter = isStatusFilterLocked ? lockedStatusFilter : selectedStatusFilter
      const matchesStatus =
        effectiveStatusFilter === 'all' || d.status === effectiveStatusFilter

      // Date range filter
      const disposalDate = new Date(d.created_at)
      const matchesDateFrom =
        dateFromFilter === '' ||
        disposalDate >= new Date(dateFromFilter + 'T00:00:00')

      const matchesDateTo =
        dateToFilter === '' ||
        disposalDate <= new Date(dateToFilter + 'T23:59:59')

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
    disposals,
    searchQuery,
    selectedProductFilter,
    selectedLocationFilter,
    selectedStatusFilter,
    dateFromFilter,
    dateToFilter,
    showDeleted,
    activeTab,
    isStatusFilterLocked,
    lockedStatusFilter,
  ])

  const totalPages = Math.ceil(filteredDisposals.length / itemsPerPage)
  const paginatedDisposals = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredDisposals.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredDisposals, currentPage, itemsPerPage])

  const visibleDisposals = paginatedDisposals

  const editingDisposal =
    editingId != null
      ? disposals.find((d) => d.id === editingId) ?? null
      : null

  useEffect(() => {
    const load = async () => {
      try {
        const [disps, prods, locs] = await Promise.all([
          listDisposals(),
          listProducts(),
          listLocations(),
        ])
        setDisposals(disps)
        setProducts(prods.filter((p) => p.deleted_at === null))
        setLocations(locs.filter((l) => l.deleted_at === null))
      } catch (error) {
        console.error('[Disposals] Error loading:', error)
      }
    }
    void load()
  }, [])

  const resetForm = () =>
    setForm({
      product_id: '',
      location_id: '',
      quantity: '',
      reason: '',
      pic: '',
      notes: '',
    })

  const openCreate = () => {
    setEditingId(null)
    resetForm()
    setShowForm(true)
  }

  const openEdit = (disposal: Disposal) => {
    setEditingId(disposal.id)
    setForm({
      product_id: disposal.product_id.toString(),
      location_id: disposal.location_id.toString(),
      quantity: disposal.quantity.toString(),
      reason: disposal.reason ?? '',
      pic: disposal.pic ?? '',
      notes: disposal.notes ?? '',
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
      const quantity = parseInt(form.quantity || '0', 10)

      if (quantity <= 0) {
        toast.error('Quantity must be greater than 0')
        return
      }

      if (editingId == null) {
        await createDisposal({
          product_id: parseInt(form.product_id, 10),
          location_id: parseInt(form.location_id, 10),
          quantity,
          reason: form.reason.trim() || null,
          pic: form.pic.trim() || null,
          notes: form.notes.trim() || null,
        })
        // Reload disposals to get updated data with joins
        const updatedList = await listDisposals()
        setDisposals(updatedList)
        toast.success(t.disposals.created)
      } else {
        const updated = await updateDisposal(editingId, {
          product_id: parseInt(form.product_id, 10),
          location_id: parseInt(form.location_id, 10),
          quantity,
          reason: form.reason.trim() || null,
          pic: form.pic.trim() || null,
          notes: form.notes.trim() || null,
        })
        if (updated) {
          // Reload disposals to get updated data with joins
          const updatedList = await listDisposals()
          setDisposals(updatedList)
          toast.success(t.disposals.updated)
        } else {
          toast.error(t.disposals.updated.replace('successfully', 'failed').replace('berhasil', 'gagal'))
        }
      }

      closeForm()
    } catch (error) {
      console.error('[Disposals] Error saving disposal:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save disposal: ${errorMessage}`)
    }
  }

  const handleDelete = async (disposal: Disposal) => {
    if (disposal.deleted_at) return
    try {
      const updated = await softDeleteDisposal(disposal.id)
      if (updated) {
        // Reload disposals to get updated data
        const updatedList = await listDisposals()
        setDisposals(updatedList)
        toast.success(t.disposals.deleted)
      } else {
        toast.error('Failed to delete disposal')
      }
    } catch (error) {
      console.error('[Disposals] Error deleting disposal:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete disposal: ${errorMessage}`)
    }
  }

  const handleRestore = async (disposal: Disposal) => {
    if (!disposal.deleted_at) return
    try {
      const updated = await restoreDisposal(disposal.id)
      if (updated) {
        // Reload disposals to get updated data
        const updatedList = await listDisposals()
        setDisposals(updatedList)
        toast.success(t.disposals.restored)
      } else {
        toast.error('Failed to restore disposal')
      }
    } catch (error) {
      console.error('[Disposals] Error restoring disposal:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to restore disposal: ${errorMessage}`)
    }
  }

  const handleApprove = async (disposal: Disposal) => {
    if (disposal.status !== 'pending') return
    try {
      const updated = await approveDisposal(disposal.id)
      if (updated) {
        // Reload disposals to get updated data
        const updatedList = await listDisposals()
        setDisposals(updatedList)
        toast.success(t.disposals.approved)
      } else {
        toast.error('Failed to approve disposal')
      }
    } catch (error) {
      console.error('[Disposals] Error approving disposal:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to approve disposal: ${errorMessage}`)
    }
  }

  const handleReject = async (disposal: Disposal) => {
    if (disposal.status !== 'pending') return
    try {
      const updated = await rejectDisposal(disposal.id)
      if (updated) {
        // Reload disposals to get updated data
        const updatedList = await listDisposals()
        setDisposals(updatedList)
        toast.success(t.disposals.rejected)
      } else {
        toast.error('Failed to reject disposal')
      }
    } catch (error) {
      console.error('[Disposals] Error rejecting disposal:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to reject disposal: ${errorMessage}`)
    }
  }

  // Stats for all disposals (not filtered by tab)
  const allDisposals = useMemo(
    () => disposals.filter((d) => d.deleted_at === null),
    [disposals],
  )

  const pendingCount = useMemo(
    () => allDisposals.filter((d) => d.status === 'pending').length,
    [allDisposals],
  )

  const completedCount = useMemo(
    () => allDisposals.filter((d) => d.status === 'approved').length,
    [allDisposals],
  )

  const pendingQuantity = useMemo(
    () =>
      allDisposals
        .filter((d) => d.status === 'pending')
        .reduce((sum, d) => sum + d.quantity, 0),
    [allDisposals],
  )

  const completedQuantity = useMemo(
    () =>
      allDisposals
        .filter((d) => d.status === 'approved')
        .reduce((sum, d) => sum + d.quantity, 0),
    [allDisposals],
  )

  const getStatusBadge = (status: DisposalStatus) => {
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
      const exportData = filteredDisposals.map((d) => {
        return {
          'ID': d.id,
          'Date': new Date(d.created_at).toLocaleDateString('id-ID'),
          'Product': d.product_name,
          'Location': d.location_name,
          'Location Type': d.location_type,
          'Quantity': d.quantity,
          'Reason': d.reason || '-',
          'Status': d.status.charAt(0).toUpperCase() + d.status.slice(1),
          'Notes': d.notes || '-',
          'Created At': new Date(d.created_at).toLocaleString('id-ID'),
          'Updated At': new Date(d.updated_at).toLocaleString('id-ID'),
        }
      })

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Disposals')

      // Generate filename with current date
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const filename = `disposals_${dateStr}.xlsx`

      // Write file
      XLSX.writeFile(wb, filename)

      toast.success(`Exported ${exportData.length} disposals to ${filename}`)
    } catch (error) {
      console.error('[Disposals] Error exporting to Excel:', error)
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
            {t.disposals.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.disposals.description}
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
            className={`rounded-md border px-3 py-1.5 text-xs font-medium md:px-4 md:py-2 md:text-sm ${
              showDeleted
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
            <span>{t.disposals.addDisposal}</span>
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
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === 'all'
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
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === 'approval'
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
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === 'completed'
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
                  Pending Disposals
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {pendingCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {pendingQuantity.toLocaleString('id-ID')} units
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                <TrashIcon className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Completed Disposals
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {completedCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {completedQuantity.toLocaleString('id-ID')} units
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
                  Total Disposals
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {allDisposals.length}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {allDisposals.reduce((sum, d) => sum + d.quantity, 0).toLocaleString('id-ID')} units
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                <TrashIcon className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </div>
        </section>

        {/* Disposals table card */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Search and filter */}
          <div className="border-b border-slate-200 p-3 md:p-4">
            <div className="flex flex-col gap-3">
              {/* Search bar */}
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product, location, reason, or notes..."
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
                          e.target.value as DisposalStatus | 'all',
                        )
                        setCurrentPage(1)
                      }
                    }}
                    disabled={isStatusFilterLocked}
                    className={`w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm ${
                      isStatusFilterLocked
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
                  <th className="px-3 py-2 md:px-4 md:py-3">Reason</th>
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
                {visibleDisposals.map((disposal) => {
                  const isDeleted = disposal.deleted_at !== null
                  return (
                    <tr
                      key={disposal.id}
                      className={
                        isDeleted
                          ? 'bg-rose-50/40 text-slate-400'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>
                            {new Date(disposal.created_at).toLocaleDateString('id-ID', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(disposal.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-slate-900 md:px-4 md:py-3 md:text-sm">
                        {disposal.product_name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>{disposal.location_name}</span>
                          <span className="text-[10px] text-slate-500">
                            {disposal.location_type}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {disposal.quantity.toLocaleString('id-ID')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        {disposal.reason || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        {disposal.pic || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 md:px-4 md:py-3">
                        {getStatusBadge(disposal.status)}
                      </td>
                      <td className="hidden max-w-xs truncate px-3 py-2 text-xs text-slate-500 md:table-cell md:px-4 md:py-3 md:text-sm">
                        {disposal.notes || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs md:px-4 md:py-3 md:text-sm">
                        <div className="inline-flex items-center gap-1">
                          {!isDeleted && (
                            <>
                              {disposal.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(disposal)}
                                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReject(disposal)}
                                    className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {disposal.status !== 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEdit(disposal)}
                                    className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(disposal)}
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
                              onClick={() => handleRestore(disposal)}
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

                {visibleDisposals.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-xs text-slate-500"
                    >
                      {searchQuery ||
                      selectedProductFilter !== null ||
                      selectedLocationFilter !== null ||
                      selectedStatusFilter !== 'all' ||
                      dateFromFilter ||
                      dateToFilter
                        ? 'No disposals match your search or filter criteria.'
                        : 'No disposals found. Click '}
                      {!searchQuery &&
                        selectedProductFilter === null &&
                        selectedLocationFilter === null &&
                        selectedStatusFilter === 'all' &&
                        !dateFromFilter &&
                        !dateToFilter && (
                          <>
                            <span className="font-medium text-slate-900">
                              New Disposal
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
          {filteredDisposals.length > 0 && (
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
                      {Math.min(currentPage * itemsPerPage, filteredDisposals.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {filteredDisposals.length}
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
          <div className="h-full w-full max-w-md border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingId == null ? t.disposals.addDisposal : t.disposals.editDisposal}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Product <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={form.product_id}
                    onChange={(e) =>
                      setForm({ ...form, product_id: e.target.value })
                    }
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select a product</option>
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
                  Location <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={form.location_id}
                    onChange={(e) =>
                      setForm({ ...form, location_id: e.target.value })
                    }
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select a location</option>
                    {locations.map((location) => (
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
                  Quantity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  placeholder="0"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-500">
                  This will reduce stock from the location after approval
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) =>
                    setForm({ ...form, reason: e.target.value })
                  }
                  placeholder="e.g., Damaged, Expired, Lost"
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

              {editingDisposal && (
                <div className="grid gap-3 rounded-md bg-slate-50 p-3 text-[10px] text-slate-500 md:grid-cols-2">
                  <div>
                    <div className="font-semibold text-slate-600">
                      Created at
                    </div>
                    <div>
                      {new Date(
                        editingDisposal.created_at,
                      ).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-600">
                      Updated at
                    </div>
                    <div>
                      {new Date(
                        editingDisposal.updated_at,
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
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
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

