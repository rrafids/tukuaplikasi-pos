import { useEffect, useMemo, useState } from 'react'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import {
  createUOM,
  listUOMs,
  restoreUOM,
  softDeleteUOM,
  updateUOM,
  listUOMConversions,
  createUOMConversion,
  updateUOMConversion,
  deleteUOMConversion,
} from '../db/uoms'
import type { UOMRow, UOMConversionWithNames } from '../db/uoms'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'

type UOMFormState = {
  name: string
  abbreviation: string
}

type ConversionFormState = {
  from_uom_id: string
  to_uom_id: string
  conversion_rate: string
}

export default function UOMs() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [uoms, setUOMs] = useState<UOMRow[]>([])
  const [conversions, setConversions] = useState<UOMConversionWithNames[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showConversionForm, setShowConversionForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingConversionId, setEditingConversionId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  
  // Conversion pagination state
  const [conversionCurrentPage, setConversionCurrentPage] = useState(1)
  const [conversionItemsPerPage, setConversionItemsPerPage] = useState(10)
  const [form, setForm] = useState<UOMFormState>({
    name: '',
    abbreviation: '',
  })
  const [conversionForm, setConversionForm] = useState<ConversionFormState>({
    from_uom_id: '',
    to_uom_id: '',
    conversion_rate: '',
  })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const filteredUOMs = useMemo(() => {
    let filtered = uoms.filter((u) => (showDeleted ? true : u.deleted_at === null))

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.abbreviation.toLowerCase().includes(query) ||
          u.id.toString().includes(query),
      )
    }

    return filtered
  }, [uoms, showDeleted, searchQuery])

  // Pagination calculations
  const totalPages = Math.ceil(filteredUOMs.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedUOMs = filteredUOMs.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, showDeleted])

  // Conversion pagination calculations
  const conversionTotalPages = Math.ceil(conversions.length / conversionItemsPerPage)
  const conversionStartIndex = (conversionCurrentPage - 1) * conversionItemsPerPage
  const conversionEndIndex = conversionStartIndex + conversionItemsPerPage
  const paginatedConversions = conversions.slice(conversionStartIndex, conversionEndIndex)

  // Reset conversion page when conversions change
  useEffect(() => {
    setConversionCurrentPage(1)
  }, [conversions.length])

  const visibleUOMs = paginatedUOMs

  const editingUOM =
    editingId != null ? uoms.find((u) => u.id === editingId) ?? null : null

  useEffect(() => {
    const load = async () => {
      try {
        const [uomsList, conversionsList] = await Promise.all([
          listUOMs(),
          listUOMConversions(),
        ])
        setUOMs(uomsList)
        setConversions(conversionsList)
      } catch (error) {
        console.error('[UOMs] Error loading:', error)
      }
    }
    void load()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', abbreviation: '' })
    setShowForm(true)
  }

  const openEdit = (uom: UOMRow) => {
    setEditingId(uom.id)
    setForm({
      name: uom.name,
      abbreviation: uom.abbreviation,
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
      if (editingId == null) {
        const created = await createUOM({
          name: form.name.trim(),
          abbreviation: form.abbreviation.trim(),
        })
        setUOMs((prev) => [...prev, created])
        toast.success(t.uoms.created)
      } else {
        const updated = await updateUOM(editingId, {
          name: form.name.trim(),
          abbreviation: form.abbreviation.trim(),
        })
        if (updated) {
          setUOMs((prev) =>
            prev.map((u) => (u.id === updated.id ? updated : u)),
          )
          toast.success(t.uoms.updated)
        } else {
          toast.error(t.uoms.updated.replace('successfully', 'failed'))
        }
      }
      closeForm()
    } catch (error) {
      console.error('[UOMs] Error saving UOM:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save UOM: ${errorMessage}`)
    }
  }

  const handleDelete = async (uom: UOMRow) => {
    if (uom.deleted_at) return
    try {
      const updated = await softDeleteUOM(uom.id)
      if (updated) {
        setUOMs((prev) =>
          prev.map((u) => (u.id === updated.id ? updated : u)),
        )
        toast.success(t.uoms.deleted)
      } else {
        toast.error('Failed to delete UOM')
      }
    } catch (error) {
      console.error('[UOMs] Error deleting UOM:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete UOM: ${errorMessage}`)
    }
  }

  const handleRestore = async (uom: UOMRow) => {
    if (!uom.deleted_at) return
    try {
      const updated = await restoreUOM(uom.id)
      if (updated) {
        setUOMs((prev) =>
          prev.map((u) => (u.id === updated.id ? updated : u)),
        )
        toast.success(t.uoms.restored)
      } else {
        toast.error('Failed to restore UOM')
      }
    } catch (error) {
      console.error('[UOMs] Error restoring UOM:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to restore UOM: ${errorMessage}`)
    }
  }

  // Conversion management functions
  const openCreateConversion = () => {
    setEditingConversionId(null)
    setConversionForm({
      from_uom_id: '',
      to_uom_id: '',
      conversion_rate: '',
    })
    setShowConversionForm(true)
  }

  const openEditConversion = (conversion: UOMConversionWithNames) => {
    setEditingConversionId(conversion.id)
    setConversionForm({
      from_uom_id: conversion.from_uom_id.toString(),
      to_uom_id: conversion.to_uom_id.toString(),
      conversion_rate: conversion.conversion_rate.toString(),
    })
    setShowConversionForm(true)
  }

  const closeConversionForm = () => {
    setShowConversionForm(false)
    setEditingConversionId(null)
  }


  const handleConversionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const fromUomId = parseInt(conversionForm.from_uom_id, 10)
      const toUomId = parseInt(conversionForm.to_uom_id, 10)
      const rate = parseFloat(conversionForm.conversion_rate)

      if (fromUomId === toUomId) {
        toast.error('Cannot create conversion from UOM to itself')
        return
      }

      if (rate <= 0) {
        toast.error('Conversion rate must be greater than 0')
        return
      }

      if (editingConversionId == null) {
        await createUOMConversion({
          from_uom_id: fromUomId,
          to_uom_id: toUomId,
          conversion_rate: rate,
        })
        toast.success(t.uoms.conversionCreated)
      } else {
        await updateUOMConversion(editingConversionId, {
          conversion_rate: rate,
        })
        toast.success(t.uoms.conversionUpdated)
      }

      // Reload conversions
      const conversionsList = await listUOMConversions()
      setConversions(conversionsList)
      closeConversionForm()
    } catch (error) {
      console.error('[UOMs] Error saving conversion:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save conversion: ${errorMessage}`)
    }
  }

  const handleDeleteConversion = async (conversion: UOMConversionWithNames) => {
    if (!confirm(t.uoms.conversionDeleteConfirm)) {
      return
    }
    try {
      await deleteUOMConversion(conversion.id)
      const conversionsList = await listUOMConversions()
      setConversions(conversionsList)
      toast.success(t.uoms.conversionDeleted)
    } catch (error) {
      console.error('[UOMs] Error deleting conversion:', error)
      toast.error('Failed to delete conversion')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            Units of Measurement
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.uoms.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t.uoms.addUOM}</span>
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

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900 md:text-base">
              {t.uoms.title}
            </h2>
            <p className="text-xs text-slate-500">
              {t.common.showing} {startIndex + 1}-{Math.min(endIndex, filteredUOMs.length)} {t.common.of} {filteredUOMs.length} {filteredUOMs.length === 1 ? 'unit' : 'units'}
              {showDeleted ? ` (${t.common.showDeleted.toLowerCase()})` : ''}
            </p>

            {/* Search */}
            <div className="relative mt-3">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search UOMs by name or abbreviation..."
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
          </div>

          <div className="divide-y divide-slate-100">
            {visibleUOMs.map((uom) => {
              const isDeleted = uom.deleted_at !== null

              return (
                <div
                  key={uom.id}
                  className={`px-4 py-3 ${
                    isDeleted ? 'bg-rose-50/40' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div
                        className={`text-sm font-medium ${
                          isDeleted ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {uom.name}
                      </div>
                      {isDeleted && (
                        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-rose-500">
                          {t.auditTrail.deleted}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-slate-500">
                        {t.common.name}: <span className="font-medium">{uom.abbreviation}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isDeleted && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(uom)}
                            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {t.common.edit}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(uom)}
                            className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                          >
                            {t.common.delete}
                          </button>
                        </>
                      )}
                      {isDeleted && (
                        <button
                          type="button"
                          onClick={() => handleRestore(uom)}
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

            {visibleUOMs.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                {searchQuery
                  ? 'No UOMs match your search criteria.'
                  : 'No UOMs found. Click '}
                {!searchQuery && (
                  <>
                    <span className="font-medium text-slate-900">New UOM</span>{' '}
                    to add one.
                  </>
                )}
              </div>
            )}
          </div>

          {/* Pagination */}
          {filteredUOMs.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">
                    {t.common.showing}{' '}
                    <span className="font-medium text-slate-900">
                      {startIndex + 1}
                    </span>{' '}
                    {t.common.to}{' '}
                    <span className="font-medium text-slate-900">
                      {Math.min(endIndex, filteredUOMs.length)}
                    </span>{' '}
                    {t.common.of}{' '}
                    <span className="font-medium text-slate-900">
                      {filteredUOMs.length}
                    </span>{' '}
                    {t.common.results}
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

        {/* UOM Conversions Section */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  {t.uoms.conversions}
                </h2>
                <p className="text-xs text-slate-500">
                  Define conversion rates between different UOMs
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateConversion}
                className="inline-flex items-center gap-1 rounded-md border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 shadow-sm hover:bg-primary-100"
              >
                <PlusIcon className="h-4 w-4" />
                {t.uoms.addConversion}
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {conversions.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                {t.common.noData}. <span className="font-medium text-slate-900">{t.uoms.addConversion}</span>
              </div>
            ) : (
              paginatedConversions.map((conversion) => (
                <div
                  key={conversion.id}
                  className="px-4 py-3 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">
                        1 {conversion.from_uom_abbreviation} = {conversion.conversion_rate} {conversion.to_uom_abbreviation}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {conversion.from_uom_name} → {conversion.to_uom_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditConversion(conversion)}
                        className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        title="Edit"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteConversion(conversion)}
                        className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Conversion Pagination */}
          {conversions.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">
                    Showing{' '}
                    <span className="font-medium text-slate-900">
                      {conversionStartIndex + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-medium text-slate-900">
                      {Math.min(conversionEndIndex, conversions.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {conversions.length}
                    </span>{' '}
                    results
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">Items per page:</label>
                    <select
                      value={conversionItemsPerPage}
                      onChange={(e) => {
                        setConversionItemsPerPage(Number(e.target.value))
                        setConversionCurrentPage(1)
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
                    onClick={() => setConversionCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={conversionCurrentPage === 1}
                    className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t.common.previous}
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, conversionTotalPages) }, (_, i) => {
                      let pageNum: number
                      if (conversionTotalPages <= 5) {
                        pageNum = i + 1
                      } else if (conversionCurrentPage <= 3) {
                        pageNum = i + 1
                      } else if (conversionCurrentPage >= conversionTotalPages - 2) {
                        pageNum = conversionTotalPages - 4 + i
                      } else {
                        pageNum = conversionCurrentPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setConversionCurrentPage(pageNum)}
                          className={`rounded px-3 py-1 text-xs font-medium ${
                            conversionCurrentPage === pageNum
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
                      setConversionCurrentPage((p) => Math.min(conversionTotalPages, p + 1))
                    }
                    disabled={conversionCurrentPage === conversionTotalPages}
                    className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                  {editingUOM ? t.uoms.editUOM : t.uoms.addUOM}
                </h2>
                {editingUOM && (
                  <p className="text-xs text-slate-500">ID #{editingUOM.id}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.uoms.uomName}
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="e.g., Kilogram, Liter, Piece"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Abbreviation
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={form.abbreviation}
                  onChange={(e) =>
                    setForm({ ...form, abbreviation: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g., KG, L, PCS"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 uppercase"
                />
                <p className="text-[10px] text-slate-500">
                  Abbreviation will be automatically converted to uppercase
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 md:px-4 md:text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:text-sm"
                >
                  {editingUOM ? t.common.save : t.uoms.addUOM}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Conversion Form Modal */}
      {showConversionForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  {editingConversionId == null ? t.uoms.addConversion : t.uoms.editConversion}
                </h2>
                <p className="text-xs text-slate-500">
                  Define how many units of one UOM equal another
                </p>
              </div>
              <button
                type="button"
                onClick={closeConversionForm}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConversionSubmit} className="space-y-4 px-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.uoms.fromUOM} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={conversionForm.from_uom_id}
                    onChange={(e) =>
                      setConversionForm({ ...conversionForm, from_uom_id: e.target.value })
                    }
                    disabled={editingConversionId !== null}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-slate-100"
                  >
                    <option value="">{t.uoms.selectFromUOM}</option>
                    {uoms
                      .filter((u) => u.deleted_at === null)
                      .map((uom) => (
                        <option key={uom.id} value={uom.id}>
                          {uom.name} ({uom.abbreviation})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.uoms.toUOM} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={conversionForm.to_uom_id}
                    onChange={(e) =>
                      setConversionForm({ ...conversionForm, to_uom_id: e.target.value })
                    }
                    disabled={editingConversionId !== null}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-slate-100"
                  >
                    <option value="">{t.uoms.selectFromUOM}</option>
                    {uoms
                      .filter((u) => u.deleted_at === null && u.id.toString() !== conversionForm.from_uom_id)
                      .map((uom) => (
                        <option key={uom.id} value={uom.id}>
                          {uom.name} ({uom.abbreviation})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.uoms.ratio} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={0.0001}
                  step="0.0001"
                  required
                  value={conversionForm.conversion_rate}
                  onChange={(e) =>
                    setConversionForm({ ...conversionForm, conversion_rate: e.target.value })
                  }
                  placeholder="e.g., 1000 (1 KG = 1000 G)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                <p className="text-[10px] text-slate-500">
                  How many units of the "To UOM" equal 1 unit of the "From UOM"
                </p>
                {conversionForm.from_uom_id && conversionForm.to_uom_id && conversionForm.conversion_rate && (
                  <p className="text-[10px] font-medium text-primary-600">
                    1 {uoms.find((u) => u.id.toString() === conversionForm.from_uom_id)?.abbreviation} = {conversionForm.conversion_rate} {uoms.find((u) => u.id.toString() === conversionForm.to_uom_id)?.abbreviation}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeConversionForm}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 md:px-4 md:text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:text-sm"
                >
                  {editingConversionId == null ? t.uoms.addConversion : t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

