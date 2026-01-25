import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'
import { listAuditTrail } from '../db/auditTrail'
import type {
  AuditTrailWithDetails,
  AuditAction,
  AuditEntityType,
} from '../db/auditTrail'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'

export default function AuditTrail() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [auditEntries, setAuditEntries] = useState<AuditTrailWithDetails[]>([])

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntityFilter, setSelectedEntityFilter] = useState<AuditEntityType | 'all'>('all')
  const [selectedActionFilter, setSelectedActionFilter] = useState<AuditAction | 'all'>('all')
  const [dateFromFilter, setDateFromFilter] = useState<string>('')
  const [dateToFilter, setDateToFilter] = useState<string>('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  useEffect(() => {
    const load = async () => {
      try {
        const entries = await listAuditTrail()
        setAuditEntries(entries)
      } catch (error) {
        console.error('[AuditTrail] Error loading:', error)
        toast.error('Failed to load audit trail data.')
      }
    }
    void load()
  }, [toast])

  const filteredEntries = useMemo(() => {
    let filtered = auditEntries.filter((entry) => {
      const matchesSearch =
        searchQuery === '' ||
        entry.entity_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.entity_type.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesEntity =
        selectedEntityFilter === 'all' || entry.entity_type === selectedEntityFilter

      const matchesAction =
        selectedActionFilter === 'all' || entry.action === selectedActionFilter

      // Date range filter
      const entryDate = new Date(entry.created_at)
      const matchesDateFrom =
        dateFromFilter === '' ||
        entryDate >= new Date(dateFromFilter + 'T00:00:00')

      const matchesDateTo =
        dateToFilter === '' ||
        entryDate <= new Date(dateToFilter + 'T23:59:59')

      return (
        matchesSearch &&
        matchesEntity &&
        matchesAction &&
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
    auditEntries,
    searchQuery,
    selectedEntityFilter,
    selectedActionFilter,
    dateFromFilter,
    dateToFilter,
  ])

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage)
  const paginatedEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredEntries.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredEntries, currentPage, itemsPerPage])

  const visibleEntries = paginatedEntries

  // Stats
  const totalEntries = auditEntries.length
  const createCount = useMemo(
    () => auditEntries.filter((e) => e.action === 'create').length,
    [auditEntries],
  )
  const updateCount = useMemo(
    () => auditEntries.filter((e) => e.action === 'update').length,
    [auditEntries],
  )
  const deleteCount = useMemo(
    () => auditEntries.filter((e) => e.action === 'delete').length,
    [auditEntries],
  )

  const getActionBadge = (action: AuditAction) => {
    const badges = {
      create: (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
          Create
        </span>
      ),
      update: (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
          Update
        </span>
      ),
      delete: (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800">
          Delete
        </span>
      ),
      restore: (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Restore
        </span>
      ),
      approve: (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800">
          Approve
        </span>
      ),
      reject: (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-800">
          Reject
        </span>
      ),
    }
    return badges[action]
  }

  const getEntityTypeBadge = (entityType: AuditEntityType) => {
    const badges = {
      product: (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">
          Product
        </span>
      ),
      category: (
        <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-medium text-pink-800">
          Category
        </span>
      ),
      subcategory: (
        <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-medium text-pink-800">
          Subcategory
        </span>
      ),
      uom: (
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-800">
          UOM
        </span>
      ),
      location: (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800">
          Location
        </span>
      ),
      product_location_stock: (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-800">
          Stock
        </span>
      ),
      procurement: (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
          Procurement
        </span>
      ),
      disposal: (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800">
          Disposal
        </span>
      ),
      sale: (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
          Sale
        </span>
      ),
      stock_opname: (
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-800">
          Stock Opname
        </span>
      ),
      user: (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800">
          User
        </span>
      ),
      role: (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Role
        </span>
      ),
      uom_conversion: (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
          UOM Conversion
        </span>
      ),
    }
    return badges[entityType]
  }

  const handleExportExcel = () => {
    try {
      const exportData = filteredEntries.map((entry) => {
        let oldValues = '-'
        let newValues = '-'

        try {
          if (entry.old_values) {
            const parsed = JSON.parse(entry.old_values)
            oldValues = JSON.stringify(parsed, null, 2)
          }
          if (entry.new_values) {
            const parsed = JSON.parse(entry.new_values)
            newValues = JSON.stringify(parsed, null, 2)
          }
        } catch (error) {
          // If parsing fails, use raw string
          oldValues = entry.old_values || '-'
          newValues = entry.new_values || '-'
        }

        return {
          'ID': entry.id,
          'Date': new Date(entry.created_at).toLocaleDateString('id-ID'),
          'Time': new Date(entry.created_at).toLocaleTimeString('id-ID'),
          'Entity Type': entry.entity_type,
          'Entity ID': entry.entity_id,
          'Entity Name': entry.entity_name || '-',
          'Action': entry.action.charAt(0).toUpperCase() + entry.action.slice(1),
          'Old Values': oldValues,
          'New Values': newValues,
          'Notes': entry.notes || '-',
          'Created At': new Date(entry.created_at).toLocaleString('id-ID'),
        }
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Audit Trail')

      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const filename = `audit_trail_${dateStr}.xlsx`

      XLSX.writeFile(wb, filename)

      toast.success(`Exported ${exportData.length} audit trail entries to ${filename}`)
    } catch (error) {
      console.error('[AuditTrail] Error exporting to Excel:', error)
      toast.error('Failed to export audit trail to Excel.')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.auditTrail.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.auditTrail.description}
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
                  Total Entries
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalEntries}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                <DocumentTextIcon className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Creates
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {createCount}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                <DocumentTextIcon className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Updates
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {updateCount}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                <DocumentTextIcon className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Deletes
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {deleteCount}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50">
                <DocumentTextIcon className="h-5 w-5 text-rose-600" />
              </div>
            </div>
          </div>
        </section>

        {/* Audit trail table card */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Search and filter */}
          <div className="border-b border-slate-200 p-3 md:p-4">
            <div className="flex flex-col gap-3">
              {/* Search bar */}
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by entity name, type, or notes..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Filters */}
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                <div className="relative">
                  <select
                    value={selectedEntityFilter}
                    onChange={(e) => {
                      setSelectedEntityFilter(
                        e.target.value as AuditEntityType | 'all',
                      )
                      setCurrentPage(1)
                    }}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm"
                  >
                    <option value="all">All Entities</option>
                    <option value="product">Product</option>
                    <option value="category">Category</option>
                    <option value="subcategory">Subcategory</option>
                    <option value="uom">UOM</option>
                    <option value="location">Location</option>
                    <option value="product_location_stock">Stock</option>
                    <option value="procurement">Procurement</option>
                    <option value="disposal">Disposal</option>
                    <option value="sale">Sale</option>
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <div className="relative">
                  <select
                    value={selectedActionFilter}
                    onChange={(e) => {
                      setSelectedActionFilter(
                        e.target.value as AuditAction | 'all',
                      )
                      setCurrentPage(1)
                    }}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm"
                  >
                    <option value="all">All Actions</option>
                    <option value="create">Create</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                    <option value="restore">Restore</option>
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
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
                  <th className="px-3 py-2 md:px-4 md:py-3">Entity</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Action</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Entity Name</th>
                  <th className="hidden px-3 py-2 md:table-cell md:px-4 md:py-3">
                    Changes
                  </th>
                  <th className="hidden px-3 py-2 md:table-cell md:px-4 md:py-3">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleEntries.map((entry) => {
                  let oldValues: Record<string, unknown> | null = null
                  let newValues: Record<string, unknown> | null = null

                  try {
                    if (entry.old_values) {
                      oldValues = JSON.parse(entry.old_values)
                    }
                    if (entry.new_values) {
                      newValues = JSON.parse(entry.new_values)
                    }
                  } catch (error) {
                    // Ignore parse errors
                  }

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>
                            {new Date(entry.created_at).toLocaleDateString('id-ID', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(entry.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 md:px-4 md:py-3">
                        {getEntityTypeBadge(entry.entity_type)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 md:px-4 md:py-3">
                        {getActionBadge(entry.action)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-slate-900 md:px-4 md:py-3 md:text-sm">
                        {entry.entity_name || `ID: ${entry.entity_id}`}
                      </td>
                      <td className="hidden px-3 py-2 text-xs text-slate-500 md:table-cell md:px-4 md:py-3 md:text-sm">
                        {entry.action === 'update' && oldValues && newValues ? (
                          <div className="space-y-1">
                            {Object.keys(newValues).map((key) => {
                              const oldVal = oldValues?.[key]
                              const newVal = newValues?.[key]
                              if (oldVal !== newVal) {
                                return (
                                  <div key={key} className="text-[10px]">
                                    <span className="font-medium">{key}:</span>{' '}
                                    <span className="text-rose-600 line-through">
                                      {String(oldVal)}
                                    </span>{' '}
                                    →{' '}
                                    <span className="text-emerald-600">
                                      {String(newVal)}
                                    </span>
                                  </div>
                                )
                              }
                              return null
                            })}
                          </div>
                        ) : entry.action === 'create' && newValues ? (
                          <div className="text-[10px] text-emerald-600">
                            Created: {Object.keys(newValues).join(', ')}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="hidden max-w-xs truncate px-3 py-2 text-xs text-slate-500 md:table-cell md:px-4 md:py-3 md:text-sm">
                        {entry.notes || '-'}
                      </td>
                    </tr>
                  )
                })}

                {visibleEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-xs text-slate-500"
                    >
                      {searchQuery ||
                      selectedEntityFilter !== 'all' ||
                      selectedActionFilter !== 'all' ||
                      dateFromFilter ||
                      dateToFilter
                        ? 'No audit trail entries match your search or filter criteria.'
                        : 'No audit trail entries found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredEntries.length > 0 && (
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
                      {Math.min(currentPage * itemsPerPage, filteredEntries.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {filteredEntries.length}
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
    </div>
  )
}

