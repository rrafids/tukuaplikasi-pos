import { useEffect, useMemo, useState } from 'react'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  createUser,
  listUsers,
  restoreUser,
  softDeleteUser,
  updateUser,
} from '../db/users'
import type { UserWithRole } from '../db/users'
import { listRoles } from '../db/roles'
import type { RoleWithPermissions } from '../db/roles'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'

type UserFormState = {
  username: string
  password: string
  role_id: string
  is_superadmin: boolean
}

export default function Users() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [roles, setRoles] = useState<RoleWithPermissions[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [form, setForm] = useState<UserFormState>({
    username: '',
    password: '',
    role_id: '',
    is_superadmin: false,
  })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<number | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const filteredUsers = useMemo(() => {
    let filtered = users.filter((u) => (showDeleted ? true : u.deleted_at === null))

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (u) =>
          u.username.toLowerCase().includes(query) ||
          u.role_name?.toLowerCase().includes(query) ||
          u.id.toString().includes(query),
      )
    }

    if (roleFilter !== null) {
      filtered = filtered.filter((u) => u.role_id === roleFilter)
    }

    return filtered
  }, [users, showDeleted, searchQuery, roleFilter])

  // Pagination calculations
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, roleFilter, showDeleted])

  const visibleUsers = paginatedUsers

  useEffect(() => {
    const load = async () => {
      try {
        const [usersList, rolesList] = await Promise.all([
          listUsers(),
          listRoles(),
        ])
        setUsers(usersList)
        setRoles(rolesList)
      } catch (error) {
        console.error('[Users] Error loading:', error)
        toast.error('Failed to load users')
      }
    }
    void load()
  }, [toast])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      username: '',
      password: '',
      role_id: '',
      is_superadmin: false,
    })
    setShowForm(true)
  }

  const openEdit = (user: UserWithRole) => {
    setEditingId(user.id)
    setForm({
      username: user.username,
      password: '', // Don't pre-fill password
      role_id: user.role_id?.toString() || '',
      is_superadmin: user.is_superadmin === 1,
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

  const resetForm = () => {
    setForm({
      username: '',
      password: '',
      role_id: '',
      is_superadmin: false,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId == null) {
        if (!form.password.trim()) {
          toast.error('Password is required')
          return
        }
        const created = await createUser({
          username: form.username.trim(),
          password: form.password,
          role_id: form.role_id ? parseInt(form.role_id) : null,
          is_superadmin: form.is_superadmin,
        })
        setUsers((prev) => [...prev, created])
        toast.success(t.users.created)
      } else {
        const updateData: {
          username?: string
          password?: string
          role_id?: number | null
          is_superadmin?: boolean
        } = {
          username: form.username.trim(),
          role_id: form.role_id ? parseInt(form.role_id) : null,
          is_superadmin: form.is_superadmin,
        }
        // Only update password if provided
        if (form.password.trim()) {
          updateData.password = form.password
        }
        const updated = await updateUser(editingId, updateData)
        if (updated) {
          setUsers((prev) =>
            prev.map((u) => (u.id === updated.id ? updated : u)),
          )
          toast.success(t.users.updated)
        } else {
          toast.error(t.users.updated.replace('successfully', 'failed').replace('berhasil', 'gagal'))
        }
      }
      closeForm()
      resetForm()
    } catch (error) {
      console.error('[Users] Error saving user:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save user: ${errorMessage}`)
    }
  }

  const handleDelete = async (user: UserWithRole) => {
    if (user.deleted_at) return
    if (user.id === currentUser?.id) {
      toast.error('You cannot delete your own account')
      return
    }
    if (!confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      return
    }
    try {
      const updated = await softDeleteUser(user.id)
      if (updated) {
        setUsers((prev) =>
          prev.map((u) => (u.id === updated.id ? { ...updated, role_name: u.role_name, role_permissions: u.role_permissions } : u)),
        )
        toast.success(t.users.deleted)
      } else {
        toast.error('Failed to delete user')
      }
    } catch (error) {
      console.error('[Users] Error deleting user:', error)
      toast.error('Failed to delete user')
    }
  }

  const handleRestore = async (user: UserWithRole) => {
    if (!user.deleted_at) return
    try {
      const restored = await restoreUser(user.id)
      if (restored) {
        setUsers((prev) =>
          prev.map((u) => (u.id === restored.id ? { ...restored, role_name: u.role_name, role_permissions: u.role_permissions } : u)),
        )
        toast.success(t.users.restored)
      } else {
        toast.error('Failed to restore user')
      }
    } catch (error) {
      console.error('[Users] Error restoring user:', error)
      toast.error('Failed to restore user')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.users.title}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.users.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDeleted(!showDeleted)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium md:px-4 md:py-2 md:text-sm ${showDeleted
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
            <span>{t.users.addUser}</span>
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
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              {/* Filters */}
              <div className="grid gap-2 md:grid-cols-2">
                <div className="relative">
                  <select
                    value={roleFilter ?? ''}
                    onChange={(e) => {
                      setRoleFilter(e.target.value ? parseInt(e.target.value) : null)
                      setCurrentPage(1)
                    }}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
                  >
                    <option value="">{t.common.all} Roles</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 md:px-4 md:py-3">ID</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">{t.users.username}</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">{t.users.role}</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Superadmin</th>
                  <th className="px-3 py-2 text-right md:px-4 md:py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleUsers.map((user) => {
                  const isDeleted = user.deleted_at !== null
                  return (
                    <tr
                      key={user.id}
                      className={
                        isDeleted
                          ? 'bg-rose-50/40 text-slate-400'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {user.id}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {user.username}
                        {user.id === currentUser?.id && (
                          <span className="ml-2 text-xs text-primary-600">(You)</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {user.is_superadmin === 1 ? (
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                            Superadmin
                          </span>
                        ) : user.role_name ? (
                          <span className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-800">
                            {user.role_name}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t.users.role} -</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {user.is_superadmin === 1 ? (
                          <span className="text-emerald-600">Yes</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs md:px-4 md:py-3 md:text-sm">
                        <div className="inline-flex items-center gap-1">
                          {!isDeleted && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(user)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              {user.id !== currentUser?.id && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(user)}
                                  className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                          {isDeleted && (
                            <button
                              type="button"
                              onClick={() => handleRestore(user)}
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
                {visibleUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                      {searchQuery || roleFilter !== null
                        ? 'No users match your search or filter criteria.'
                        : 'No users found. Click '}
                      {!searchQuery && roleFilter === null && (
                        <>
                          <span className="font-medium text-slate-900">New User</span> to create one.
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredUsers.length > 0 && (
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
                      {Math.min(endIndex, filteredUsers.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {filteredUsers.length}
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
                          className={`rounded px-3 py-1 text-xs font-medium ${currentPage === pageNum
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
                {editingId == null ? t.users.addUser : t.users.editUser}
              </h2>
              <button
                type="button"
                onClick={handleCloseForm}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex h-[calc(100%-57px)] flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.username}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, username: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.users.password} {editingId != null && <span className="text-slate-500">(leave blank to keep current)</span>}
                    {editingId == null && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="password"
                    required={editingId == null}
                    value={form.password}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, password: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Role
                  </label>
                  <select
                    value={form.role_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, role_id: e.target.value }))
                    }
                    disabled={form.is_superadmin}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-slate-100"
                  >
                    <option value="">{t.users.selectRole}</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_superadmin"
                    checked={form.is_superadmin}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        is_superadmin: e.target.checked,
                        role_id: e.target.checked ? '' : prev.role_id,
                      }))
                    }
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label
                    htmlFor="is_superadmin"
                    className="text-xs font-medium text-slate-700"
                  >
                    {t.users.isSuperadmin}
                  </label>
                </div>

              </div>

              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCloseForm}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                  >
                    {editingId == null ? 'Create User' : 'Update User'}
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

