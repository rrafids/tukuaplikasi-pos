import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  createCategory,
  createSubcategory,
  listCategories,
  listSubcategories,
  restoreCategory,
  restoreSubcategory,
  softDeleteCategory,
  softDeleteSubcategory,
  updateCategory,
  updateSubcategory,
} from '../db/categories'
import type {
  CategoryRow,
  SubcategoryRow,
} from '../db/categories'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'

type CategoryFormState = {
  name: string
}

type SubcategoryFormState = {
  category_id: string
  name: string
}

export default function Categories() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showSubcategoryForm, setShowSubcategoryForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingSubcategoryId, setEditingSubcategoryId] =
    useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    name: '',
  })
  const [subcategoryForm, setSubcategoryForm] = useState<SubcategoryFormState>({
    category_id: '',
    name: '',
  })
  
  // Search state
  const [categorySearchQuery, setCategorySearchQuery] = useState('')
  const [subcategorySearchQuery, setSubcategorySearchQuery] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<number | null>(null)
  
  // Pagination state
  const [categoryCurrentPage, setCategoryCurrentPage] = useState(1)
  const [subcategoryCurrentPage, setSubcategoryCurrentPage] = useState(1)
  const [categoryItemsPerPage, setCategoryItemsPerPage] = useState(10)
  const [subcategoryItemsPerPage, setSubcategoryItemsPerPage] = useState(10)

  const filteredCategories = useMemo(() => {
    let filtered = categories.filter((c) => (showDeleted ? true : c.deleted_at === null))
    
    if (categorySearchQuery.trim()) {
      const query = categorySearchQuery.toLowerCase().trim()
      filtered = filtered.filter((c) =>
        c.name.toLowerCase().includes(query) ||
        c.id.toString().includes(query)
      )
    }
    
    return filtered
  }, [categories, showDeleted, categorySearchQuery])

  const filteredSubcategories = useMemo(() => {
    let filtered = subcategories.filter((s) =>
      showDeleted ? true : s.deleted_at === null
    )
    
    if (subcategorySearchQuery.trim()) {
      const query = subcategorySearchQuery.toLowerCase().trim()
      filtered = filtered.filter((s) =>
        s.name.toLowerCase().includes(query) ||
        s.id.toString().includes(query) ||
        getCategoryName(s.category_id).toLowerCase().includes(query)
      )
    }
    
    if (selectedCategoryFilter !== null) {
      filtered = filtered.filter((s) => s.category_id === selectedCategoryFilter)
    }
    
    return filtered
  }, [subcategories, showDeleted, subcategorySearchQuery, selectedCategoryFilter, categories])

  // Pagination calculations
  const categoryTotalPages = Math.ceil(filteredCategories.length / categoryItemsPerPage)
  const categoryStartIndex = (categoryCurrentPage - 1) * categoryItemsPerPage
  const categoryEndIndex = categoryStartIndex + categoryItemsPerPage
  const paginatedCategories = filteredCategories.slice(categoryStartIndex, categoryEndIndex)

  const subcategoryTotalPages = Math.ceil(filteredSubcategories.length / subcategoryItemsPerPage)
  const subcategoryStartIndex = (subcategoryCurrentPage - 1) * subcategoryItemsPerPage
  const subcategoryEndIndex = subcategoryStartIndex + subcategoryItemsPerPage
  const paginatedSubcategories = filteredSubcategories.slice(subcategoryStartIndex, subcategoryEndIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCategoryCurrentPage(1)
  }, [categorySearchQuery, showDeleted])

  useEffect(() => {
    setSubcategoryCurrentPage(1)
  }, [subcategorySearchQuery, selectedCategoryFilter, showDeleted])

  const visibleCategories = paginatedCategories
  const visibleSubcategories = paginatedSubcategories

  const editingCategory =
    editingCategoryId != null
      ? categories.find((c) => c.id === editingCategoryId) ?? null
      : null

  const editingSubcategory =
    editingSubcategoryId != null
      ? subcategories.find((s) => s.id === editingSubcategoryId) ?? null
      : null

  useEffect(() => {
    const load = async () => {
      try {
        const cats = await listCategories()
        const subs = await listSubcategories()
        setCategories(cats)
        setSubcategories(subs)
      } catch (error) {
        console.error('[Categories] Error loading:', error)
      }
    }
    void load()
  }, [])

  const openCreateCategory = () => {
    setEditingCategoryId(null)
    setCategoryForm({ name: '' })
    setShowCategoryForm(true)
  }

  const openEditCategory = (category: CategoryRow) => {
    setEditingCategoryId(category.id)
    setCategoryForm({ name: category.name })
    setShowCategoryForm(true)
  }

  const closeCategoryForm = () => {
    setShowCategoryForm(false)
    setEditingCategoryId(null)
  }

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingCategoryId == null) {
        const created = await createCategory({ name: categoryForm.name.trim() })
        setCategories((prev) => [...prev, created])
        toast.success(t.categories.created)
      } else {
        const updated = await updateCategory(editingCategoryId, {
          name: categoryForm.name.trim(),
        })
        if (updated) {
          setCategories((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c)),
          )
          toast.success(t.categories.updated)
        } else {
          toast.error(t.categories.updated.replace('successfully', 'failed'))
        }
      }
      closeCategoryForm()
    } catch (error) {
      console.error('[Categories] Error saving category:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save category: ${errorMessage}`)
    }
  }

  const handleCategoryDelete = async (category: CategoryRow) => {
    if (category.deleted_at) return
    try {
      const updated = await softDeleteCategory(category.id)
      if (updated) {
        setCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        )
        // Also reload subcategories as they might be affected
        const subs = await listSubcategories()
        setSubcategories(subs)
        toast.success(t.categories.deleted)
      } else {
        toast.error('Failed to delete category')
      }
    } catch (error) {
      console.error('[Categories] Error deleting category:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete category: ${errorMessage}`)
    }
  }

  const handleCategoryRestore = async (category: CategoryRow) => {
    if (!category.deleted_at) return
    try {
      const updated = await restoreCategory(category.id)
      if (updated) {
        setCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        )
        toast.success(t.categories.restored)
      } else {
        toast.error('Failed to restore category')
      }
    } catch (error) {
      console.error('[Categories] Error restoring category:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to restore category: ${errorMessage}`)
    }
  }

  const openCreateSubcategory = () => {
    setEditingSubcategoryId(null)
    setSubcategoryForm({ category_id: '', name: '' })
    setShowSubcategoryForm(true)
  }

  const openEditSubcategory = (subcategory: SubcategoryRow) => {
    setEditingSubcategoryId(subcategory.id)
    setSubcategoryForm({
      category_id: subcategory.category_id.toString(),
      name: subcategory.name,
    })
    setShowSubcategoryForm(true)
  }

  const closeSubcategoryForm = () => {
    setShowSubcategoryForm(false)
    setEditingSubcategoryId(null)
  }

  const handleSubcategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const categoryId = parseInt(subcategoryForm.category_id, 10)
      if (editingSubcategoryId == null) {
        const created = await createSubcategory({
          category_id: categoryId,
          name: subcategoryForm.name.trim(),
        })
        setSubcategories((prev) => [...prev, created])
        toast.success(t.categories.subcategoryCreated)
      } else {
        const updated = await updateSubcategory(editingSubcategoryId, {
          category_id: categoryId,
          name: subcategoryForm.name.trim(),
        })
        if (updated) {
          setSubcategories((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s)),
          )
          toast.success(t.categories.subcategoryUpdated)
        } else {
          toast.error(t.categories.subcategoryUpdated.replace('successfully', 'failed'))
        }
      }
      closeSubcategoryForm()
    } catch (error) {
      console.error('[Categories] Error saving subcategory:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save subcategory: ${errorMessage}`)
    }
  }

  const handleSubcategoryDelete = async (subcategory: SubcategoryRow) => {
    if (subcategory.deleted_at) return
    try {
      const updated = await softDeleteSubcategory(subcategory.id)
      if (updated) {
        setSubcategories((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
        )
        toast.success(t.categories.subcategoryDeleted)
      } else {
        toast.error('Failed to delete subcategory')
      }
    } catch (error) {
      console.error('[Categories] Error deleting subcategory:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete subcategory: ${errorMessage}`)
    }
  }

  const handleSubcategoryRestore = async (subcategory: SubcategoryRow) => {
    if (!subcategory.deleted_at) return
    try {
      const updated = await restoreSubcategory(subcategory.id)
      if (updated) {
        setSubcategories((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
        )
        toast.success(t.categories.subcategoryRestored)
      } else {
        toast.error('Failed to restore subcategory')
      }
    } catch (error) {
      console.error('[Categories] Error restoring subcategory:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to restore subcategory: ${errorMessage}`)
    }
  }

  const getCategoryName = (categoryId: number) => {
    return categories.find((c) => c.id === categoryId)?.name ?? 'Unknown'
  }

  const getSubcategoriesByCategory = (categoryId: number) => {
    return visibleSubcategories.filter((s) => s.category_id === categoryId)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.categories.title} & {t.categories.addSubcategory.replace('Add ', '')}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.categories.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateSubcategory}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t.categories.addSubcategory}</span>
          </button>
          <button
            type="button"
            onClick={openCreateCategory}
            className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t.categories.addCategory}</span>
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

        <div className="grid gap-6 md:grid-cols-2">
          {/* Categories Section */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                {t.categories.title}
              </h2>
              <p className="text-xs text-slate-500">
                {t.common.showing} {categoryStartIndex + 1}-{Math.min(categoryEndIndex, filteredCategories.length)} {t.common.of} {filteredCategories.length} {filteredCategories.length === 1 ? 'category' : 'categories'}
              </p>
              
              {/* Search */}
              <div className="relative mt-3">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={t.categories.searchCategories}
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                {categorySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCategorySearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {visibleCategories.map((category) => {
                const isDeleted = category.deleted_at !== null
                const subcats = getSubcategoriesByCategory(category.id)

                return (
                  <div
                    key={category.id}
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
                          {category.name}
                        </div>
                        {isDeleted && (
                          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-rose-500">
                            {t.auditTrail.deleted}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-slate-500">
                          {subcats.length} {subcats.length === 1 ? t.categories.subcategory : t.categories.subcategories}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!isDeleted && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditCategory(category)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {t.common.edit}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCategoryDelete(category)}
                              className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                            >
                              {t.common.delete}
                            </button>
                          </>
                        )}
                        {isDeleted && (
                          <button
                            type="button"
                            onClick={() => handleCategoryRestore(category)}
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

              {visibleCategories.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  {categorySearchQuery
                    ? t.categories.noCategoriesMatch
                    : `${t.common.noData} `}
                  {!categorySearchQuery && (
                    <>
                      <span className="font-medium text-slate-900">{t.categories.addCategory}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Categories Pagination */}
            {filteredCategories.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-500">
                      {t.common.showing}{' '}
                      <span className="font-medium text-slate-900">
                        {categoryStartIndex + 1}
                      </span>{' '}
                      {t.common.to}{' '}
                      <span className="font-medium text-slate-900">
                        {Math.min(categoryEndIndex, filteredCategories.length)}
                      </span>{' '}
                      {t.common.of}{' '}
                      <span className="font-medium text-slate-900">
                        {filteredCategories.length}
                      </span>{' '}
                      {t.common.results}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">{t.common.itemsPerPage}:</label>
                      <select
                        value={categoryItemsPerPage}
                        onChange={(e) => {
                          setCategoryItemsPerPage(Number(e.target.value))
                          setCategoryCurrentPage(1)
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
                      onClick={() => setCategoryCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={categoryCurrentPage === 1}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.common.previous}
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, categoryTotalPages) }, (_, i) => {
                        let pageNum: number
                        if (categoryTotalPages <= 5) {
                          pageNum = i + 1
                        } else if (categoryCurrentPage <= 3) {
                          pageNum = i + 1
                        } else if (categoryCurrentPage >= categoryTotalPages - 2) {
                          pageNum = categoryTotalPages - 4 + i
                        } else {
                          pageNum = categoryCurrentPage - 2 + i
                        }
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCategoryCurrentPage(pageNum)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                              categoryCurrentPage === pageNum
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
                      onClick={() => setCategoryCurrentPage((p) => Math.min(categoryTotalPages, p + 1))}
                      disabled={categoryCurrentPage === categoryTotalPages}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.common.next}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Subcategories Section */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                {t.categories.addSubcategory.replace('Add ', '')}
              </h2>
              <p className="text-xs text-slate-500">
                {t.common.showing} {subcategoryStartIndex + 1}-{Math.min(subcategoryEndIndex, filteredSubcategories.length)} {t.common.of} {filteredSubcategories.length} {filteredSubcategories.length === 1 ? t.categories.subcategory : t.categories.subcategories}
              </p>
              
              {/* Search and Filter */}
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={t.categories.searchSubcategories}
                    value={subcategorySearchQuery}
                    onChange={(e) => setSubcategorySearchQuery(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                  {subcategorySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSubcategorySearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={selectedCategoryFilter ?? ''}
                    onChange={(e) =>
                      setSelectedCategoryFilter(
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value="">{t.categories.allCategories}</option>
                    {categories
                      .filter((c) => c.deleted_at === null)
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {visibleSubcategories.map((subcategory) => {
                const isDeleted = subcategory.deleted_at !== null

                return (
                  <div
                    key={subcategory.id}
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
                          {subcategory.name}
                        </div>
                        {isDeleted && (
                          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-rose-500">
                            {t.auditTrail.deleted}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-slate-500">
                          Category: {getCategoryName(subcategory.category_id)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!isDeleted && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditSubcategory(subcategory)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {t.common.edit}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSubcategoryDelete(subcategory)}
                              className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                            >
                              {t.common.delete}
                            </button>
                          </>
                        )}
                        {isDeleted && (
                          <button
                            type="button"
                            onClick={() => handleSubcategoryRestore(subcategory)}
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

              {visibleSubcategories.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  {subcategorySearchQuery || selectedCategoryFilter !== null
                    ? 'No subcategories match your search or filter criteria.'
                    : 'No subcategories found. Click '}
                  {!subcategorySearchQuery && selectedCategoryFilter === null && (
                    <>
                      <span className="font-medium text-slate-900">
                        New Subcategory
                      </span>{' '}
                      to add one.
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Subcategories Pagination */}
            {filteredSubcategories.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-500">
                      {t.common.showing}{' '}
                      <span className="font-medium text-slate-900">
                        {subcategoryStartIndex + 1}
                      </span>{' '}
                      {t.common.to}{' '}
                      <span className="font-medium text-slate-900">
                        {Math.min(subcategoryEndIndex, filteredSubcategories.length)}
                      </span>{' '}
                      {t.common.of}{' '}
                      <span className="font-medium text-slate-900">
                        {filteredSubcategories.length}
                      </span>{' '}
                      {t.common.results}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">{t.common.itemsPerPage}:</label>
                      <select
                        value={subcategoryItemsPerPage}
                        onChange={(e) => {
                          setSubcategoryItemsPerPage(Number(e.target.value))
                          setSubcategoryCurrentPage(1)
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
                      onClick={() => setSubcategoryCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={subcategoryCurrentPage === 1}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.common.previous}
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, subcategoryTotalPages) }, (_, i) => {
                        let pageNum: number
                        if (subcategoryTotalPages <= 5) {
                          pageNum = i + 1
                        } else if (subcategoryCurrentPage <= 3) {
                          pageNum = i + 1
                        } else if (subcategoryCurrentPage >= subcategoryTotalPages - 2) {
                          pageNum = subcategoryTotalPages - 4 + i
                        } else {
                          pageNum = subcategoryCurrentPage - 2 + i
                        }
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setSubcategoryCurrentPage(pageNum)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                              subcategoryCurrentPage === pageNum
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
                      onClick={() => setSubcategoryCurrentPage((p) => Math.min(subcategoryTotalPages, p + 1))}
                      disabled={subcategoryCurrentPage === subcategoryTotalPages}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.common.next}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  {editingCategory ? 'Edit Category' : 'New Category'}
                </h2>
                {editingCategory && (
                  <p className="text-xs text-slate-500">ID #{editingCategory.id}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeCategoryForm}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCategorySubmit} className="space-y-4 px-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.categories.categoryName}
                </label>
                <input
                  type="text"
                  required
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, name: e.target.value })
                  }
                  placeholder="e.g., Electronics, Clothing"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCategoryForm}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 md:px-4 md:text-sm"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:text-sm"
                >
                  {editingCategory ? t.common.save : t.categories.addCategory}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subcategory Form Modal */}
      {showSubcategoryForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  {editingSubcategory ? 'Edit Subcategory' : 'New Subcategory'}
                </h2>
                {editingSubcategory && (
                  <p className="text-xs text-slate-500">
                    ID #{editingSubcategory.id}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeSubcategoryForm}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubcategorySubmit}
              className="space-y-4 px-4 py-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Category
                </label>
                <div className="relative">
                  <select
                    required
                    value={subcategoryForm.category_id}
                    onChange={(e) =>
                      setSubcategoryForm({
                        ...subcategoryForm,
                        category_id: e.target.value,
                      })
                    }
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value="">{t.categories.selectCategory}</option>
                    {categories
                      .filter((c) => c.deleted_at === null)
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.categories.subcategoryName}
                </label>
                <input
                  type="text"
                  required
                  value={subcategoryForm.name}
                  onChange={(e) =>
                    setSubcategoryForm({ ...subcategoryForm, name: e.target.value })
                  }
                  placeholder="e.g., Smartphones, T-Shirts"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeSubcategoryForm}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 md:px-4 md:text-sm"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:text-sm"
                >
                  {editingSubcategory ? 'Save changes' : 'Create subcategory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

