import type { SaleWithItems } from '../db/sales'

interface InvoiceProps {
  sale: SaleWithItems
  onClose?: () => void
}

export default function Invoice({ sale, onClose }: InvoiceProps) {
  const formatCurrency = (value: number) => {
    return `Rp ${value.toLocaleString('id-ID')}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      {/* Print styles for 58mm thermal printer */}
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            .invoice-container,
            .invoice-container * {
              visibility: visible;
            }
            .invoice-container {
              position: absolute;
              left: 0;
              top: 0;
              width: 58mm;
              max-width: 58mm;
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
              size: 58mm auto;
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="invoice-container w-full max-w-2xl rounded-lg bg-white shadow-xl print:w-[58mm] print:max-w-[58mm]">
          {/* Header with print button */}
          <div className="no-print flex items-center justify-between border-b border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-900">Invoice</h2>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Print
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              )}
            </div>
          </div>

          {/* Invoice Content */}
          <div className="p-6 print:p-2">
            {/* Company Header */}
            <div className="mb-4 text-center print:mb-2">
              <h1 className="text-2xl font-bold text-slate-900 print:text-[13pt] print:font-bold print:leading-tight">
                Satria POS
              </h1>
              <p className="text-sm text-slate-600 print:text-[10pt] print:font-medium">By Cuslabs</p>
              <div className="mt-2 border-t-2 border-slate-900 print:mt-1 print:border-t-2"></div>
            </div>

            {/* Invoice Details */}
            <div className="mb-4 space-y-1 print:mb-2 print:space-y-0.5">
              <div className="flex justify-between text-sm print:text-[10pt]">
                <span className="font-semibold print:font-bold">Invoice #:</span>
                <span className="print:font-medium">
                  {sale.invoice_number || `INV-${sale.id.toString().padStart(6, '0')}`}
                </span>
              </div>
              <div className="flex justify-between text-sm print:text-[10pt]">
                <span className="font-semibold print:font-bold">Date:</span>
                <span className="print:font-medium">{formatDate(sale.created_at)}</span>
              </div>
              <div className="flex justify-between text-sm print:text-[10pt]">
                <span className="font-semibold print:font-bold">Customer:</span>
                <span className="print:font-medium">{sale.customer_name || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between text-sm print:text-[10pt]">
                <span className="font-semibold print:font-bold">Location:</span>
                <span className="print:font-medium">{sale.location_name}</span>
              </div>
              <div className="mt-2 border-t-2 border-slate-900 print:mt-1 print:border-t-2"></div>
            </div>

            {/* Items Table */}
            <div className="mb-4 print:mb-2">
              <table className="w-full border-collapse print:text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-900 print:border-b-2">
                    <th className="px-1 py-1 text-left text-xs font-bold uppercase print:px-0 print:py-1 print:text-[9pt] print:font-bold">
                      #
                    </th>
                    <th className="px-1 py-1 text-left text-xs font-bold uppercase print:px-0 print:py-1 print:text-[9pt] print:font-bold">
                      Item
                    </th>
                    <th className="px-1 py-1 text-center text-xs font-bold uppercase print:px-0 print:py-1 print:text-[9pt] print:font-bold">
                      Qty
                    </th>
                    <th className="px-1 py-1 text-right text-xs font-bold uppercase print:px-0 print:py-1 print:text-[9pt] print:font-bold">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item, index) => (
                    <tr key={item.id} className="border-b border-slate-900 print:border-b">
                      <td className="px-1 py-1 text-sm text-slate-900 print:px-0 print:py-1 print:text-[9pt] print:font-medium">
                        {index + 1}
                      </td>
                      <td className="px-1 py-1 text-sm font-medium text-slate-900 print:px-0 print:py-1 print:text-[9pt] print:font-semibold print:break-words">
                        <div className="print:max-w-[20mm] print:font-semibold">{item.product_name}</div>
                        <div className="text-xs text-slate-600 print:text-[8pt] print:font-normal">
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center text-sm text-slate-900 print:px-0 print:py-1 print:text-[9pt] print:font-medium">
                        {item.quantity}
                      </td>
                      <td className="px-1 py-1 text-right text-sm font-semibold text-slate-900 print:px-0 print:py-1 print:text-[9pt] print:font-bold">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
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
                        <span className="font-semibold text-slate-900 print:font-bold">Subtotal:</span>
                        <span className="font-medium text-slate-900 print:font-semibold">
                          {formatCurrency(subtotal)}
                        </span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-sm print:text-[10pt]">
                          <span className="font-semibold text-slate-900 print:font-bold">
                            Discount
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

            {/* Notes */}
            {sale.notes && (
              <div className="mb-4 border-t-2 border-slate-900 pt-2 print:mb-2 print:border-t-2 print:pt-1">
                <p className="text-xs text-slate-900 print:text-[9pt] print:font-medium">
                  <span className="font-semibold print:font-bold">Note:</span> {sale.notes}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 border-t-2 border-slate-900 pt-2 text-center text-xs text-slate-700 print:mt-2 print:border-t-2 print:pt-1 print:text-[9pt] print:font-medium">
              <p className="print:font-semibold">Thank you for your business!</p>
              <p className="mt-1 print:mt-0.5 print:font-normal">Computer-generated receipt</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

