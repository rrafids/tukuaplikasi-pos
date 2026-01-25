import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { listProducts } from '../db/products'
import type { ProductRow } from '../db/products'
import { listLocations } from '../db/locations'
import type { LocationRow } from '../db/locations'
import {
  deleteProductLocationStock,
  getAllProductLocationStocks,
  setProductLocationStock,
} from '../db/locations'
import { listUOMs, getUOMConversion } from '../db/uoms'
import type { UOMRow } from '../db/uoms'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import * as XLSX from 'xlsx'

type ProductLocationStockFormState = {
  product_id: string
  location_id: string
  stock: string
}

export default function ProductLocationStocks() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [uoms, setUOMs] = useState<UOMRow[]>([])
  const [stocks, setStocks] = useState<
    Array<{
      product_id: number
      location_id: number
      stock: number
      product_name: string
      location_name: string
      location_type: string
      product_uom_id: number | null
    }>
  >([])
  const [showForm, setShowForm] = useState(false)
  const [editingStock, setEditingStock] = useState<{
    product_id: number
    location_id: number
  } | null>(null)
  const [form, setForm] = useState<ProductLocationStockFormState>({
    product_id: '',
    location_id: '',
    stock: '',
  })
  const [availableStock, setAvailableStock] = useState<number | null>(null)
  const [stockError, setStockError] = useState<string>('')

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProductFilter, setSelectedProductFilter] = useState<number | null>(null)
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<number | null>(null)
  const [selectedUOMFilter, setSelectedUOMFilter] = useState<number | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Bulk upload state
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{
    total: number
    processed: number
    success: number
    errors: number
  } | null>(null)

  // Calculate converted stocks when UOM filter is selected
  const stocksWithConversions = useMemo(() => {
    return stocks.map((stock) => ({
      ...stock,
      convertedStock: null as number | null,
      conversionError: null as string | null,
    }))
  }, [stocks])

  // Calculate conversions for all stocks when UOM filter changes
  const [stocksWithConvertedValues, setStocksWithConvertedValues] = useState<
    Array<{
      product_id: number
      location_id: number
      stock: number
      product_name: string
      location_name: string
      location_type: string
      product_uom_id: number | null
      convertedStock: number | null
      conversionError: string | null
    }>
  >(stocksWithConversions)

  useEffect(() => {
    const calculateConversions = async () => {
      if (!selectedUOMFilter) {
        setStocksWithConvertedValues(stocksWithConversions.map((s) => ({
          ...s,
          convertedStock: null,
          conversionError: null,
        })))
        return
      }

      const converted = await Promise.all(
        stocksWithConversions.map(async (stock) => {
          if (!stock.product_uom_id) {
            return {
              ...stock,
              convertedStock: null,
              conversionError: 'No base UOM',
            }
          }

          if (selectedUOMFilter === stock.product_uom_id) {
            // Same UOM, no conversion needed
            return {
              ...stock,
              convertedStock: stock.stock,
              conversionError: null,
            }
          }

          // Convert from product's base UOM to selected UOM
          try {
            const rate = await getUOMConversion(stock.product_uom_id, selectedUOMFilter)
            if (rate !== null) {
              return {
                ...stock,
                convertedStock: stock.stock * rate,
                conversionError: null,
              }
            } else {
              return {
                ...stock,
                convertedStock: null,
                conversionError: 'No conversion',
              }
            }
          } catch (error) {
            return {
              ...stock,
              convertedStock: null,
              conversionError: 'Error',
            }
          }
        }),
      )

      setStocksWithConvertedValues(converted)
    }

    void calculateConversions()
  }, [selectedUOMFilter, stocksWithConversions])

  const filteredStocks = useMemo(() => {
    let filtered = stocksWithConvertedValues

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (s) =>
          s.product_name.toLowerCase().includes(query) ||
          s.location_name.toLowerCase().includes(query) ||
          s.location_type.toLowerCase().includes(query) ||
          s.stock.toString().includes(query),
      )
    }

    if (selectedProductFilter !== null) {
      filtered = filtered.filter((s) => s.product_id === selectedProductFilter)
    }

    if (selectedLocationFilter !== null) {
      filtered = filtered.filter((s) => s.location_id === selectedLocationFilter)
    }

    return filtered
  }, [stocksWithConvertedValues, searchQuery, selectedProductFilter, selectedLocationFilter])

  // Pagination calculations
  const totalPages = Math.ceil(filteredStocks.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedStocks = filteredStocks.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedProductFilter, selectedLocationFilter, selectedUOMFilter])

  const visibleStocks = paginatedStocks

  useEffect(() => {
    const load = async () => {
      try {
        const [productsList, locationsList, uomsList, stocksList] = await Promise.all([
          listProducts(),
          listLocations(),
          listUOMs(),
          getAllProductLocationStocks(),
        ])
        setProducts(productsList.filter((p) => p.deleted_at === null))
        setLocations(locationsList.filter((l) => l.deleted_at === null))
        setUOMs(uomsList.filter((u) => u.deleted_at === null))
        setStocks(stocksList)
      } catch (error) {
        console.error('[ProductLocationStocks] Error loading:', error)
      }
    }
    void load()
  }, [])

  const openCreate = () => {
    setEditingStock(null)
    setForm({ product_id: '', location_id: '', stock: '' })
    setAvailableStock(null)
    setStockError('')
    setShowForm(true)
  }

  const openEdit = async (stock: {
    product_id: number
    location_id: number
    stock: number
  }) => {
    setEditingStock({
      product_id: stock.product_id,
      location_id: stock.location_id,
    })
    setForm({
      product_id: stock.product_id.toString(),
      location_id: stock.location_id.toString(),
      stock: stock.stock.toString(),
    })
    setStockError('')
    setAvailableStock(null) // No limit on stock since it's location-based only
    
    setShowForm(true)
  }

  // Update when product is selected
  const handleProductChange = async (productId: string) => {
    setForm({ ...form, product_id: productId, location_id: form.location_id, stock: '' })
    setStockError('')
    setAvailableStock(null) // No limit on stock since it's location-based only
  }

  // Update when location changes
  const handleLocationChange = async (locationId: string) => {
    setForm({ ...form, location_id: locationId })
    setStockError('')
    setAvailableStock(null) // No limit on stock since it's location-based only
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingStock(null)
    setAvailableStock(null)
    setStockError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStockError('')
    
    try {
      const productId = parseInt(form.product_id, 10)
      const locationId = parseInt(form.location_id, 10)
      const stock = parseInt(form.stock || '0', 10)

      // Validate stock input
      if (stock < 0) {
        setStockError('Stock cannot be negative')
        return
      }

      await setProductLocationStock(productId, locationId, stock)

      // Reload stocks
      const stocksList = await getAllProductLocationStocks()
      setStocks(stocksList)

      toast.success(
        editingStock
          ? t.locationStocks.updated
          : t.locationStocks.created,
      )
      closeForm()
    } catch (error) {
      console.error('[ProductLocationStocks] Error saving stock:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save stock: ${errorMessage}`)
    }
  }

  const handleDelete = async (stock: {
    product_id: number
    location_id: number
  }) => {
    if (
      !confirm(
        'Are you sure you want to delete this stock record? This will remove the stock entry for this product at this location.',
      )
    ) {
      return
    }

    try {
      await deleteProductLocationStock(stock.product_id, stock.location_id)

      // Reload stocks
      const stocksList = await getAllProductLocationStocks()
      setStocks(stocksList)
      toast.success(t.locationStocks.deleted)
    } catch (error) {
      console.error('[ProductLocationStocks] Error deleting stock:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete stock: ${errorMessage}`)
    }
  }

  const totalStock = useMemo(
    () => filteredStocks.reduce((sum, s) => sum + s.stock, 0),
    [filteredStocks],
  )

  const handleDownloadTemplate = () => {
    try {
      // Create template data
      const templateData = [
        {
          'Product ID': 1,
          'Location ID': 1,
          'Stock': 100,
        },
        {
          'Product ID': 2,
          'Location ID': 1,
          'Stock': 50,
        },
      ]

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(templateData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Location Stocks Template')

      // Generate filename
      const filename = `location_stocks_template_${new Date().toISOString().split('T')[0]}.xlsx`

      // Write file
      XLSX.writeFile(wb, filename)

      toast.success(t.locationStocks.templateDownloaded)
    } catch (error) {
      console.error('[ProductLocationStocks] Error downloading template:', error)
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
            'Product ID': number | string
            'Location ID': number | string
            'Stock': number | string
          }>

          if (jsonData.length === 0) {
            toast.error(t.locationStocks.noDataInFile)
            event.target.value = ''
            return
          }

          // Validate and prepare data
          const stocksToUpdate: Array<{
            product_id: number
            location_id: number
            stock: number
          }> = []

          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i]
            const rowNum = i + 2 // +2 because Excel is 1-indexed and we have header

            // Validate required fields
            if (row['Product ID'] === undefined || row['Location ID'] === undefined || row['Stock'] === undefined) {
              console.warn(`[ProductLocationStocks] Skipping row ${rowNum}: missing required fields`)
              continue
            }

            // Parse Product ID
            let productId: number
            if (typeof row['Product ID'] === 'string') {
              productId = parseInt(row['Product ID'], 10)
            } else {
              productId = row['Product ID'] || 0
            }

            if (isNaN(productId) || productId <= 0) {
              console.warn(`[ProductLocationStocks] Skipping row ${rowNum}: invalid Product ID`)
              continue
            }

            // Parse Location ID
            let locationId: number
            if (typeof row['Location ID'] === 'string') {
              locationId = parseInt(row['Location ID'], 10)
            } else {
              locationId = row['Location ID'] || 0
            }

            if (isNaN(locationId) || locationId <= 0) {
              console.warn(`[ProductLocationStocks] Skipping row ${rowNum}: invalid Location ID`)
              continue
            }

            // Parse Stock
            let stock: number
            if (typeof row['Stock'] === 'string') {
              stock = parseFloat(
                row['Stock'].replace(/\./g, '').replace(/,/g, '.') || '0',
              )
            } else {
              stock = row['Stock'] || 0
            }

            if (isNaN(stock) || stock < 0) {
              console.warn(`[ProductLocationStocks] Skipping row ${rowNum}: invalid Stock`)
              continue
            }

            // Verify product and location exist
            const productExists = products.some((p) => p.id === productId)
            const locationExists = locations.some((l) => l.id === locationId)

            if (!productExists) {
              console.warn(`[ProductLocationStocks] Skipping row ${rowNum}: Product ID ${productId} not found`)
              continue
            }

            if (!locationExists) {
              console.warn(`[ProductLocationStocks] Skipping row ${rowNum}: Location ID ${locationId} not found`)
              continue
            }

            stocksToUpdate.push({
              product_id: productId,
              location_id: locationId,
              stock: Math.floor(stock), // Stock should be integer
            })
          }

          if (stocksToUpdate.length === 0) {
            toast.error(t.locationStocks.noValidData)
            event.target.value = ''
            return
          }

          // Set progress state
          setBulkUploadProgress({
            total: stocksToUpdate.length,
            processed: 0,
            success: 0,
            errors: 0,
          })

          // Update stocks in bulk
          const errors: string[] = []
          let successCount = 0

          for (let i = 0; i < stocksToUpdate.length; i++) {
            const stockData = stocksToUpdate[i]
            try {
              await setProductLocationStock(
                stockData.product_id,
                stockData.location_id,
                stockData.stock,
              )
              successCount++
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
                `Product ${stockData.product_id} - Location ${stockData.location_id}: ${errorMessage}`,
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
                `[ProductLocationStocks] Error updating stock Product ${stockData.product_id} - Location ${stockData.location_id}:`,
                error,
              )
            }
          }

          // Reload stocks
          const stocksList = await getAllProductLocationStocks()
          setStocks(stocksList)

          // Show results
          if (errors.length === 0) {
            toast.success(
              t.locationStocks.bulkUploadSuccess.replace(
                '{count}',
                successCount.toString(),
              ),
            )
          } else {
            toast.success(
              t.locationStocks.bulkUploadPartial
                .replace('{success}', successCount.toString())
                .replace('{errors}', errors.length.toString()),
            )
            console.error('[ProductLocationStocks] Bulk upload errors:', errors)
          }

          // Reset progress
          setTimeout(() => {
            setBulkUploadProgress(null)
            setShowBulkUpload(false)
          }, 2000)
        } catch (error) {
          console.error('[ProductLocationStocks] Error parsing Excel:', error)
          toast.error(t.locationStocks.failedToParseExcel)
        }
      }

      reader.readAsBinaryString(file)
      event.target.value = '' // Reset input
    } catch (error) {
      console.error('[ProductLocationStocks] Error importing Excel:', error)
      toast.error(t.locationStocks.failedToImport)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {t.nav.locationStocks}
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.locationStocks.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBulkUpload(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 md:px-4 md:py-2 md:text-sm"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            <span>{t.locationStocks.bulkUpload}</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 md:px-4 md:py-2 md:text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span>New Stock Entry</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        {/* Stats */}
        <section className="mb-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t.locationStocks.totalStock}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalStock.toLocaleString('id-ID', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                  {selectedUOMFilter && (
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      ({uoms.find((u) => u.id === selectedUOMFilter)?.abbreviation})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                <span className="text-lg">📦</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900 md:text-base">
              Stock Entries
            </h2>
            <p className="text-xs text-slate-500">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredStocks.length)} of{' '}
              {filteredStocks.length} entr{filteredStocks.length === 1 ? 'y' : 'ies'}
            </p>

            {/* Search and Filter */}
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product, location, or stock..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
                  value={selectedProductFilter ?? ''}
                  onChange={(e) =>
                    setSelectedProductFilter(
                      e.target.value ? parseInt(e.target.value, 10) : null,
                    )
                  }
                  className="appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                  onChange={(e) =>
                    setSelectedLocationFilter(
                      e.target.value ? parseInt(e.target.value, 10) : null,
                    )
                  }
                  className="appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">All Locations</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({location.type})
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <div className="relative">
                <select
                  value={selectedUOMFilter ?? ''}
                  onChange={(e) =>
                    setSelectedUOMFilter(
                      e.target.value ? parseInt(e.target.value, 10) : null,
                    )
                  }
                  className="appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">{t.locationStocks.allUOMs}</option>
                  {uoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.name} ({uom.abbreviation})
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 md:px-4 md:py-3">Product</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Location</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Type</th>
                  <th className="px-3 py-2 md:px-4 md:py-3">Stock</th>
                  <th className="px-3 py-2 text-right md:px-4 md:py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleStocks.map((stock) => {
                  const displayStock =
                    selectedUOMFilter && stock.convertedStock !== null
                      ? stock.convertedStock
                      : stock.stock

                  const displayUOM =
                    selectedUOMFilter && stock.convertedStock !== null
                      ? uoms.find((u) => u.id === selectedUOMFilter)?.abbreviation
                      : stock.product_uom_id
                      ? uoms.find((u) => u.id === stock.product_uom_id)?.abbreviation
                      : null

                  return (
                    <tr
                      key={`${stock.product_id}-${stock.location_id}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-3 py-2 text-xs font-medium text-slate-900 md:px-4 md:py-3 md:text-sm">
                        {stock.product_name}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                        {stock.location_name}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            stock.location_type === 'warehouse'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {stock.location_type === 'warehouse' ? '🏭' : '🛒'}{' '}
                          {stock.location_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-slate-900 md:px-4 md:py-3 md:text-sm">
                        <div className="flex flex-col">
                          <span>
                            {stock.conversionError ? (
                              <span className="text-rose-600">{stock.conversionError}</span>
                            ) : (
                              <>
                                {displayStock.toLocaleString('id-ID', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}
                                {displayUOM && (
                                  <span className="ml-1 text-slate-500">({displayUOM})</span>
                                )}
                              </>
                            )}
                          </span>
                          {selectedUOMFilter &&
                            stock.convertedStock !== null &&
                            stock.product_uom_id &&
                            selectedUOMFilter !== stock.product_uom_id && (
                              <span className="text-[10px] text-slate-500">
                                {t.locationStocks.base}: {stock.stock.toLocaleString('id-ID')}{' '}
                                {uoms.find((u) => u.id === stock.product_uom_id)?.abbreviation}
                              </span>
                            )}
                        </div>
                      </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs md:px-4 md:py-3 md:text-sm">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(stock)}
                          className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(stock)}
                          className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}

                {visibleStocks.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-xs text-slate-500"
                    >
                      {searchQuery ||
                      selectedProductFilter !== null ||
                      selectedLocationFilter !== null
                        ? 'No stock entries match your search or filter criteria.'
                        : 'No stock entries found. Click '}
                      {!searchQuery &&
                        selectedProductFilter === null &&
                        selectedLocationFilter === null && (
                          <>
                            <span className="font-medium text-slate-900">
                              New Stock Entry
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
          {filteredStocks.length > 0 && (
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
                      {Math.min(currentPage * itemsPerPage, filteredStocks.length)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-slate-900">
                      {filteredStocks.length}
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

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  {t.locationStocks.bulkUpload}
                </h2>
                <p className="text-xs text-slate-500">
                  {t.locationStocks.uploadInstructions}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBulkUpload(false)
                  setBulkUploadProgress(null)
                }}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              {/* Instructions */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-2 text-xs font-semibold text-slate-900">
                  {t.locationStocks.uploadInstructions}
                </h3>
                <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
                  <li>{t.locationStocks.uploadStep1}</li>
                  <li>{t.locationStocks.uploadStep2}</li>
                  <li>{t.locationStocks.uploadStep3}</li>
                </ol>
              </div>

              {/* Format Info */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-xs font-semibold text-slate-900">
                  {t.locationStocks.requiredColumns}
                </h3>
                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Product ID:</span>
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-indigo-700">
                      {t.locationStocks.required}
                    </span>
                    <span className="text-slate-500">
                      ({t.locationStocks.numericOnly}, {t.locationStocks.existingProductId})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Location ID:</span>
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-indigo-700">
                      {t.locationStocks.required}
                    </span>
                    <span className="text-slate-500">
                      ({t.locationStocks.numericOnly}, {t.locationStocks.existingLocationId})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Stock:</span>
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-indigo-700">
                      {t.locationStocks.required}
                    </span>
                    <span className="text-slate-500">
                      ({t.locationStocks.numericOnly}, &ge; 0)
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress */}
              {bulkUploadProgress && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-indigo-900">
                      {t.locationStocks.uploadingProgress}
                    </span>
                    <span className="text-indigo-700">
                      {bulkUploadProgress.processed} / {bulkUploadProgress.total}
                    </span>
                  </div>
                  <div className="mb-2 h-2 overflow-hidden rounded-full bg-indigo-200">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{
                        width: `${(bulkUploadProgress.processed / bulkUploadProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-indigo-700">
                    <span>
                      {t.locationStocks.success}: {bulkUploadProgress.success}
                    </span>
                    <span>
                      {t.locationStocks.errors}: {bulkUploadProgress.errors}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 md:px-4 md:text-sm"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  <span>{t.locationStocks.downloadTemplate}</span>
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 md:px-4 md:text-sm">
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  <span>{t.locationStocks.selectFile}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleBulkUpload}
                    className="hidden"
                    disabled={!!bulkUploadProgress}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  {editingStock ? 'Edit Stock Entry' : 'New Stock Entry'}
                </h2>
                {editingStock && (
                  <p className="text-xs text-slate-500">
                    Product #{editingStock.product_id} - Location #{editingStock.location_id}
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
                  Product
                </label>
                <div className="relative">
                  <select
                    required
                    value={form.product_id}
                    onChange={(e) => handleProductChange(e.target.value)}
                    disabled={editingStock !== null}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:cursor-not-allowed"
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
                  Location
                </label>
                <div className="relative">
                  <select
                    required
                    value={form.location_id}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    disabled={editingStock !== null}
                    className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:cursor-not-allowed"
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
                  Stock Quantity
                </label>
                <input
                  type="number"
                  min={0}
                  max={availableStock ?? undefined}
                  required
                  value={form.stock}
                  onChange={(e) => {
                    setForm({ ...form, stock: e.target.value })
                    setStockError('')
                  }}
                  placeholder="0"
                  className={`w-full rounded-md border px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-1 ${
                    stockError
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                />
                {stockError && (
                  <p className="text-[10px] text-rose-600">{stockError}</p>
                )}
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
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 md:px-4 md:text-sm"
                >
                  {editingStock ? 'Save changes' : 'Create Stock Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

