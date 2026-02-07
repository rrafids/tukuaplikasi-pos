import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PrinterIcon,
  ShoppingBagIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'
import { listProducts } from '../db/products'
import type { ProductRow } from '../db/products'
import { listLocations, getProductLocationStocks } from '../db/locations'
import type { LocationRow } from '../db/locations'
import { listUOMs, getUOMConversion, getUOMsWithConversions } from '../db/uoms'
import type { UOMRow } from '../db/uoms'
import {
  createSale,
  listSales,
  restoreSale,
  softDeleteSale,
  updateSale,
} from '../db/sales'
import type { SaleWithItems } from '../db/sales'
import { useToastContext } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import Invoice from './Invoice'
import SearchableSelect from './SearchableSelect'

type SaleItem = {
  product_id: number
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
  available_stock: number
  uom_id: number | null
  product_uom_id: number | null
  converted_quantity: number | null
}

type SaleFormState = {
  location_id: string
  customer_name: string
  items: SaleItem[]
  discount_type: 'percentage' | 'fixed' | ''
  discount_value: string
  notes: string
}

export default function Sales() {
  const toast = useToastContext()
  const { t } = useLanguage()
  const { user } = useAuth()
  const [sales, setSales] = useState<SaleWithItems[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [uoms, setUOMs] = useState<UOMRow[]>([])
  const [uomConversionsMap, setUomConversionsMap] = useState<Record<number, number[]>>({})
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [printingSale, setPrintingSale] = useState<SaleWithItems | null>(null)
  const [form, setForm] = useState<SaleFormState>({
    location_id: '',
    customer_name: '',
    items: [],
    discount_type: '',
    discount_value: '',
    notes: '',
  })

  // Search and filter state (for history view)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<number | null>(null)
  const [dateFromFilter, setDateFromFilter] = useState<string>('')
  const [dateToFilter, setDateToFilter] = useState<string>('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Calculate subtotal, discount, and total for current form
  const formSubtotal = useMemo(() => {
    return form.items.reduce((sum, item) => sum + item.subtotal, 0)
  }, [form.items])

  const formDiscountAmount = useMemo(() => {
    if (!form.discount_type || !form.discount_value) return 0
    const discountValue = parseFloat(form.discount_value) || 0
    if (form.discount_type === 'percentage') {
      return (formSubtotal * discountValue) / 100
    } else if (form.discount_type === 'fixed') {
      return Math.min(discountValue, formSubtotal) // Ensure discount doesn't exceed subtotal
    }
    return 0
  }, [form.discount_type, form.discount_value, formSubtotal])

  const formTotal = useMemo(() => {
    return formSubtotal - formDiscountAmount
  }, [formSubtotal, formDiscountAmount])

  // Get available stock for products at selected location
  const [productStocks, setProductStocks] = useState<
    Record<number, number>
  >({})

  // Filter products to show only those with stock at selected location
  const availableProducts = useMemo(() => {
    if (!form.location_id) {
      return []
    }
    return products.filter((product) => {
      const stock = productStocks[product.id] ?? 0
      return stock > 0
    })
  }, [products, productStocks, form.location_id])

  useEffect(() => {
    const load = async () => {
      try {
        const [salesData, prods, locs, uomsList] = await Promise.all([
          listSales(),
          listProducts(),
          listLocations(),
          listUOMs(),
        ])
        setSales(salesData)
        setProducts(prods.filter((p) => p.deleted_at === null))
        setLocations(locs.filter((l) => l.deleted_at === null))
        setUOMs(uomsList)
        
        // Preload UOM conversions for all products
        const conversionsMap: Record<number, number[]> = {}
        for (const product of prods.filter((p) => p.deleted_at === null && p.uom_id)) {
          if (product.uom_id) {
            try {
              const availableUomIds = await getUOMsWithConversions(product.uom_id)
              conversionsMap[product.uom_id] = availableUomIds
            } catch (error) {
              console.error(`[Sales] Error loading conversions for product ${product.id}:`, error)
            }
          }
        }
        setUomConversionsMap(conversionsMap)
      } catch (error) {
        console.error('[Sales] Error loading:', error)
        toast.error('Failed to load sales data.')
      }
    }
    void load()
  }, [toast])

  // Load stock when location changes
  useEffect(() => {
    const loadStocks = async () => {
      if (!form.location_id) {
        setProductStocks({})
        return
      }

      try {
        const locationId = parseInt(form.location_id, 10)
        const stocks: Record<number, number> = {}

        for (const product of products) {
          const productStocks = await getProductLocationStocks(product.id)
          const locationStock = productStocks.find(
            (ps) => ps.location_id === locationId,
          )
          stocks[product.id] = locationStock?.stock ?? 0
        }

        setProductStocks(stocks)

        // Update available stock in form items
        setForm((prev) => ({
          ...prev,
          items: prev.items.map((item) => ({
            ...item,
            available_stock: stocks[item.product_id] ?? 0,
          })),
        }))
      } catch (error) {
        console.error('[Sales] Error loading stocks:', error)
      }
    }

    void loadStocks()
  }, [form.location_id, products])

  const filteredSales = useMemo(() => {
    let filtered = sales.filter((s) => {
      if (showDeleted && s.deleted_at === null) return false
      if (!showDeleted && s.deleted_at !== null) return false

      const matchesSearch =
        searchQuery === '' ||
        s.location_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.items.some((item) =>
          item.product_name.toLowerCase().includes(searchQuery.toLowerCase()),
        )

      const matchesLocation =
        selectedLocationFilter === null || s.location_id === selectedLocationFilter

      // Date range filter
      const saleDate = new Date(s.created_at)
      const matchesDateFrom =
        dateFromFilter === '' ||
        saleDate >= new Date(dateFromFilter + 'T00:00:00')

      const matchesDateTo =
        dateToFilter === '' ||
        saleDate <= new Date(dateToFilter + 'T23:59:59')

      return (
        matchesSearch &&
        matchesLocation &&
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
    sales,
    searchQuery,
    selectedLocationFilter,
    dateFromFilter,
    dateToFilter,
    showDeleted,
  ])

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage)
  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredSales.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredSales, currentPage, itemsPerPage])

  const visibleSales = paginatedSales

  const resetForm = () =>
    setForm({
      location_id: '',
      customer_name: '',
      items: [],
      discount_type: '',
      discount_value: '',
      notes: '',
    })

  const openCreate = () => {
    setEditingId(null)
    resetForm()
    setShowForm(true)
  }

  const openEdit = (sale: SaleWithItems) => {
    setEditingId(sale.id)
    setForm({
      location_id: sale.location_id.toString(),
      customer_name: sale.customer_name ?? '',
      items: sale.items.map((item) => {
        const product = products.find((p) => p.id === item.product_id)
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          available_stock: productStocks[item.product_id] ?? 0,
          uom_id: item.uom_id,
          product_uom_id: product?.uom_id ?? null,
          converted_quantity: null,
        }
      }),
      discount_type: sale.discount_type ?? '',
      discount_value: sale.discount_value?.toString() ?? '',
      notes: sale.notes ?? '',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
  }


  const addItem = () => {
    if (!form.location_id) {
      toast.error('Please select a location first')
      return
    }

    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: 0,
          product_name: '',
          quantity: 1,
          unit_price: 0,
          subtotal: 0,
          available_stock: 0,
          uom_id: null,
          product_uom_id: null,
          converted_quantity: null,
        },
      ],
    }))
  }

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
  }

  const updateItem = async (
    index: number,
    field: keyof SaleItem,
    value: number | string | null,
  ) => {
    setForm((prev) => {
      const newItems = [...prev.items]
      const item = { ...newItems[index] }

      if (field === 'product_id') {
        const productId = typeof value === 'number' ? value : parseInt(String(value), 10)
        const product = products.find((p) => p.id === productId)
        item.product_id = productId
        item.product_name = product?.name ?? ''
        item.unit_price = product?.price ?? 0
        item.available_stock = productStocks[productId] ?? 0
        item.product_uom_id = product?.uom_id ?? null
        // Set UOM to product's UOM by default
        item.uom_id = product?.uom_id ?? null
        item.converted_quantity = null
      } else if (field === 'quantity') {
        const qty = typeof value === 'number' ? value : parseFloat(String(value))
        item.quantity = qty
        // Recalculate conversion if UOM is different
        if (item.uom_id && item.product_uom_id && item.uom_id !== item.product_uom_id) {
          getUOMConversion(item.uom_id, item.product_uom_id).then((rate) => {
            if (rate !== null) {
              setForm((prevForm) => {
                const updatedItems = [...prevForm.items]
                updatedItems[index] = {
                  ...updatedItems[index],
                  converted_quantity: item.quantity * rate,
                }
                return { ...prevForm, items: updatedItems }
              })
            }
          })
        } else {
          item.converted_quantity = null
        }
      } else if (field === 'unit_price') {
        const price = typeof value === 'number' ? value : parseFloat(String(value))
        item.unit_price = price
      } else if (field === 'uom_id') {
        const uomId = value === null || value === '' ? null : (typeof value === 'number' ? value : parseInt(String(value), 10))
        item.uom_id = uomId
        // Calculate conversion if UOM is different from product's UOM
        if (uomId && item.product_uom_id && uomId !== item.product_uom_id) {
          getUOMConversion(uomId, item.product_uom_id).then((rate) => {
            if (rate !== null) {
              setForm((prevForm) => {
                const updatedItems = [...prevForm.items]
                updatedItems[index] = {
                  ...updatedItems[index],
                  converted_quantity: item.quantity * rate,
                }
                return { ...prevForm, items: updatedItems }
              })
            } else {
              setForm((prevForm) => {
                const updatedItems = [...prevForm.items]
                updatedItems[index] = {
                  ...updatedItems[index],
                  converted_quantity: null,
                }
                return { ...prevForm, items: updatedItems }
              })
            }
          })
        } else {
          item.converted_quantity = null
        }
      }

      item.subtotal = item.quantity * item.unit_price
      newItems[index] = item

      return { ...prev, items: newItems }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.location_id) {
      toast.error('Please select a location')
      return
    }

    if (form.items.length === 0) {
      toast.error('Please add at least one item')
      return
    }

    // Validate all items
    for (const item of form.items) {
      if (item.product_id === 0) {
        toast.error('Please select a product for all items')
        return
      }

      if (item.quantity <= 0) {
        toast.error('Quantity must be greater than 0')
        return
      }

      if (item.available_stock < item.quantity) {
        toast.error(
          `Insufficient stock for ${item.product_name}. Available: ${item.available_stock}`,
        )
        return
      }
    }

    try {
      if (editingId == null) {
        const createdSale = await createSale({
          location_id: parseInt(form.location_id, 10),
          customer_name: form.customer_name.trim() || null,
          items: form.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            uom_id: item.uom_id,
          })),
          discount_type: form.discount_type || null,
          discount_value: form.discount_value ? parseFloat(form.discount_value) : null,
          notes: form.notes.trim() || null,
          user_id: user?.id ?? null,
        })
        const updatedList = await listSales()
        setSales(updatedList)
        toast.success(t.sales.created)
        // Automatically show print invoice popup
        setPrintingSale(createdSale)
      } else {
        const updated = await updateSale(editingId, {
          location_id: parseInt(form.location_id, 10),
          customer_name: form.customer_name.trim() || null,
          items: form.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            uom_id: item.uom_id,
          })),
          discount_type: form.discount_type || null,
          discount_value: form.discount_value ? parseFloat(form.discount_value) : null,
          notes: form.notes.trim() || null,
        })
        if (updated) {
          const updatedList = await listSales()
          setSales(updatedList)
          toast.success(t.sales.updated)
        } else {
          toast.error(t.sales.updated.replace('successfully', 'failed').replace('berhasil', 'gagal'))
        }
      }

      closeForm()
    } catch (error) {
      console.error('[Sales] Error saving sale:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save sale: ${errorMessage}`)
    }
  }

  const handleDelete = async (sale: SaleWithItems) => {
    if (sale.deleted_at) return
    try {
      const updated = await softDeleteSale(sale.id)
      if (updated) {
        const updatedList = await listSales()
        setSales(updatedList)
        toast.success(t.sales.deleted)
      } else {
        toast.error('Failed to delete sale')
      }
    } catch (error) {
      console.error('[Sales] Error deleting sale:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to delete sale: ${errorMessage}`)
    }
  }

  const handleRestore = async (sale: SaleWithItems) => {
    if (!sale.deleted_at) return
    try {
      const updated = await restoreSale(sale.id)
      if (updated) {
        const updatedList = await listSales()
        setSales(updatedList)
        toast.success(t.sales.restored)
      } else {
        toast.error('Failed to restore sale')
      }
    } catch (error) {
      console.error('[Sales] Error restoring sale:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to restore sale: ${errorMessage}`)
    }
  }

  // Stats
  const allSales = useMemo(
    () => sales.filter((s) => s.deleted_at === null),
    [sales],
  )

  const totalSales = allSales.length
  const totalRevenue = useMemo(
    () => allSales.reduce((sum, s) => sum + s.total_amount, 0),
    [allSales],
  )

  const handleExportExcel = () => {
    try {
      const exportData: Array<Record<string, unknown>> = []

      filteredSales.forEach((sale) => {
        const subtotal = sale.items.reduce((sum, item) => sum + item.subtotal, 0)
        const discountAmount =
          sale.discount_type && sale.discount_value !== null
            ? sale.discount_type === 'percentage'
              ? (subtotal * sale.discount_value) / 100
              : sale.discount_value
            : 0
        const discountDisplay =
          sale.discount_type && sale.discount_value !== null
            ? sale.discount_type === 'percentage'
              ? `${sale.discount_value}%`
              : `Rp ${sale.discount_value.toLocaleString('id-ID')}`
            : '-'

        if (sale.items.length === 0) {
          exportData.push({
            'Sale ID': sale.id,
            'Date': new Date(sale.created_at).toLocaleDateString('id-ID'),
            'Location': sale.location_name,
            'Location Type': sale.location_type,
            'Product': '-',
            'Quantity': '-',
            'Unit Price': '-',
            'Subtotal': `Rp ${subtotal.toLocaleString('id-ID')}`,
            'Discount': discountDisplay,
            'Discount Amount': discountAmount > 0 ? `Rp ${discountAmount.toLocaleString('id-ID')}` : '-',
            'Total Amount': `Rp ${sale.total_amount.toLocaleString('id-ID')}`,
            'Notes': sale.notes || '-',
          })
        } else {
          sale.items.forEach((item, index) => {
            exportData.push({
              'Sale ID': index === 0 ? sale.id : '',
              'Date': index === 0 ? new Date(sale.created_at).toLocaleDateString('id-ID') : '',
              'Location': index === 0 ? sale.location_name : '',
              'Location Type': index === 0 ? sale.location_type : '',
              'Product': item.product_name,
              'Quantity': item.quantity,
              'Unit Price': `Rp ${item.unit_price.toLocaleString('id-ID')}`,
              'Subtotal': `Rp ${item.subtotal.toLocaleString('id-ID')}`,
              'Discount': index === 0 ? discountDisplay : '',
              'Discount Amount': index === 0 ? (discountAmount > 0 ? `Rp ${discountAmount.toLocaleString('id-ID')}` : '-') : '',
              'Total Amount': index === 0 ? `Rp ${sale.total_amount.toLocaleString('id-ID')}` : '',
              'Notes': index === 0 ? sale.notes || '-' : '',
            })
          })
        }
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sales')

      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const filename = `sales_${dateStr}.xlsx`

      XLSX.writeFile(wb, filename)

      toast.success(`Exported ${filteredSales.length} sales to ${filename}`)
    } catch (error) {
      console.error('[Sales] Error exporting to Excel:', error)
      toast.error('Failed to export sales to Excel.')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            Sales
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {t.sales.description}
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
            <span>{t.sales.addSale}</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6">
        {/* Stats */}
        <section className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Sales
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalSales}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <ShoppingBagIcon className="h-5 w-5 text-primary-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Revenue
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  Rp {totalRevenue.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                <ShoppingBagIcon className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </div>
        </section>

        {/* Sales History */}
        <>
            {/* Search and filter */}
            <section className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-3 md:p-4">
                <div className="flex flex-col gap-3">
                  {/* Search bar */}
                  <div className="relative flex-1">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by location, product, or notes..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setCurrentPage(1)
                      }}
                      className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    />
                  </div>

                  {/* Filters */}
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                    <div className="relative">
                      <select
                        value={selectedLocationFilter ?? ''}
                        onChange={(e) => {
                          setSelectedLocationFilter(
                            e.target.value ? parseInt(e.target.value, 10) : null,
                          )
                          setCurrentPage(1)
                        }}
                        className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
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
                      <input
                        type="date"
                        value={dateFromFilter}
                        onChange={(e) => {
                          setDateFromFilter(e.target.value)
                          setCurrentPage(1)
                        }}
                        placeholder="From Date"
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
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
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 md:text-sm"
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
                      <th className="px-3 py-2 md:px-4 md:py-3">Customer</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">Location</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">User</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">Items</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">Subtotal</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">Discount</th>
                      <th className="px-3 py-2 md:px-4 md:py-3">Total</th>
                      <th className="hidden px-3 py-2 md:table-cell md:px-4 md:py-3">
                        Notes
                      </th>
                      <th className="px-3 py-2 text-right md:px-4 md:py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleSales.map((sale) => {
                      const isDeleted = sale.deleted_at !== null
                      return (
                        <tr
                          key={sale.id}
                          className={
                            isDeleted
                              ? 'bg-rose-50/40 text-slate-400'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                            <div className="flex flex-col">
                              <span>
                                {new Date(sale.created_at).toLocaleDateString('id-ID', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {new Date(sale.created_at).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                            {sale.customer_name || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium">{sale.location_name}</span>
                              <span className="text-[10px] text-slate-500">
                                {sale.location_type}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 md:px-4 md:py-3 md:text-sm">
                            {sale.user_name || '-'}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                            <div className="space-y-1">
                              {sale.items.map((item) => (
                                <div key={item.id} className="text-xs">
                                  {item.product_name} × {item.quantity} @ Rp{' '}
                                  {item.unit_price.toLocaleString('id-ID')}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700 md:px-4 md:py-3 md:text-sm">
                            {(() => {
                              const subtotal = sale.items.reduce((sum, item) => sum + item.subtotal, 0)
                              return `Rp ${subtotal.toLocaleString('id-ID')}`
                            })()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600 md:px-4 md:py-3 md:text-sm">
                            {(() => {
                              const subtotal = sale.items.reduce((sum, item) => sum + item.subtotal, 0)
                              if (sale.discount_type && sale.discount_value !== null) {
                                const discountAmount =
                                  sale.discount_type === 'percentage'
                                    ? (subtotal * sale.discount_value) / 100
                                    : sale.discount_value
                                return (
                                  <div className="flex flex-col">
                                    <span className="text-rose-600">
                                      - Rp {discountAmount.toLocaleString('id-ID')}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      {sale.discount_type === 'percentage'
                                        ? `${sale.discount_value}%`
                                        : 'Fixed'}
                                    </span>
                                  </div>
                                )
                              }
                              return '-'
                            })()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-900 md:px-4 md:py-3 md:text-sm">
                            Rp {sale.total_amount.toLocaleString('id-ID')}
                          </td>
                          <td className="hidden max-w-xs truncate px-3 py-2 text-xs text-slate-500 md:table-cell md:px-4 md:py-3 md:text-sm">
                            {sale.notes || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-xs md:px-4 md:py-3 md:text-sm">
                            <div className="inline-flex items-center gap-1">
                              {!isDeleted && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setPrintingSale(sale)}
                                    className="inline-flex items-center gap-1 rounded border border-primary-200 px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                                    title="Print Invoice"
                                  >
                                    <PrinterIcon className="h-3 w-3" />
                                    Print
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEdit(sale)}
                                    className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(sale)}
                                    className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                              {isDeleted && (
                                <button
                                  type="button"
                                  onClick={() => handleRestore(sale)}
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

                    {visibleSales.length === 0 && (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-8 text-center text-xs text-slate-500"
                        >
                          {searchQuery ||
                          selectedLocationFilter !== null ||
                          dateFromFilter ||
                          dateToFilter
                            ? 'No sales match your search or filter criteria.'
                            : 'No sales found. Click '}
                          {!searchQuery &&
                            selectedLocationFilter === null &&
                            !dateFromFilter &&
                            !dateToFilter && (
                              <>
                                <span className="font-medium text-slate-900">
                                  New Sale
                                </span>{' '}
                                to create one.
                              </>
                            )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {filteredSales.length > 0 && (
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
                          {Math.min(currentPage * itemsPerPage, filteredSales.length)}
                        </span>{' '}
                        of{' '}
                        <span className="font-medium text-slate-900">
                          {filteredSales.length}
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
        </>
      </main>

      {/* Slide-over form */}
      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-end bg-black/20">
          <div className="h-full w-full max-w-2xl border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingId == null ? t.sales.addSale : t.sales.editSale}
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
                    Customer Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.customer_name}
                    onChange={(e) =>
                      setForm({ ...form, customer_name: e.target.value })
                    }
                    placeholder="Enter customer name"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">
                      Items <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addItem}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <PlusIcon className="h-3 w-3" />
                      Add Item
                    </button>
                  </div>

                  <div className="space-y-3">
                    {form.items.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-700">
                            Item {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="rounded p-1 text-rose-600 hover:bg-rose-50"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-slate-600">
                              Product <span className="text-rose-500">*</span>
                            </label>
                            <SearchableSelect
                              options={availableProducts.map((product) => ({
                                value: product.id,
                                label: product.name,
                              }))}
                              value={item.product_id || null}
                              onChange={(val) =>
                                updateItem(
                                  index,
                                  'product_id',
                                  val ? String(val) : '0',
                                )
                              }
                              placeholder={form.location_id ? "Select product" : "Select location first"}
                              required
                              searchPlaceholder="Search product..."
                              className="text-xs"
                              disabled={!form.location_id}
                            />
                            {item.product_id > 0 && (
                              <p className="text-[10px] text-slate-500">
                                Stock: {item.available_stock}
                                {item.product_uom_id && (
                                  <span className="ml-1">
                                    ({uoms.find((u) => u.id === item.product_uom_id)?.abbreviation || ''})
                                  </span>
                                )}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-slate-600">
                              UOM
                            </label>
                            <SearchableSelect
                              options={(() => {
                                const baseOptions = [{ value: '', label: 'Use product UOM' }]
                                
                                if (!item.product_uom_id) {
                                  return baseOptions
                                }
                                
                                // Get available UOM IDs for this product's base UOM
                                const availableUomIds = uomConversionsMap[item.product_uom_id] || [item.product_uom_id]
                                
                                // Filter UOMs to only show those with conversions
                                const availableUoms = uoms.filter((uom) => 
                                  availableUomIds.includes(uom.id)
                                )
                                
                                return [
                                  ...baseOptions,
                                  ...availableUoms.map((uom) => ({
                                    value: uom.id,
                                    label: `${uom.name} (${uom.abbreviation})`,
                                  })),
                                ]
                              })()}
                              value={item.uom_id ?? ''}
                              onChange={(val) =>
                                updateItem(
                                  index,
                                  'uom_id',
                                  val ? Number(val) : null,
                                )
                              }
                              placeholder="Use product UOM"
                              searchPlaceholder="Search UOM..."
                              className="text-xs"
                              disabled={!item.product_id || !item.product_uom_id}
                            />
                            {item.converted_quantity !== null && (
                              <p className="text-[10px] text-emerald-600">
                                = {item.converted_quantity.toFixed(2)}{' '}
                                {item.product_uom_id && uoms.find((u) => u.id === item.product_uom_id)?.abbreviation}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-slate-600">
                              Quantity <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              min={0.01}
                              step="0.01"
                              max={item.available_stock}
                              required
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(index, 'quantity', e.target.value)
                              }
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-slate-600">
                              Unit Price <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              required
                              value={item.unit_price}
                              onChange={(e) =>
                                updateItem(index, 'unit_price', e.target.value)
                              }
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-slate-600">
                              Subtotal
                            </label>
                            <div className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-900">
                              Rp {item.subtotal.toLocaleString('id-ID')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {form.items.length === 0 && (
                      <p className="text-center text-xs text-slate-500">
                        No items added. Click "Add Item" to add products.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.sales.discount} ({t.common.optional})
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <select
                        value={form.discount_type}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            discount_type: e.target.value as 'percentage' | 'fixed' | '',
                            discount_value: '', // Reset value when type changes
                          })
                        }
                        className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-sm text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="">{t.sales.noDiscount}</option>
                        <option value="percentage">{t.sales.percentage}</option>
                        <option value="fixed">{t.sales.fixedAmount}</option>
                      </select>
                      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.discount_value}
                      onChange={(e) =>
                        setForm({ ...form, discount_value: e.target.value })
                      }
                      placeholder={
                        form.discount_type === 'percentage'
                          ? t.sales.percentagePlaceholder
                          : t.sales.fixedPlaceholder
                      }
                      disabled={!form.discount_type}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                  {form.discount_type && form.discount_value && (
                    <p className="text-[10px] text-slate-500">
                      {t.sales.discountAmount}: Rp{' '}
                      {formDiscountAmount.toLocaleString('id-ID')}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    {t.sales.notes} ({t.common.optional})
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    placeholder={t.sales.notesPlaceholder}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-primary-200 bg-primary-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-primary-900">
                      {t.sales.subtotal}:
                    </span>
                    <span className="text-sm font-semibold text-primary-900">
                      Rp {formSubtotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                  {formDiscountAmount > 0 && (
                    <div className="flex items-center justify-between border-t border-primary-200 pt-2">
                      <span className="text-sm font-medium text-primary-900">
                        {t.sales.discount}:
                      </span>
                      <span className="text-sm font-semibold text-primary-900">
                        - Rp {formDiscountAmount.toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-primary-300 pt-2">
                    <span className="text-sm font-semibold text-primary-900">
                      {t.sales.totalAmount}:
                    </span>
                    <span className="text-lg font-bold text-primary-900">
                      Rp {formTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
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
                    {editingId == null ? 'Create Sale' : 'Update Sale'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {printingSale && (
        <Invoice
          sale={printingSale}
          onClose={() => setPrintingSale(null)}
        />
      )}
    </div>
  )
}

