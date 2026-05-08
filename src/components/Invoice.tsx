import { useState, useMemo } from 'react'
import type { SaleWithItems } from '../db/sales'
import { useLanguage } from '../contexts/LanguageContext'
import { useSettings } from '../contexts/SettingsContext'

interface InvoiceProps {
  sale: SaleWithItems
  onClose?: () => void
  initialPrintType?: 'consumer' | 'kitchen' | 'bar'
}

export default function Invoice({ sale, onClose, initialPrintType = 'consumer' }: InvoiceProps) {
  const { t } = useLanguage()
  const { appName, whatsappNumber } = useSettings()
  const [printType, setPrintType] = useState<'consumer' | 'kitchen' | 'bar'>(initialPrintType)

  const formatCurrency = (value: number) => {
    return `Rp ${value.toLocaleString('id-ID')}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const datePart = date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const timePart = date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace('.', ':')
    
    return `${datePart} ${t.invoice.at || 'pukul'} ${timePart}`
  }

  const handlePrint = () => {
    window.print()
  }

  const filteredItems = useMemo(() => {
    if (printType === 'consumer') return sale.items
    return sale.items.filter(item => item.product_print_target === printType)
  }, [sale.items, printType])

  // Group items for kitchen and bar
  const groupedItems = useMemo(() => {
    if (printType === 'consumer') return { 'All Items': filteredItems }
    
    // Grouping for kitchen/bar 
    const groups: Record<string, typeof filteredItems> = {}
    filteredItems.forEach(item => {
      const groupName = (item.product_category || 'General').toUpperCase()
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(item)
    })
    return groups
  }, [filteredItems, printType])

  return (
    <>
      {/* Print styles for 80mm thermal printer */}
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            .invoice-overlay {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              padding: 0 !important;
              margin: 0 !important;
              background: transparent !important;
              display: block !important;
              width: 100% !important;
              height: auto !important;
            }
            .invoice-container,
            .invoice-container * {
              visibility: visible;
            }
            .invoice-container {
              position: relative !important;
              left: 0 !important;
              top: 0 !important;
              margin: 0 !important;
              width: 80mm;
              max-width: 80mm;
              padding: 2mm 3mm;
              font-family: 'Arial', 'Helvetica', sans-serif;
              font-size: 11pt;
              line-height: 1.4;
              color: #000;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .no-print {
              display: none !important;
            }
            @page {
              margin: 0;
              size: 80mm auto;
            }
            .invoice-container h1,
            .invoice-container h2,
            .invoice-container h3 {
              font-weight: 700;
              margin: 2mm 0;
              font-size: 12pt;
            }
            .invoice-container table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10pt;
              font-weight: 400;
            }
            .invoice-container th {
              font-weight: 700;
              font-size: 9pt;
            }
            .invoice-container td {
              font-size: 9pt;
            }
            .invoice-container th,
            .invoice-container td {
              padding: 1.5mm 1mm;
              border-bottom: 1px solid #000;
            }
            .invoice-container .text-center {
              text-align: center;
            }
            .invoice-container .text-right {
              text-align: right;
            }
            .invoice-container .text-left {
              text-align: left;
            }
            .invoice-container .font-bold,
            .invoice-container .font-semibold {
              font-weight: 700;
            }
            .invoice-container .font-medium {
              font-weight: 600;
            }
          }
        `}
      </style>

      {/* Overlay */}
      <div className="invoice-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity animate-in fade-in duration-200">
        <div className="invoice-container flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl print:max-h-none print:w-[80mm] print:max-w-[80mm] print:overflow-visible">
          {/* Header with print button */}
          <div className="no-print border-b border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">{t.invoice.title}</h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  Print
                </button>
                {onClose && (
                  <button
                    onClick={() => onClose?.()}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.close}
                  </button>
                )}
              </div>
            </div>

            {/* Print Selection Tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setPrintType('consumer')}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  printType === 'consumer'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Invoice
              </button>
              {sale.items.some(item => item.product_print_target === 'kitchen') && (
                <button
                  onClick={() => setPrintType('kitchen')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    printType === 'kitchen'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kitchen
                </button>
              )}
              {sale.items.some(item => item.product_print_target === 'bar') && (
                <button
                  onClick={() => setPrintType('bar')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    printType === 'bar'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bar
                </button>
              )}
            </div>
          </div>

          {/* Invoice Content */}
          <div className="flex-1 overflow-y-auto p-6 print:p-2 print:overflow-visible">
            {/* Company Header */}
            <div className="mb-4 text-center print:mb-2">
              <h1 className="text-2xl font-bold text-slate-900 print:text-[13pt] print:font-bold print:leading-tight">
                {appName}
              </h1>
              {printType === 'consumer' ? (
                <>
                  <p className="text-sm text-slate-600 print:text-[10pt] print:font-medium">{t.invoice.posName}</p>
                  {whatsappNumber && (
                    <p className="mt-1 text-xs text-slate-500 print:mt-0.5 print:text-[9pt] print:font-normal">WA: {whatsappNumber}</p>
                  )}
                </>
              ) : (
                <p className="text-sm font-bold text-slate-900 print:text-[11pt] print:uppercase">
                  {printType} ORDER
                </p>
              )}
              <div className="mt-2 border-t-2 border-slate-900 print:mt-1 print:border-t-2"></div>
            </div>

            {/* Invoice Details stack format */}
            <div className="mb-4 space-y-2 print:mb-2 print:space-y-1">
              <div className="flex flex-col text-sm print:text-[10pt]">
                <span className="font-semibold print:font-bold">{t.invoice.invoiceNo}</span>
                <span className="print:font-medium">
                  {sale.invoice_number || `INV-${sale.id.toString().padStart(6, '0')}`}
                </span>
              </div>
              <div className="flex flex-col text-sm print:text-[10pt]">
                <span className="font-semibold print:font-bold">{t.invoice.date}</span>
                <span className="print:font-medium">{formatDate(sale.created_at)}</span>
              </div>
              <div className="flex flex-col text-sm print:text-[10pt]">
                <span className="font-semibold print:font-bold">{t.invoice.customer}</span>
                <span className="font-bold print:font-bold" style={{ fontWeight: 700 }}>
                  {sale.customer_name || t.invoice.walkIn}
                </span>
              </div>
              <div className="flex flex-col text-sm print:text-[10pt]">
                <span className="font-semibold print:font-bold">{t.invoice.cashier}</span>
                <span className="print:font-medium">{sale.user_name || '-'}</span>
              </div>
              <div className="mt-2 border-t-2 border-slate-900 print:mt-1 print:border-t-2"></div>
            </div>

            {/* Items Table */}
            <div className="mb-4 print:mb-2">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-900 print:border-b-2">
                    <th className="px-1 py-1 text-left text-sm print:px-0 print:py-1 print:text-[9pt] print:font-bold">#</th>
                    <th className="px-1 py-1 text-left text-sm print:px-0 print:py-1 print:text-[9pt] print:font-bold uppercase">{t.invoice.item}</th>
                    <th className="px-1 py-1 text-center text-sm print:px-0 print:py-1 print:text-[9pt] print:font-bold uppercase">{t.invoice.qty}</th>
                    {printType === 'consumer' && (
                      <th className="px-1 py-1 text-right text-sm print:px-0 print:py-1 print:text-[9pt] print:font-bold uppercase">{t.invoice.total}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 print:divide-y-0">
                  {Object.entries(groupedItems).map(([groupName, items]) => (
                    <tr key={groupName}>
                      <td colSpan={printType === 'consumer' ? 4 : 3}>
                        {printType !== 'consumer' && (
                          <div className="mt-2 mb-1 bg-slate-900 px-2 py-0.5 text-[10pt] font-bold text-white print:mt-2">
                            {groupName}
                          </div>
                        )}
                        <table className="w-full">
                          <tbody>
                            {items.map((item, index) => (
                              <tr key={item.id} className="border-b border-slate-900 print:border-b">
                                <td className="w-6 px-1 py-1 text-sm text-slate-900 print:px-0 print:py-1 print:text-[9pt] print:font-medium">
                                  {index + 1}
                                </td>
                                <td className="px-1 py-1 text-sm font-medium text-slate-900 print:px-0 print:py-1 print:text-[9pt] print:font-semibold print:break-words">
                                  <div className="print:max-w-[45mm] print:font-semibold">{item.product_name}</div>
                                  {printType === 'consumer' && (
                                    <div className="text-xs text-slate-600 print:text-[8pt] print:font-normal">
                                      {item.quantity} × {formatCurrency(item.unit_price)}
                                    </div>
                                  )}
                                </td>
                                <td className="w-16 px-1 py-1 text-center text-sm text-slate-900 print:px-0 print:py-1 print:text-[9pt] print:font-bold">
                                  {item.quantity} {item.uom_abbreviation || ''}
                                </td>
                                {printType === 'consumer' && (
                                  <td className="w-24 px-1 py-1 text-right text-sm font-semibold text-slate-900 print:px-0 print:py-1 print:text-[9pt] print:font-bold">
                                    {formatCurrency(item.subtotal)}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredItems.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">No items for this category.</p>
              )}
            </div>

            {/* Totals */}
            {printType === 'consumer' && (
              <div className="mb-4 print:mb-2">
                <div className="space-y-1 border-t-2 border-slate-900 pt-2 print:border-t-2 print:pt-1.5">
                  {(() => {
                    const subtotal = sale.items.reduce((sum, item) => sum + item.subtotal, 0)
                    const discountAmount =
                      sale.discount_type && sale.discount_value !== null
                        ? sale.discount_type === 'percentage'
                          ? (subtotal * sale.discount_value) / 100
                          : sale.discount_value
                        : 0
                    const finalTotal = subtotal - discountAmount

                    return (
                      <>
                        <div className="flex justify-between text-sm print:text-[10pt]">
                          <span className="font-semibold text-slate-900 print:font-bold">{t.invoice.subtotal}</span>
                          <span className="font-medium text-slate-900 print:font-semibold">
                            {formatCurrency(subtotal)}
                          </span>
                        </div>
                        {discountAmount > 0 && (
                          <div className="flex justify-between text-sm print:text-[10pt]">
                            <span className="font-semibold text-slate-900 print:font-bold">
                              {t.invoice.discount}
                              {sale.discount_type === 'percentage' && sale.discount_value
                                ? ` (${sale.discount_value}%)`
                                : ''}
                              :
                            </span>
                            <span className="font-medium text-slate-900 print:font-semibold">
                              - {formatCurrency(discountAmount)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-lg font-bold print:text-[12pt] print:font-bold print:mt-1">
                          <span className="text-slate-900">TOTAL:</span>
                          <span className="text-slate-900">
                            {formatCurrency(finalTotal)}
                          </span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* Notes */}
            {sale.notes && (
              <div className="mb-4 border-t-2 border-slate-900 pt-2 print:mb-2 print:border-t-2 print:pt-1">
                <p className="text-xs text-slate-900 print:text-[9pt] print:font-medium">
                  <span className="font-semibold print:font-bold">{t.invoice.notes}</span> {sale.notes}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 border-t-2 border-slate-900 pt-2 text-center text-xs text-slate-700 print:mt-2 print:border-t-2 print:pt-1 print:text-[9pt] print:font-medium">
              <p className="print:font-semibold">{t.invoice.thankYou}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
