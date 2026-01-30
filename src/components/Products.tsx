import { useEffect, useMemo, useState } from 'react'
import {
  ArchiveBoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CurrencyDollarIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PrinterIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import {
  createProduct,
  listProducts,
  restoreProduct,
  softDeleteProduct,
  updateProduct,
} from '../db/products'
import type { ProductRow } from '../db/products'
import {
  getProductSubcategories,
  listSubcategories,
  setProductSubcategories,
} from '../db/categories'
import type { SubcategoryRow } from '../db/categories'
import { listUOMs } from '../db/uoms'
import type { UOMRow } from '../db/uoms'
import { getProductLocationStocks } from '../db/locations'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import BarcodePrint from './BarcodePrint'
import SearchableSelect from './SearchableSelect'
import * as XLSX from 'xlsx'

type Product = ProductRow

type ProductFormState = {
  name: string
  price: string
  barcode: string
  uom_id: string
  subcategoryIds: number[]
}

export default function Products() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [products, setProducts] = useState<Product[]>([])
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([])
  const [uoms, setUOMs] = useState<UOMRow[]>([])
  const [productSubcategoriesMap, setProductSubcategoriesMap] = useState<
    Record<number, SubcategoryRow[]>
  >({})
  const [productLocationStocksMap, setProductLocationStocksMap] = useState<
    Record<
      number,
      Array<{
        location_id: number
        stock: number
        location_name: string
        location_type: string
      }>
    >
  >({})
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [form, setForm] = useState<ProductFormState>({
    name: '',
    price: '',
    barcode: '',
    uom_id: '',
    subcategoryIds: [],
  })
  const [printingBarcode, setPrintingBarcode] = useState<Product | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{
    total: number
    processed: number
    success: number
    errors: number
  } | null>(null)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSubcategoryFilter, setSelectedSubcategoryFilter] =
    useState<number | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const filteredProducts = useMemo(() => {
    let filtered = products.filter((p) =>
      showDeleted ? true : p.deleted_at === null,
    )

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.id.toString().includes(query) ||
          p.price.toString().includes(query) ||
          p.barcode?.toLowerCase().includes(query),
      )
    }

    // Apply subcategory filter
    if (selectedSubcategoryFilter !== null) {
      filtered = filtered.filter((p) =>
        productSubcategoriesMap[p.id]?.some(
          (sub) => sub.id === selectedSubcategoryFilter,
        ),
      )
    }

    return filtered
  }, [
    products,
    showDeleted,
    searchQuery,
    selectedSubcategoryFilter,
    productSubcategoriesMap,
  ])

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedSubcategoryFilter, showDeleted])

  const visibleProducts = paginatedProducts

  const editingProduct =
    editingId != null ? products.find((p) => p.id === editingId) ?? null : null

  // Filter active subcategories for the form
  const activeSubcategories = useMemo(
    () => subcategories.filter((s) => s.deleted_at === null),
    [subcategories],
  )

  const resetForm = () =>
    setForm({
      name: '',
      price: '',
      barcode: '',
      uom_id: '',
      subcategoryIds: [],
    })

  const openCreate = async () => {
    setEditingId(null)
    resetForm()
    // Load subcategories and UOMs
    try {
      const [subs, uomsList] = await Promise.all([
        listSubcategories(),
        listUOMs(),
      ])
      console.log('[Products] Loaded subcategories for create form:', subs.length, subs)
      setSubcategories(subs)
      setUOMs(uomsList)
    } catch (error) {
      console.error('[Products] Error loading subcategories/UOMs:', error)
      // Set empty arrays on error to prevent stale data
      setSubcategories([])
      setUOMs([])
    }
    setShowForm(true)
  }

  const openEdit = async (product: Product) => {
    setEditingId(product.id)
    setForm({
      name: product.name,
      price: product.price.toString(),
      barcode: product.barcode || '',
      uom_id: product.uom_id?.toString() ?? '',
      subcategoryIds: [],
    })
    // Load subcategories, UOMs, and product's subcategories
    try {
      const [subs, uomsList, productSubs] = await Promise.all([
        listSubcategories(),
        listUOMs(),
        getProductSubcategories(product.id),
      ])
      setSubcategories(subs)
      setUOMs(uomsList)
      setForm((prev) => ({
        ...prev,
        subcategoryIds: productSubs.map((s) => s.id),
      }))
    } catch (error) {
      console.error('[Products] Error loading subcategories/UOMs:', error)
    }
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    // Don't clear subcategories/UOMs state - keep them loaded for next time
  }

  const handleChange =
    (field: keyof ProductFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
    }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const run = async () => {
      try {
        const price = parseFloat(form.price.replace(/\./g, '').replace(/,/g, '.') || '0') // Handle 'id-ID' format

        if (editingId == null) {
          console.log('[Products] Creating product:', {
            name: form.name.trim(),
            price,
            uom_id: form.uom_id ? parseInt(form.uom_id, 10) : null,
          })
          const created = await createProduct({
            name: form.name.trim(),
            price,
            barcode: form.barcode.trim() || null,
            uom_id: form.uom_id ? parseInt(form.uom_id, 10) : null,
          })
          console.log('[Products] Product created in DB:', created)

          // Set subcategories for the new product
          if (form.subcategoryIds.length > 0) {
            await setProductSubcategories(created.id, form.subcategoryIds)
          }

          // Load subcategories for the new product
          const subs = await getProductSubcategories(created.id)
          setProductSubcategoriesMap((prev) => ({
            ...prev,
            [created.id]: subs,
          }))

          setProducts((prev) => [...prev, created])
          toast.success(t.products.created)
        } else {
          console.log('[Products] Updating product:', editingId, {
            name: form.name.trim(),
            price,
            uom_id: form.uom_id ? parseInt(form.uom_id, 10) : null,
          })
          const updated = await updateProduct(editingId, {
            name: form.name.trim(),
            price,
            barcode: form.barcode.trim() || null,
            uom_id: form.uom_id ? parseInt(form.uom_id, 10) : null,
          })
          if (updated) {
            console.log('[Products] Product updated in DB:', updated)

            // Update subcategories
            await setProductSubcategories(editingId, form.subcategoryIds)

            // Reload subcategories for the updated product
            const subs = await getProductSubcategories(editingId)
            setProductSubcategoriesMap((prev) => ({
              ...prev,
              [editingId]: subs,
            }))

            setProducts((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p)),
            )
            toast.success(t.products.updated)
          } else {
            console.error(
              '[Products] Update returned null for product ID:',
              editingId,
            )
            toast.error(t.products.updated.replace('successfully', 'failed'))
          }
        }

        setShowForm(false)
      } catch (error) {
        console.error('[Products] Error saving product:', error)
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        toast.error(`Failed to save product: ${errorMessage}`)
      }
    }

    void run()
  }

  const handleSoftDelete = (product: Product) => {
    if (product.deleted_at) return
    if (!confirm(t.products.deleteConfirm)) return
    const run = async () => {
      try {
        console.log('[Products] Soft deleting product:', product.id)
        const updated = await softDeleteProduct(product.id)
        if (updated) {
          console.log('[Products] Product soft deleted in DB:', updated)
          setProducts((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          )
          toast.success(t.products.deleted)
        } else {
          console.error(
            '[Products] Soft delete returned null for product ID:',
            product.id,
          )
          toast.error(t.products.deleted.replace('berhasil', 'gagal').replace('successfully', 'failed'))
        }
      } catch (error) {
        console.error('[Products] Error soft deleting product:', error)
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        toast.error(`${t.products.deleted.replace('berhasil', 'gagal').replace('successfully', 'failed')}: ${errorMessage}`)
      }
    }
    void run()
  }

  const handleRestore = (product: Product) => {
    if (!product.deleted_at) return
    if (!confirm(t.products.restoreConfirm)) return
    const run = async () => {
      try {
        console.log('[Products] Restoring product:', product.id)
        const updated = await restoreProduct(product.id)
        if (updated) {
          console.log('[Products] Product restored in DB:', updated)
          setProducts((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          )
          toast.success(t.products.restored)
        } else {
          console.error(
            '[Products] Restore returned null for product ID:',
            product.id,
          )
          toast.error(t.products.restored.replace('berhasil', 'gagal').replace('successfully', 'failed'))
        }
      } catch (error) {
        console.error('[Products] Error restoring product:', error)
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        toast.error(`${t.products.restored.replace('berhasil', 'gagal').replace('successfully', 'failed')}: ${errorMessage}`)
      }
    }
    void run()
  }

  const handleDownloadTemplate = () => {
    try {
      // Create template data
      const templateData = [
        {
          'Product Name': 'Example Product 1',
          'Price': 100000,
          'Barcode': '1234567890123',
          'UOM ID': '',
          'Subcategory IDs': '',
        },
        {
          'Product Name': 'Example Product 2',
          'Price': 50000,
          'Barcode': '1234567890124',
          'UOM ID': '',
          'Subcategory IDs': '',
        },
      ]

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(templateData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Products Template')

      // Generate filename
      const filename = `products_template_${new Date().toISOString().split('T')[0]}.xlsx`

      // Write file
      XLSX.writeFile(wb, filename)

      toast.success(t.products.templateDownloaded)
    } catch (error) {
      console.error('[Products] Error downloading template:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to download template: ${errorMessage}`)
    }
  }

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const data = e.target?.result
          if (!data) return

          const workbook = XLSX.read(data, { type: 'binary' })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{
            'Product Name': string
            'Price': number | string
            'Barcode'?: string | null
            'UOM ID'?: number | string | null
            'Subcategory IDs'?: string | null
          }>

          if (jsonData.length === 0) {
            toast.error(t.products.noDataInFile)
            event.target.value = ''
            return
          }

          // Validate and prepare data
          const productsToCreate: Array<{
            name: string
            price: number
            barcode: string | null
            uom_id: number | null
            subcategoryIds: number[]
          }> = []

          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i]
            const rowNum = i + 2 // +2 because Excel is 1-indexed and we have header

            // Validate required fields
            if (!row['Product Name'] || !row['Price']) {
              console.warn(`[Products] Skipping row ${rowNum}: missing required fields`)
              continue
            }

            // Parse price
            let price: number
            if (typeof row['Price'] === 'string') {
              price = parseFloat(
                row['Price'].replace(/\./g, '').replace(/,/g, '.') || '0',
              )
            } else {
              price = row['Price'] || 0
            }

            if (isNaN(price) || price <= 0) {
              console.warn(`[Products] Skipping row ${rowNum}: invalid price`)
              continue
            }

            // Parse UOM ID
            let uom_id: number | null = null
            if (row['UOM ID']) {
              const parsed = typeof row['UOM ID'] === 'string'
                ? parseInt(row['UOM ID'], 10)
                : row['UOM ID']
              if (!isNaN(parsed) && parsed > 0) {
                uom_id = parsed
              }
            }

            // Parse Subcategory IDs (comma-separated)
            const subcategoryIds: number[] = []
            if (row['Subcategory IDs']) {
              const ids = String(row['Subcategory IDs'])
                .split(',')
                .map((id) => parseInt(id.trim(), 10))
                .filter((id) => !isNaN(id) && id > 0)
              subcategoryIds.push(...ids)
            }

            productsToCreate.push({
              name: String(row['Product Name']).trim(),
              price,
              barcode: row['Barcode']?.toString().trim() || null,
              uom_id,
              subcategoryIds,
            })
          }

          if (productsToCreate.length === 0) {
            toast.error(t.products.noValidData)
            event.target.value = ''
            return
          }

          // Set progress state
          setBulkUploadProgress({
            total: productsToCreate.length,
            processed: 0,
            success: 0,
            errors: 0,
          })

          // Create products in bulk
          const createdProducts: Product[] = []
          const errors: string[] = []

          for (let i = 0; i < productsToCreate.length; i++) {
            const productData = productsToCreate[i]
            try {
              const created = await createProduct({
                name: productData.name,
                price: productData.price,
                barcode: productData.barcode,
                uom_id: productData.uom_id,
              })

              // Set subcategories if provided
              if (productData.subcategoryIds.length > 0) {
                await setProductSubcategories(created.id, productData.subcategoryIds)
              }

              // Load subcategories for the new product
              const subs = await getProductSubcategories(created.id)
              setProductSubcategoriesMap((prev) => ({
                ...prev,
                [created.id]: subs,
              }))

              createdProducts.push(created)
              setBulkUploadProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      processed: prev.processed + 1,
                      success: prev.success + 1,
                    }
                  : null,
              )
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error)
              errors.push(
                `${productData.name}: ${errorMessage}`,
              )
              setBulkUploadProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      processed: prev.processed + 1,
                      errors: prev.errors + 1,
                    }
                  : null,
              )
              console.error(
                `[Products] Error creating product ${productData.name}:`,
                error,
              )
            }
          }

          // Update products list
          if (createdProducts.length > 0) {
            setProducts((prev) => [...prev, ...createdProducts])
          }

          // Show results
          if (errors.length === 0) {
            toast.success(
              t.products.bulkUploadSuccess.replace(
                '{count}',
                createdProducts.length.toString(),
              ),
            )
          } else {
            toast.success(
              t.products.bulkUploadPartial
                .replace('{success}', createdProducts.length.toString())
                .replace('{errors}', errors.length.toString()),
            )
            console.error('[Products] Bulk upload errors:', errors)
          }

          // Reset progress
          setTimeout(() => {
            setBulkUploadProgress(null)
            setShowBulkUpload(false)
          }, 2000)

          // Reload products to get all data
          const updatedProducts = await listProducts()
          setProducts(updatedProducts)

          // Load subcategories and location stocks for all products
          const subcatMap: Record<number, SubcategoryRow[]> = {}
          const locationStocksMap: Record<
            number,
            Array<{
              location_id: number
              stock: number
              location_name: string
              location_type: string
            }>
          > = {}
          for (const product of updatedProducts) {
            try {
              const [subs, locationStocks] = await Promise.all([
                getProductSubcategories(product.id),
                getProductLocationStocks(product.id),
              ])
              subcatMap[product.id] = subs
              locationStocksMap[product.id] = locationStocks
            } catch (error) {
              console.error(
                `[Products] Error loading data for product ${product.id}:`,
                error,
              )
              subcatMap[product.id] = []
              locationStocksMap[product.id] = []
            }
          }
          setProductSubcategoriesMap(subcatMap)
          setProductLocationStocksMap(locationStocksMap)
        } catch (error) {
          console.error('[Products] Error parsing Excel:', error)
          toast.error(t.products.failedToParseExcel)
        }
      }

      reader.readAsBinaryString(file)
      event.target.value = '' // Reset input
    } catch (error) {
      console.error('[Products] Error importing Excel:', error)
      toast.error(t.products.failedToImport)
    }
  }

  const totalValue = useMemo(
    () =>
      products
        .filter((p) => p.deleted_at === null)
        .reduce((sum, p) => {
          // Calculate value based on location stocks
          const locationStocks = productLocationStocksMap[p.id] || []
          const totalStock = locationStocks.reduce((s, ls) => s + ls.stock, 0)
          return sum + p.price * totalStock
        }, 0),
    [products, productLocationStocksMap],
  )

  const activeCount = useMemo(
    () => products.filter((p) => p.deleted_at === null).length,
    [products],
  )

  useEffect(() => {
    const run = async () => {
      try {
        // Load UOMs
        try {
          const uomsList = await listUOMs()
          setUOMs(uomsList)
        } catch (error) {
          console.error('[Products] Error loading UOMs:', error)
        }

        console.log('[Products] Loading products from database...')
        const rows = await listProducts()
        console.log('[Products] Loaded products from DB:', rows.length, rows)

        if (rows.length === 0) {
          // Seed with a few demo products on first launch
          // console.log('[Products] Database is empty, seeding initial products...')
          // const seeded: Array<{ name: string; price: number; stock: number }> = [
          //   { name: 'iPhone 15 Pro Max', price: 1869, stock: 25 },
          //   { name: 'MacBook Pro 14" M3', price: 2499, stock: 8 },
          //   { name: 'AirPods Pro 2', price: 249, stock: 40 },
          // ]
          // const created: Product[] = []
          // for (const item of seeded) {
          //   const row = await createProduct(item)
          //   console.log('[Products] Created product:', row)
          //   created.push(row)
          // }
          // setProducts(created)
          // console.log('[Products] Seeded products set in state:', created)
        } else {
          setProducts(rows)
          console.log('[Products] Products from DB set in state:', rows)

          // Load subcategories and location stocks for all products
          const subcatMap: Record<number, SubcategoryRow[]> = {}
          const locationStocksMap: Record<
            number,
            Array<{
              location_id: number
              stock: number
              location_name: string
              location_type: string
            }>
          > = {}
          for (const product of rows) {
            try {
              const [subs, locationStocks] = await Promise.all([
                getProductSubcategories(product.id),
                getProductLocationStocks(product.id),
              ])
              subcatMap[product.id] = subs
              locationStocksMap[product.id] = locationStocks
            } catch (error) {
              console.error(
                `[Products] Error loading data for product ${product.id}:`,
                error,
              )
              subcatMap[product.id] = []
              locationStocksMap[product.id] = []
            }
          }
          setProductSubcategoriesMap(subcatMap)
          setProductLocationStocksMap(locationStocksMap)
        }
      } catch (error) {
        console.error('[Products] Error loading products from database:', error)
        // Show error to user or set empty state
        setProducts([])
      }
    }
    void run()
  }, [])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            Products
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.products.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBulkUpload(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 md:px-4 md:py-2 md:text-sm"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            <span>{t.products.bulkUpload}</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t.products.addProduct}</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        {/* Top stats */}
        <section className="mb-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Active Products
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {activeCount}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <ArchiveBoxIcon className="h-5 w-5 text-primary-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Inventory Value
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  Rp {totalValue.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                <CurrencyDollarIcon className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </div>
        </section>

        {/* Products table card */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-3 py-3 md:px-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  Product List
                </h2>
                <p className="text-xs text-slate-500">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} of{' '}
                  {filteredProducts.length} item
                  {filteredProducts.length === 1 ? '' : 's'}
                  {showDeleted ? ' (including deleted)' : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    checked={showDeleted}
                    onChange={(e) => setShowDeleted(e.target.checked)}
                  />
                  <span>Show deleted</span>
                </label>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search products by name, ID, or price..."
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
              <div className="w-full md:w-auto">
                <SearchableSelect
                  options={[
                    { value: '', label: 'All Subcategories' },
                    ...subcategories
                      .filter((s) => s.deleted_at === null)
                      .map((sub) => ({
                        value: sub.id,
                        label: sub.name,
                      })),
                  ]}
                  value={selectedSubcategoryFilter ?? ''}
                  onChange={(val) =>
                    setSelectedSubcategoryFilter(
                      val ? parseInt(String(val), 10) : null,
                    )
                  }
                  placeholder="All Subcategories"
                  className="w-full md:w-[200px]"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                      <th className="px-3 py-2 md:px-4 md:py-3">ID</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">Name</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">Price</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">UOM</th>
                      <th className="hidden px-3 py-2 md:table-cell md:px-4 md:py-3">
                        Created
                      </th>
                  <th className="hidden px-3 py-2 md:table-cell md:px-4 md:py-3">
                    Updated
                  </th>
                  <th className="px-3 py-2 text-right md:px-4 md:py-3">
                    {t.common.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleProducts.map((product) => {
                  const isDeleted = product.deleted_at !== null
                  return (
                    <>
                      <tr
                        key={product.id}
                        className={
                          isDeleted
                            ? 'bg-rose-50/40 text-slate-400'
                            : 'hover:bg-slate-50'
                        }
                      >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        #{product.id}
                      </td>
                      <td className="max-w-xs px-3 py-2 text-xs font-medium text-slate-900 md:px-4 md:py-3 md:text-sm">
                        <div
                          className={
                            isDeleted ? 'line-through text-slate-400' : ''
                          }
                        >
                          {product.name}
                        </div>
                        {isDeleted && (
                          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-rose-500">
                            Deleted
                          </div>
                        )}
                        {!isDeleted &&
                          productSubcategoriesMap[product.id]?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {productSubcategoriesMap[product.id].map(
                                (sub) => (
                                  <span
                                    key={sub.id}
                                    className="inline-flex items-center rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700"
                                  >
                                    {sub.name}
                                  </span>
                                ),
                              )}
                            </div>
                          )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        Rp {product.price.toLocaleString('id-ID')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        {product.uom_id
                          ? uoms.find((u) => u.id === product.uom_id)?.abbreviation ?? '-'
                          : '-'}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:table-cell">
                        <div className="flex flex-col">
                          <span>
                            {new Date(product.created_at).toLocaleDateString('id-ID', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(product.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:table-cell">
                        <div className="flex flex-col">
                          <span>
                            {new Date(product.updated_at).toLocaleDateString('id-ID', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(product.updated_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs md:px-4 md:py-3 md:text-sm">
                        <div className="inline-flex items-center gap-1">
                          {!isDeleted && (
                            <>
                              {productLocationStocksMap[product.id]?.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedProductId(
                                      expandedProductId === product.id ? null : product.id,
                                    )
                                  }
                                  className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  title="View location stocks"
                                >
                                  {expandedProductId === product.id ? (
                                    <ChevronDownIcon className="h-3 w-3" />
                                  ) : (
                                    <ChevronRightIcon className="h-3 w-3" />
                                  )}
                                </button>
                              )}
                              {product.barcode && (
                                <button
                                  type="button"
                                  onClick={() => setPrintingBarcode(product)}
                                  className="inline-flex items-center gap-1 rounded border border-primary-200 px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                                  title={t.products.printBarcode}
                                >
                                  <PrinterIcon className="h-3 w-3" />
                                  {t.products.barcode}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEdit(product)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSoftDelete(product)}
                                className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                {t.common.delete}
                              </button>
                            </>
                          )}
                          {isDeleted && (
                            <button
                              type="button"
                              onClick={() => handleRestore(product)}
                              className="rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                            >
                              {t.common.restore}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!isDeleted &&
                      expandedProductId === product.id &&
                      productLocationStocksMap[product.id]?.length > 0 && (
                        <tr key={`${product.id}-expanded`}>
                          <td colSpan={7} className="bg-slate-50 px-4 py-3">
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <div className="mb-2 text-xs font-semibold text-slate-700">
                                Location Stocks
                              </div>
                              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                {productLocationStocksMap[product.id].map((stock) => (
                                  <div
                                    key={stock.location_id}
                                    className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                                  >
                                    <div>
                                      <div className="text-xs font-medium text-slate-900">
                                        {stock.location_name}
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        {stock.location_type}
                                      </div>
                                    </div>
                                    <div className="text-sm font-semibold text-slate-900">
                                      {stock.stock.toLocaleString('id-ID')}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}

                {visibleProducts.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-xs text-slate-500"
                    >
                      {searchQuery || selectedSubcategoryFilter !== null
                        ? 'No products match your search or filter criteria.'
                        : 'No products found. Click '}
                      {!searchQuery && selectedSubcategoryFilter === null && (
                        <>
                          <span className="font-medium text-slate-900">
                            New Product
                          </span>{' '}
                          to add your first item.
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredProducts.length > 0 && (
            <div className="border-t border-slate-200 px-3 py-3 md:px-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">
                    Showing{' '}
                    <span className="font-medium text-slate-900">
                      {(currentPage - 1) * itemsPerPage + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-medium text-slate-900">
                      {Math.min(currentPage * itemsPerPage, filteredProducts.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {filteredProducts.length}
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
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  {editingProduct ? t.products.editProduct : t.products.addProduct}
                </h2>
                {editingProduct && (
                  <p className="text-xs text-slate-500">
                    ID #{editingProduct.id}
                  </p>
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
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange('name')}
                  placeholder="Product name"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  {t.products.barcode}
                </label>
                <input
                  type="text"
                  value={form.barcode}
                  onChange={handleChange('barcode')}
                  placeholder="Enter barcode (optional)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                <p className="text-xs text-slate-500">
                  Leave empty to skip or enter existing barcode
                </p>
              </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">
                      Price
                    </label>
                    <div className="flex items-center rounded-md border border-slate-300 px-2 shadow-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
                      <span className="text-xs text-slate-500">Rp</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        required
                        value={form.price}
                        onChange={handleChange('price')}
                        className="w-full border-none bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Unit of Measurement
                </label>
                <SearchableSelect
                  options={[
                    { value: '', label: 'No UOM' },
                    ...uoms
                      .filter((u) => u.deleted_at === null)
                      .map((uom) => ({
                        value: uom.id,
                        label: `${uom.name} (${uom.abbreviation})`,
                      })),
                  ]}
                  value={form.uom_id || ''}
                  onChange={(val) =>
                    setForm({ ...form, uom_id: val ? String(val) : '' })
                  }
                  placeholder="No UOM"
                  searchPlaceholder="Search UOM..."
                />
                <p className="text-[10px] text-slate-500">
                  Select a unit of measurement for this product
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Subcategories
                </label>
                <div className="max-h-40 overflow-y-auto rounded-md border border-slate-300 p-2 shadow-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
                  {activeSubcategories.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No subcategories available. Create categories and
                      subcategories first.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {activeSubcategories.map((subcategory) => (
                        <label
                          key={subcategory.id}
                          className="flex items-center gap-2 text-xs text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={form.subcategoryIds.includes(
                              subcategory.id,
                            )}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setForm((prev) => ({
                                  ...prev,
                                  subcategoryIds: [
                                    ...prev.subcategoryIds,
                                    subcategory.id,
                                  ],
                                }))
                              } else {
                                setForm((prev) => ({
                                  ...prev,
                                  subcategoryIds: prev.subcategoryIds.filter(
                                    (id) => id !== subcategory.id,
                                  ),
                                }))
                              }
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span>{subcategory.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">
                  Select one or more subcategories for this product
                </p>
              </div>

              {editingProduct && (
                <div className="grid gap-3 rounded-md bg-slate-50 p-3 text-[10px] text-slate-500 md:grid-cols-2">
                  <div>
                    <div className="font-semibold text-slate-600">
                      Created at
                    </div>
                    <div>
                      {new Date(
                        editingProduct.created_at,
                      ).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-600">
                      Last updated
                    </div>
                    <div>
                      {new Date(
                        editingProduct.updated_at,
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 md:px-4 md:text-sm"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 md:px-4 md:text-sm"
                >
                  {editingProduct ? t.common.save : t.products.addProduct}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {t.products.bulkUpload}
              </h2>
              <button
                onClick={() => {
                  setShowBulkUpload(false)
                  setBulkUploadProgress(null)
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {bulkUploadProgress ? (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-600">
                        {t.products.uploadingProgress}
                      </span>
                      <span className="font-medium text-slate-900">
                        {bulkUploadProgress.processed} / {bulkUploadProgress.total}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-primary-600 transition-all duration-300"
                        style={{
                          width: `${
                            (bulkUploadProgress.processed /
                              bulkUploadProgress.total) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-600">
                        {t.products.success}:{' '}
                      </span>
                      <span className="font-medium text-green-600">
                        {bulkUploadProgress.success}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600">
                        {t.products.errors}:{' '}
                      </span>
                      <span className="font-medium text-rose-600">
                        {bulkUploadProgress.errors}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-slate-50 p-4">
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">
                      {t.products.uploadInstructions}
                    </h3>
                    <ol className="list-inside list-decimal space-y-1 text-sm text-slate-600">
                      <li>{t.products.uploadStep1}</li>
                      <li>{t.products.uploadStep2}</li>
                      <li>{t.products.uploadStep3}</li>
                    </ol>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      {t.products.downloadTemplate}
                    </button>
                    <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700">
                      <ArrowUpTrayIcon className="h-4 w-4" />
                      {t.products.selectFile}
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleBulkUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t.products.requiredColumns}
                    </h4>
                    <ul className="space-y-1 text-xs text-slate-600">
                      <li>
                        <strong>Product Name:</strong> {t.products.required}
                      </li>
                      <li>
                        <strong>Price:</strong> {t.products.required} (
                        {t.products.numericOnly})
                      </li>
                      <li>
                        <strong>Barcode:</strong> {t.common.optional}
                      </li>
                      <li>
                        <strong>UOM ID:</strong> {t.common.optional} (
                        {t.products.existingUOMId})
                      </li>
                      <li>
                        <strong>Subcategory IDs:</strong> {t.common.optional}{' '}
                        ({t.products.commaSeparated})
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barcode Print Modal */}
      {printingBarcode && (
        <BarcodePrint
          product={printingBarcode}
          onClose={() => setPrintingBarcode(null)}
        />
      )}
    </div>
  )
}

