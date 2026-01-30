import { useEffect, useMemo, useState } from 'react'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  createRole,
  listRoles,
  restoreRole,
  softDeleteRole,
  updateRole,
  AVAILABLE_VIEWS,
  type ViewName,
} from '../db/roles'
import type { RoleWithPermissions } from '../db/roles'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'

type RoleFormState = {
  name: string
  description: string
  permissions: string[]
}

export default function Roles() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [roles, setRoles] = useState<RoleWithPermissions[]>([])
  
  const VIEW_LABELS: Record<ViewName, string> = {
    dashboard: t.nav.dashboard,
    products: t.nav.products,
    categories: t.nav.categories,
    uoms: t.nav.uoms,
    locations: t.nav.locations,
    'product-location-stocks': t.nav.locationStocks,
    procurements: t.nav.procurements,
    disposals: t.nav.disposals,
    sales: t.nav.sales,
    'stock-movements': t.nav.stockMovements,
    'stock-monitoring': t.nav.stockMonitoring,
    'stock-opname': t.nav.stockOpname,
    'audit-trail': t.nav.auditTrail,
  }
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [form, setForm] = useState<RoleFormState>({
    name: '',
    description: '',
    permissions: [],
  })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const filteredRoles = useMemo(() => {
    let filtered = roles.filter((r) => (showDeleted ? true : r.deleted_at === null))

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.description?.toLowerCase().includes(query) ||
          r.id.toString().includes(query),
      )
    }

    return filtered
  }, [roles, showDeleted, searchQuery])

  // Pagination calculations
  const totalPages = Math.ceil(filteredRoles.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedRoles = filteredRoles.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, showDeleted])

  const visibleRoles = paginatedRoles

  useEffect(() => {
    const load = async () => {
      try {
        const rolesList = await listRoles()
        setRoles(rolesList)
      } catch (error) {
        console.error('[Roles] Error loading:', error)
        toast.error('Failed to load roles')
      }
    }
    void load()
  }, [toast])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      name: '',
      description: '',
      permissions: [],
    })
    setShowForm(true)
  }

  const openEdit = (role: RoleWithPermissions) => {
    setEditingId(role.id)
    setForm({
      name: role.name,
      description: role.description || '',
      permissions: [...role.permissions],
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      permissions: [],
    })
  }

  const togglePermission = (viewName: string) => {
    setForm((prev) => {
      if (prev.permissions.includes(viewName)) {
        return {
          ...prev,
          permissions: prev.permissions.filter((p) => p !== viewName),
        }
      } else {
        return {
          ...prev,
          permissions: [...prev.permissions, viewName],
        }
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId == null) {
        const created = await createRole({
          name: form.name.trim(),
          description: form.description.trim() || null,
          permissions: form.permissions,
        })
        setRoles((prev) => [...prev, created])
        toast.success(t.roles.created)
      } else {
        const updated = await updateRole(editingId, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          permissions: form.permissions,
        })
        if (updated) {
          setRoles((prev) =>
            prev.map((r) => (r.id === updated.id ? updated : r)),
          )
          toast.success(t.roles.updated)
        } else {
          toast.error(t.roles.updated.replace('successfully', 'failed').replace('berhasil', 'gagal'))
        }
      }
      closeForm()
      resetForm()
    } catch (error) {
      console.error('[Roles] Error saving role:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save role: ${errorMessage}`)
    }
  }

  const handleDelete = async (role: RoleWithPermissions) => {
    if (role.deleted_at) return
    if (!confirm(`Are you sure you want to delete role "${role.name}"?`)) {
      return
    }
    try {
      const updated = await softDeleteRole(role.id)
      if (updated) {
        setRoles((prev) =>
          prev.map((r) => (r.id === updated.id ? { ...updated, permissions: r.permissions } : r)),
        )
        toast.success(t.roles.deleted)
      } else {
        toast.error('Failed to delete role')
      }
    } catch (error) {
      console.error('[Roles] Error deleting role:', error)
      toast.error('Failed to delete role')
    }
  }

  const handleRestore = async (role: RoleWithPermissions) => {
    if (!role.deleted_at) return
    try {
      const restored = await restoreRole(role.id)
      if (restored) {
        setRoles((prev) =>
          prev.map((r) => (r.id === restored.id ? { ...restored, permissions: r.permissions } : r)),
        )
        toast.success(t.roles.restored)
      } else {
        toast.error('Failed to restore role')
      }
    } catch (error) {
      console.error('[Roles] Error restoring role:', error)
      toast.error('Failed to restore role')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.roles.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.roles.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDeleted(!showDeleted)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium md:px-4 md:py-2 md:text-sm ${
              showDeleted
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {showDeleted ? 'Show Active' : 'Show Deleted'}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t.roles.addRole}</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        {/* Filters */}
        <section className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-3 md:p-4">
            <div className="flex flex-col gap-3">
              {/* Search bar */}
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search roles..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 md:px-4 md:py-3">ID</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Name</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">{t.common.description}</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">{t.roles.permissions}</th>
                  <th className="px-3 py-2 text-right md:px-4 md:py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRoles.map((role) => {
                  const isDeleted = role.deleted_at !== null
                  return (
                    <tr
                      key={role.id}
                      className={
                        isDeleted
                          ? 'bg-rose-50/40 text-slate-400'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {role.id}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {role.name}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {role.description || (
                          <span className="text-slate-400">{t.roles.noDescription}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-wrap gap-1">
                          {role.permissions.length > 0 ? (
                            role.permissions.map((perm) => (
                              <span
                                key={perm}
                                className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800"
                              >
                                {VIEW_LABELS[perm as ViewName] || perm}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">{t.roles.noPermissions}</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs md:px-4 md:py-3 md:text-sm">
                        <div className="inline-flex items-center gap-1">
                          {!isDeleted && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(role)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(role)}
                                className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {isDeleted && (
                            <button
                              type="button"
                              onClick={() => handleRestore(role)}
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
                {visibleRoles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                      {searchQuery
                        ? 'No roles match your search criteria.'
                        : 'No roles found. Click '}
                      {!searchQuery && (
                        <>
                          <span className="font-medium text-slate-900">New Role</span> to create one.
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredRoles.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">
                    Showing{' '}
                    <span className="font-medium text-slate-900">
                      {startIndex + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-medium text-slate-900">
                      {Math.min(endIndex, filteredRoles.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {filteredRoles.length}
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
        </section>
      </main>

      {/* Slide-over form */}
      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-end bg-black/20">
          <div className="h-full w-full max-w-2xl border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingId == null ? t.roles.addRole : t.roles.editRole}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex h-[calc(100%-57px)] flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.roles.roleName} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Permissions
                  </label>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-4 max-h-64 overflow-y-auto">
                    {AVAILABLE_VIEWS.map((viewName) => (
                      <label
                        key={viewName}
                        className="flex items-center gap-2 cursor-pointer rounded p-2 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(viewName)}
                          onChange={() => togglePermission(viewName)}
                          className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-xs text-slate-700">
                          {VIEW_LABELS[viewName]}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Select which menu items users with this role can access
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
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
                    className="flex-1 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                  >
                    {editingId == null ? 'Create Role' : 'Update Role'}
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

