import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import type { ProductRow } from '../db/products'
import { useLanguage } from '../contexts/LanguageContext'

interface BarcodePrintProps {
  product: ProductRow
  onClose?: () => void
}

export default function BarcodePrint({ product, onClose }: BarcodePrintProps) {
  const { t } = useLanguage()
  const barcodeRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (barcodeRef.current && product.barcode) {
      try {
        JsBarcode(barcodeRef.current, product.barcode, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 16,
          margin: 10,
        })
      } catch (error) {
        console.error('[BarcodePrint] Error generating barcode:', error)
      }
    }
  }, [product.barcode])

  const handlePrint = () => {
    window.print()
  }

  if (!product.barcode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            No Barcode Available
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            This product does not have a barcode. Please add a barcode first.
          </p>
          {onClose && (
            <button
              onClick={() => onClose?.()}
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t.common.close}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Print styles */}
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            .barcode-container,
            .barcode-container * {
              visibility: visible;
            }
            .barcode-container {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 10mm;
            }
            .no-print {
              display: none !important;
            }
            @page {
              margin: 0;
              size: 55mm 40mm;
            }
          }
        `}
      </style>

      {/* Overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="barcode-container w-full max-w-md rounded-lg bg-white shadow-xl print:w-[55mm] print:max-w-[55mm]">
          {/* Header with print button */}
          <div className="no-print flex items-center justify-between border-b border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-900">Print Barcode</h2>
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

          {/* Barcode Content */}
          <div className="p-6 print:p-2">
            <div className="mb-4 text-center print:mb-2">
              <h3 className="text-lg font-bold text-slate-900 print:text-sm">
                {product.name}
              </h3>
              <p className="mt-1 text-sm text-slate-600 print:text-xs">
                {product.barcode}
              </p>
            </div>

            <div className="flex justify-center">
              <svg ref={barcodeRef} className="print:max-w-full"></svg>
            </div>

            <div className="mt-4 text-center print:mt-2">
              <p className="text-xs text-slate-500 print:text-[8pt]">
                Point of Sales
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

