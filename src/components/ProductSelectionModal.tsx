import { useState, useMemo, useEffect, useRef } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { ProductRow } from '../db/products'
import type { UOMRow } from '../db/uoms'

interface ProductSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (productId: number) => void
  products: ProductRow[]
  productStocks: Record<number, number>
  uoms: UOMRow[]
}

export default function ProductSelectionModal({
  isOpen,
  onClose,
  onSelect,
  products,
  productStocks,
  uoms,
}: ProductSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 8
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setCurrentPage(1)
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products
    const query = searchQuery.toLowerCase().trim()
    return products.filter((p) =>
      p.name.toLowerCase().includes(query)
    )
  }, [products, searchQuery])

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredProducts, currentPage, itemsPerPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 sm:p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[600px] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold text-slate-900">Select Product</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200 p-4 sm:px-6">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by product name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:px-6">
          {paginatedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
              <MagnifyingGlassIcon className="h-8 w-8 text-slate-400 mb-3" />
              <p className="text-sm font-medium text-slate-900">No products found</p>
              <p className="mt-1 text-xs text-slate-500">
                We couldn't find anything matching "{searchQuery}"
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {paginatedProducts.map((product) => {
                const stock = productStocks[product.id] || 0
                const uom = uoms.find((u) => u.id === product.uom_id)
                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      onSelect(product.id)
                    }}
                    className="group flex flex-col items-start rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-primary-300 hover:bg-primary-50 hover:shadow focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={stock <= 0}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="font-medium text-slate-900 line-clamp-2 group-hover:text-primary-700">{product.name}</span>
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        Rp {product.price?.toLocaleString('id-ID') || 0}
                      </span>
                    </div>
                    <div className="mt-2 flex w-full justify-end text-xs">
                      <span className={`font-medium px-2 py-0.5 rounded-full ${stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {stock} {uom?.abbreviation || ''}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredProducts.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                products
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <div className="hidden sm:flex items-center gap-1">
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
                        className={`rounded-md px-3 py-1.5 text-xs font-medium ${currentPage === pageNum
                            ? 'bg-primary-600 text-white shadow-sm'
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
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
