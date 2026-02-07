import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  createLocation,
  listLocations,
  restoreLocation,
  softDeleteLocation,
  updateLocation,
} from '../db/locations'
import type { LocationRow } from '../db/locations'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'

type LocationFormState = {
  name: string
  type: 'warehouse' | 'ecommerce'
}

export default function Locations() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [form, setForm] = useState<LocationFormState>({
    name: '',
    type: 'warehouse',
  })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'warehouse' | 'ecommerce'>('all')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const filteredLocations = useMemo(() => {
    let filtered = locations.filter((l) => (showDeleted ? true : l.deleted_at === null))

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(query) ||
          l.type.toLowerCase().includes(query) ||
          l.id.toString().includes(query),
      )
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter((l) => l.type === typeFilter)
    }

    return filtered
  }, [locations, showDeleted, searchQuery, typeFilter])

  // Pagination calculations
  const totalPages = Math.ceil(filteredLocations.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedLocations = filteredLocations.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, typeFilter, showDeleted])

  const visibleLocations = paginatedLocations

  const editingLocation =
    editingId != null ? locations.find((l) => l.id === editingId) ?? null : null

  useEffect(() => {
    const load = async () => {
      try {
        const locationsList = await listLocations()
        setLocations(locationsList)
      } catch (error) {
        console.error('[Locations] Error loading:', error)
      }
    }
    void load()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', type: 'warehouse' })
    setShowForm(true)
  }

  const openEdit = (location: LocationRow) => {
    setEditingId(location.id)
    setForm({
      name: location.name,
      type: location.type,
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const handleCloseForm = () => {
    if (confirm(t.common.closeConfirm)) closeForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId == null) {
        const created = await createLocation({
          name: form.name.trim(),
          type: form.type,
        })
        setLocations((prev) => [...prev, created])
        toast.success(t.locations.created)
      } else {
        const updated = await updateLocation(editingId, {
          name: form.name.trim(),
          type: form.type,
        })
        if (updated) {
          setLocations((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l)),
          )
          toast.success(t.locations.updated)
        } else {
          toast.error(t.locations.updated.replace('successfully', 'failed').replace('berhasil', 'gagal'))
        }
      }
      closeForm()
    } catch (error) {
      console.error('[Locations] Error saving location:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save location: ${errorMessage}`)
    }
  }

  const handleDelete = async (location: LocationRow) => {
    if (location.deleted_at) return
    try {
      const updated = await softDeleteLocation(location.id)
      if (updated) {
        setLocations((prev) =>
          prev.map((l) => (l.id === updated.id ? updated : l)),
        )
        toast.success(t.locations.deleted)
      } else {
        toast.error('Failed to delete location')
      }
    } catch (error) {
      console.error('[Locations] Error deleting location:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete location: ${errorMessage}`)
    }
  }

  const handleRestore = async (location: LocationRow) => {
    if (!location.deleted_at) return
    try {
      const updated = await restoreLocation(location.id)
      if (updated) {
        setLocations((prev) =>
          prev.map((l) => (l.id === updated.id ? updated : l)),
        )
        toast.success(t.locations.restored)
      } else {
        toast.error('Failed to restore location')
      }
    } catch (error) {
      console.error('[Locations] Error restoring location:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to restore location: ${errorMessage}`)
    }
  }

  const warehouseCount = useMemo(
    () => filteredLocations.filter((l) => l.type === 'warehouse').length,
    [filteredLocations],
  )
  const ecommerceCount = useMemo(
    () => filteredLocations.filter((l) => l.type === 'ecommerce').length,
    [filteredLocations],
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.locations.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.locations.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t.locations.addLocation}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            <span>{t.common.showDeleted}</span>
          </label>
        </div>

        {/* Stats */}
        <section className="mb-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t.locations.warehouses}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {warehouseCount}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <span className="text-lg">🏭</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t.locations.stores}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {ecommerceCount}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                <span className="text-lg">🛒</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900 md:text-base">
              {t.locations.locationList}
            </h2>
            <p className="text-xs text-slate-500">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredLocations.length)} of{' '}
              {filteredLocations.length} location
              {filteredLocations.length === 1 ? '' : 's'}
              {showDeleted ? ' (including deleted)' : ''}
            </p>

            {/* Search and Filter */}
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={t.locations.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="relative">
                <select
                  value={typeFilter}
                  onChange={(e) =>
                    setTypeFilter(e.target.value as 'all' | 'warehouse' | 'ecommerce')
                  }
                  className="appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="all">{t.common.all} Types</option>
                  <option value="warehouse">{t.locations.warehouse}</option>
                  <option value="ecommerce">{t.locations.ecommerce}</option>
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {visibleLocations.map((location) => {
              const isDeleted = location.deleted_at !== null

              return (
                <div
                  key={location.id}
                  className={`px-4 py-3 ${
                    isDeleted ? 'bg-rose-50/40' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className={`text-sm font-medium ${
                            isDeleted ? 'line-through text-slate-400' : ''
                          }`}
                        >
                          {location.name}
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            location.type === 'warehouse'
                              ? 'bg-primary-100 text-primary-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {location.type === 'warehouse' ? '🏭' : '🛒'}{' '}
                          {location.type}
                        </span>
                      </div>
                      {isDeleted && (
                        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-rose-500">
                          {t.auditTrail.deleted}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!isDeleted && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(location)}
                            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {t.common.edit}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(location)}
                            className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                          >
                            {t.common.delete}
                          </button>
                        </>
                      )}
                      {isDeleted && (
                        <button
                          type="button"
                          onClick={() => handleRestore(location)}
                          className="rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                        >
                          {t.common.restore}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {visibleLocations.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                {searchQuery || typeFilter !== 'all'
                  ? 'No locations match your search or filter criteria.'
                  : 'No locations found. Click '}
                {!searchQuery && typeFilter === 'all' && (
                  <>
                    <span className="font-medium text-slate-900">New Location</span>{' '}
                    to add one.
                  </>
                )}
              </div>
            )}
          </div>

          {/* Pagination */}
          {filteredLocations.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">
                    {t.common.showing}{' '}
                    <span className="font-medium text-slate-900">
                      {(currentPage - 1) * itemsPerPage + 1}
                    </span>{' '}
                    {t.common.to}{' '}
                    <span className="font-medium text-slate-900">
                      {Math.min(currentPage * itemsPerPage, filteredLocations.length)}
                    </span>{' '}
                    {t.common.of}{' '}
                    <span className="font-medium text-slate-900">
                      {filteredLocations.length}
                    </span>{' '}
                    {t.common.results}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">{t.common.itemsPerPage}:</label>
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
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t.common.previous}
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
                          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
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
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t.common.next}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  {editingLocation ? t.locations.editLocation : t.locations.addLocation}
                </h2>
                {editingLocation && (
                  <p className="text-xs text-slate-500">ID #{editingLocation.id}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCloseForm}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.locations.locationName}
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="e.g., Main Warehouse, Online Store"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.locations.locationType}
                </label>
                <div className="relative">
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as 'warehouse' | 'ecommerce',
                      })
                    }
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value="warehouse">🏭 {t.locations.warehouse}</option>
                    <option value="ecommerce">🛒 {t.locations.ecommerce}</option>
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 md:px-4 md:text-sm"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:text-sm"
                >
                  {editingLocation ? t.common.save : t.locations.addLocation}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

