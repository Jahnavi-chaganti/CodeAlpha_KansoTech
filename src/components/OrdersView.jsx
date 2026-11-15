import { useState } from 'react';
import { FileText, Lock, Package, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatOrderDate, formatPrice } from '../lib/media.js';
import { InvoiceModal } from './InvoiceModal.jsx';
import { ProductImage } from './ProductImage.jsx';

const STEPS = ['Confirmed', 'Preparing Shipment', 'Shipped', 'Delivered'];

export function OrdersView({
  orders,
  loading,
  user,
  onNavigateAccount,
  onBrowseCatalog,
  onOrderUpdated,
}) {
  const [lookupCode, setLookupCode] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [invoiceOrder, setInvoiceOrder] = useState(null);

  if (!user) {
    return (
      <section className="max-w-[760px] mx-auto px-4 sm:px-6 py-16">
        <div className="kt-glass rounded-[20px] p-10 bg-white text-center space-y-4">
          <div className="w-12 h-12 rounded-[14px] bg-[#F5F8FC] border border-[#DCE3ED] flex items-center justify-center mx-auto text-[#315ECA]">
            <Lock className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA]">
            Customer Account Required
          </p>
          <h1 className="font-display text-3xl font-extrabold text-[#101827]">
            Sign in to track orders &amp; invoices
          </h1>
          <p className="text-sm text-[#64748B] max-w-[48ch] mx-auto leading-relaxed">
            Order history, live shipment tracking, order cancellation, and downloadable GST invoices are protected and available exclusively after signing in.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onNavigateAccount}
              className="kt-btn-primary px-6 py-2.5 text-xs font-semibold cursor-pointer"
            >
              Sign In / Create Account
            </button>
            <button
              type="button"
              onClick={onBrowseCatalog}
              className="kt-btn-secondary px-5 py-2.5 text-xs font-semibold cursor-pointer"
            >
              Browse Hardware Store
            </button>
          </div>
        </div>
      </section>
    );
  }

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!lookupCode.trim()) return;
    setSearching(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const found = await api.lookupOrder(lookupCode.trim());
      setLookupResult(found);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Order not found.');
    } finally {
      setSearching(false);
    }
  };

  const handleCancelOrder = async (orderNumber) => {
    setUpdatingOrder(orderNumber);
    setActionError(null);
    try {
      const updated = await api.updateOrderStatus(orderNumber, 'Cancelled');
      if (lookupResult?.orderNumber === updated.orderNumber) {
        setLookupResult(updated);
      }
      onOrderUpdated?.(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel order.');
    } finally {
      setUpdatingOrder(null);
    }
  };

  const handleDownloadHtmlInvoice = async (orderNumber) => {
    try {
      const html = await api.fetchInvoiceHtml(orderNumber);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KansoTech-Invoice-${orderNumber}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to download invoice.');
    }
  };

  const displayOrders = lookupResult ? [lookupResult] : orders;

  return (
    <section className="max-w-[960px] mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 mb-8 border-b border-[#E2E8F0]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA] mb-2">
            Real-Time Order Tracking &amp; Invoices
          </p>
          <h1 className="font-display text-4xl font-extrabold text-[#101827]">Your Orders</h1>
        </div>

        <form onSubmit={handleLookup} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#315ECA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={lookupCode}
              onChange={(e) => {
                setLookupCode(e.target.value);
                if (!e.target.value.trim()) {
                  setLookupResult(null);
                  setLookupError(null);
                }
              }}
              placeholder="Track your order ID"
              className="pl-9 pr-3.5 py-2.5 text-xs bg-white border border-[#DCE3ED] rounded-[12px] w-56 text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="kt-btn-primary px-4 py-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            {searching ? 'Checking...' : 'Track'}
          </button>
          {lookupResult && (
            <button
              type="button"
              onClick={() => {
                setLookupCode('');
                setLookupResult(null);
                setLookupError(null);
              }}
              className="px-3 py-2 text-xs font-medium text-[#64748B] hover:text-[#315ECA] cursor-pointer"
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {(lookupError || actionError) && (
        <div className="mb-6 px-4 py-3 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] text-xs font-medium rounded-[12px]">
          {lookupError || actionError}
        </div>
      )}

      {loading ? (
        <div className="kt-glass rounded-[20px] py-16 text-center text-sm text-[#64748B] bg-white">
          Loading orders...
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="kt-glass rounded-[20px] py-16 px-6 text-center bg-white">
          <Package className="w-10 h-10 text-[#315ECA] opacity-55 mx-auto mb-3" strokeWidth={1.5} />
          <h2 className="font-display text-2xl font-bold text-[#101827] mb-1">
            No orders found
          </h2>
          <p className="text-sm text-[#64748B] mb-6">
            Configure any Kanso Tech device to start an order with live fulfillment tracking.
          </p>
          <button
            type="button"
            onClick={onBrowseCatalog}
            className="kt-btn-primary px-5 py-2.5 text-xs font-semibold cursor-pointer"
          >
            Explore Store
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {displayOrders.map((order) => {
            const activeStepIdx = STEPS.indexOf(order.status);
            const isCancelled = order.status === 'Cancelled';
            const isDelivered = order.status === 'Delivered';

            return (
              <article
                key={order.id}
                className="kt-glass rounded-[20px] overflow-hidden bg-white"
              >
                <div className="px-6 py-4 bg-[#F5F8FC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                    <div>
                      <span className="text-[#64748B] block">Order Number</span>
                      <span className="font-mono font-bold text-[#101827]">#{order.orderNumber}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block">Placed</span>
                      <span className="text-[#172033] font-semibold">{formatOrderDate(order.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block">Payment Status</span>
                      <span className="text-[#172033] font-semibold">{order.paymentStatus}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block">Fulfillment</span>
                      <span
                        className={`font-bold ${
                          isCancelled
                            ? 'text-[#DC2626]'
                            : isDelivered
                              ? 'text-[#16A34A]'
                              : 'text-[#315ECA]'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setInvoiceOrder(order)}
                      className="kt-btn-secondary px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#315ECA]" />
                      <span>Invoice</span>
                    </button>

                    {order.status === 'Confirmed' && (
                      <button
                        type="button"
                        disabled={updatingOrder === order.orderNumber}
                        onClick={() => handleCancelOrder(order.orderNumber)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-[#DC2626] bg-[#DC2626]/10 border border-[#DC2626]/30 hover:bg-[#DC2626]/20 rounded-[12px] transition-colors cursor-pointer"
                      >
                        {updatingOrder === order.orderNumber ? 'Cancelling...' : 'Cancel Order'}
                      </button>
                    )}

                    <div className="text-right pl-2">
                      <span className="text-xs text-[#64748B] block">Total</span>
                      <span className="font-mono text-base font-bold text-[#315ECA] tabular-nums">
                        {formatPrice(order.totalCents)}
                      </span>
                    </div>
                  </div>
                </div>

                {!isCancelled && (
                  <div className="px-6 py-4 border-b border-[#E2E8F0] bg-white">
                    <div className="grid grid-cols-4 gap-2 text-[11px]">
                      {STEPS.map((stepLabel, idx) => {
                        const completed = idx <= activeStepIdx;
                        return (
                          <div key={stepLabel} className="space-y-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-colors ${
                                completed
                                  ? isDelivered
                                    ? 'bg-[#16A34A]'
                                    : 'bg-[#315ECA]'
                                  : 'bg-[#DCE3ED]'
                              }`}
                            />
                            <span
                              className={`block truncate ${
                                completed ? 'text-[#101827] font-semibold' : 'text-[#64748B]'
                              }`}
                            >
                              {stepLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="px-6 py-4 divide-y divide-[#E2E8F0]">
                  {order.items.map((item) => (
                    <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-16 h-12 rounded-[10px] overflow-hidden bg-[#F5F8FC] border border-[#E2E8F0] shrink-0">
                          <ProductImage
                            imageKey={item.imageKey}
                            alt={item.productName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#101827] truncate">
                            {item.productName}
                          </p>
                          <p className="text-xs text-[#64748B]">
                            {item.variant} · Qty {item.quantity} · <span className="font-mono">{item.productSku}</span>
                          </p>
                          {item.careIncluded && (
                            <p className="text-[11px] font-medium text-[#315ECA]">+ KansoCare+ Protection</p>
                          )}
                          {item.engraving && (
                            <p className="text-[11px] text-[#64748B]">
                              Engraving: &ldquo;{item.engraving}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      <span className="font-mono text-sm font-bold text-[#172033] tabular-nums shrink-0">
                        {formatPrice(item.unitPriceCents * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="px-6 py-3 border-t border-[#E2E8F0] bg-[#F5F8FC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                  <span>
                    Deliver to: <span className="text-[#172033] font-semibold">{order.customerName}</span> — {order.shippingAddress}, {order.city} {order.postalCode}
                  </span>
                  {order.discountCents > 0 && (
                    <span className="text-[#16A34A] font-semibold">
                      Saved {formatPrice(order.discountCents)} with {order.couponCode}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <InvoiceModal
        order={invoiceOrder}
        onClose={() => setInvoiceOrder(null)}
        onDownloadHtml={handleDownloadHtmlInvoice}
      />
    </section>
  );
}
