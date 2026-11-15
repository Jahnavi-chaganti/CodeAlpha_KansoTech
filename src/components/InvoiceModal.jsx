import { Download, Printer, X } from 'lucide-react';
import { formatOrderDate, formatPrice } from '../lib/media.js';

export function InvoiceModal({ order, onClose, onDownloadHtml }) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="no-print fixed inset-0 bg-[#101827]/60 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Invoice for order ${order.orderNumber}`}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white border border-[#DCE3ED] rounded-[20px] shadow-2xl p-6 sm:p-8 text-[#172033]"
      >
        <div className="no-print flex items-center justify-between gap-4 pb-4 mb-5 border-b border-[#E2E8F0]">
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-[#315ECA]">
            Tax Invoice &amp; Order Receipt
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDownloadHtml?.(order.orderNumber)}
              className="kt-btn-secondary px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download HTML</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="kt-btn-primary px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice"
              className="w-8 h-8 inline-flex items-center justify-center rounded-[10px] text-[#64748B] hover:text-[#101827] hover:bg-[#F5F8FC] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4 pb-5 mb-5 border-b border-[#DCE3ED]">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-[#101827]">Kanso Tech</h2>
            <p className="text-xs text-[#315ECA] font-semibold">
              Premium Technology. Thoughtfully Designed.
            </p>
          </div>
          <div className="text-right text-xs text-[#64748B] space-y-0.5">
            <p>
              Invoice <span className="font-mono font-bold text-[#101827]">#{order.orderNumber}</span>
            </p>
            <p>Date: {formatOrderDate(order.createdAt)}</p>
            <p>Status: {order.status}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-xs">
          <div className="bg-[#F5F8FC] border border-[#E2E8F0] rounded-[14px] p-4 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#315ECA] mb-1">
              Billed &amp; Shipped To
            </p>
            <p className="font-bold text-[#101827]">{order.customerName}</p>
            <p className="text-[#64748B]">
              {order.customerEmail} · {order.phone}
            </p>
            <p>{order.shippingAddress}</p>
            <p>
              {order.city} — {order.postalCode}
            </p>
          </div>

          <div className="bg-[#F5F8FC] border border-[#E2E8F0] rounded-[14px] p-4 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#315ECA] mb-1">
              Payment &amp; Fulfillment
            </p>
            <p>
              Method:{' '}
              <span className="font-semibold text-[#101827]">
                {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Card / UPI'}
              </span>
            </p>
            <p>
              Payment Status: <span className="font-semibold text-[#101827]">{order.paymentStatus}</span>
            </p>
            <p>
              Shipping Status:{' '}
              <span className="font-semibold text-[#101827]">{order.shippingStatus || order.status}</span>
            </p>
            {order.couponCode && (
              <p>
                Promo Code: <span className="font-mono font-semibold text-[#16A34A]">{order.couponCode}</span>
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DCE3ED] text-[#64748B] uppercase tracking-[0.06em]">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 px-2 text-center">Qty</th>
                <th className="py-2 px-2 text-right">Unit</th>
                <th className="py-2 pl-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-3">
                    <p className="font-bold text-[#101827]">{item.productName}</p>
                    <p className="text-[#64748B]">
                      {item.variant} · SKU {item.productSku}
                      {item.careIncluded ? ' · +KansoCare+' : ''}
                      {item.engraving ? ` · Engraving: "${item.engraving}"` : ''}
                    </p>
                  </td>
                  <td className="py-3 px-2 text-center font-mono">{item.quantity}</td>
                  <td className="py-3 px-2 text-right font-mono tabular-nums">
                    {formatPrice(item.unitPriceCents)}
                  </td>
                  <td className="py-3 pl-2 text-right font-mono font-bold tabular-nums text-[#101827]">
                    {formatPrice(item.unitPriceCents * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="max-w-[260px] ml-auto space-y-1.5 text-xs">
          <div className="flex justify-between text-[#64748B]">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">{formatPrice(order.subtotalCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-[#16A34A] font-medium">
              <span>Discount ({order.couponCode})</span>
              <span className="font-mono tabular-nums">-{formatPrice(order.discountCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-[#64748B]">
            <span>Express Shipping</span>
            <span className="font-mono text-[#16A34A] font-semibold">
              {order.shippingCents === 0 ? 'Free' : formatPrice(order.shippingCents)}
            </span>
          </div>
          <div className="flex justify-between text-base font-extrabold text-[#101827] pt-2 border-t border-[#101827]">
            <span>Total</span>
            <span className="font-mono tabular-nums text-[#315ECA]">{formatPrice(order.totalCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
