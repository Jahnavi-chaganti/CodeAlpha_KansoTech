import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Lock, Minus, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatOrderDate, formatPrice } from '../lib/media.js';

const ORDER_STATUSES = ['Confirmed', 'Preparing Shipment', 'Shipped', 'Delivered', 'Cancelled'];

export function DispatchView({
  user,
  products,
  onNavigateAccount,
  onStockAdjusted,
  onOrderStatusUpdated,
}) {
  const isAdmin = user?.role === 'admin';
  const [dispatchOrders, setDispatchOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const [stockSearch, setStockSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  const fetchDispatch = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listAllDispatchOrders();
      setDispatchOrders(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin dispatch queue.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchDispatch();
  }, [fetchDispatch]);

  const handleStockChange = async (slug, delta) => {
    setBusyKey(`stock-${slug}`);
    setError(null);
    try {
      const updated = await api.adjustProductStock(slug, delta);
      onStockAdjusted(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to adjust stock.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleStatusChange = async (orderNumber, status) => {
    setBusyKey(`order-${orderNumber}`);
    setError(null);
    try {
      const updated = await api.updateOrderStatus(orderNumber, status);
      setDispatchOrders((prev) =>
        prev.map((o) => (o.orderNumber === updated.orderNumber ? updated : o))
      );
      onOrderStatusUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update order status.');
    } finally {
      setBusyKey(null);
    }
  };

  const stats = useMemo(() => {
    const lowStock = products.filter((p) => p.stock <= 5).length;
    const confirmed = dispatchOrders.filter((o) => o.status === 'Confirmed').length;
    const inTransit = dispatchOrders.filter(
      (o) => o.status === 'Preparing Shipment' || o.status === 'Shipped'
    ).length;
    const delivered = dispatchOrders.filter((o) => o.status === 'Delivered').length;
    const cancelled = dispatchOrders.filter((o) => o.status === 'Cancelled').length;
    return { total: dispatchOrders.length, confirmed, inTransit, delivered, cancelled, lowStock };
  }, [dispatchOrders, products]);

  const filteredProducts = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, stockSearch]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return dispatchOrders.filter((o) => {
      if (statusFilter !== 'All' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q)
      );
    });
  }, [dispatchOrders, orderSearch, statusFilter]);

  if (!isAdmin) {
    return (
      <section className="max-w-[560px] mx-auto px-4 sm:px-6 py-16">
        <div className="kt-glass rounded-[20px] p-8 text-center bg-white">
          <div className="w-12 h-12 rounded-[14px] bg-[#101827] text-[#5B8DEF] flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="font-display text-2xl font-extrabold text-[#101827] mb-2">
            Admin Authorization Required
          </h1>
          <p className="text-sm text-[#64748B] mb-6 leading-relaxed">
            {user
              ? `Signed in as ${user.email} (${user.role}). Only verified Kanso Tech administrators can manage warehouse stock and order fulfillment.`
              : 'Sign in with a Kanso Tech administrator account to access warehouse stock controls and order fulfillment.'}
          </p>
          <button
            type="button"
            onClick={onNavigateAccount}
            className="kt-btn-primary px-5 py-2.5 text-xs font-semibold cursor-pointer"
          >
            Go to Account Sign In
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-[1240px] mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-8 mb-8 border-b border-[#E2E8F0]">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA] mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span>Admin Operations Portal</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#101827]">
            Fulfillment &amp; Inventory
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Role-verified warehouse management with targeted real-time customer notifications.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchDispatch}
          className="kt-btn-secondary inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#315ECA]" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] text-xs font-medium rounded-[12px]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <div className="kt-glass rounded-[16px] p-4 bg-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Total Orders</p>
          <p className="font-mono text-2xl font-extrabold text-[#101827] mt-1 tabular-nums">{stats.total}</p>
        </div>
        <div className="kt-glass rounded-[16px] p-4 bg-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Confirmed</p>
          <p className="font-mono text-2xl font-extrabold text-[#315ECA] mt-1 tabular-nums">{stats.confirmed}</p>
        </div>
        <div className="kt-glass rounded-[16px] p-4 bg-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">In Fulfillment</p>
          <p className="font-mono text-2xl font-extrabold text-[#5B8DEF] mt-1 tabular-nums">{stats.inTransit}</p>
        </div>
        <div className="kt-glass rounded-[16px] p-4 bg-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Delivered</p>
          <p className="font-mono text-2xl font-extrabold text-[#16A34A] mt-1 tabular-nums">{stats.delivered}</p>
        </div>
        <div className="kt-glass rounded-[16px] p-4 bg-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Cancelled</p>
          <p className="font-mono text-2xl font-extrabold text-[#DC2626] mt-1 tabular-nums">{stats.cancelled}</p>
        </div>
        <div className="kt-glass rounded-[16px] p-4 bg-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Low Stock SKUs</p>
          <p className="font-mono text-2xl font-extrabold text-[#D97706] mt-1 tabular-nums">{stats.lowStock}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 kt-glass rounded-[20px] overflow-hidden bg-white">
          <div className="px-5 py-4 bg-[#F5F8FC] border-b border-[#E2E8F0] space-y-3">
            <h2 className="text-sm font-bold text-[#101827]">
              Warehouse Stock ({filteredProducts.length}/{products.length})
            </h2>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#315ECA] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Filter SKU, name, or category..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-[#DCE3ED] rounded-[10px] text-[#172033] focus:outline-none focus:border-[#315ECA]"
              />
            </div>
          </div>
          <ul className="divide-y divide-[#E2E8F0] max-h-[620px] overflow-y-auto">
            {filteredProducts.map((product) => (
              <li key={product.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#101827] truncate">{product.name}</p>
                  <p className="text-xs text-[#64748B] font-mono">
                    {product.sku} · {product.category}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyKey === `stock-${product.slug}` || product.stock <= 0}
                    onClick={() => handleStockChange(product.slug, -1)}
                    aria-label={`Decrease stock for ${product.name}`}
                    className="w-8 h-8 flex items-center justify-center bg-white text-[#101827] border border-[#DCE3ED] rounded-[10px] hover:border-[#315ECA] disabled:opacity-40 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span
                    className={`w-10 text-center font-mono text-sm font-bold tabular-nums ${
                      product.stock <= 0
                        ? 'text-[#DC2626]'
                        : product.stock <= 5
                          ? 'text-[#D97706]'
                          : 'text-[#16A34A]'
                    }`}
                  >
                    {product.stock}
                  </span>
                  <button
                    type="button"
                    disabled={busyKey === `stock-${product.slug}`}
                    onClick={() => handleStockChange(product.slug, 5)}
                    aria-label={`Restock ${product.name} by 5`}
                    className="kt-btn-primary px-3 h-8 inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>5</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-7 kt-glass rounded-[20px] overflow-hidden bg-white">
          <div className="px-5 py-4 bg-[#F5F8FC] border-b border-[#E2E8F0] space-y-3">
            <h2 className="text-sm font-bold text-[#101827]">
              Orders Fulfillment Queue ({filteredOrders.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-[#315ECA] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search order #, customer, city..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-[#DCE3ED] rounded-[10px] text-[#172033] focus:outline-none focus:border-[#315ECA]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter orders by status"
                className="px-3 py-2 text-xs font-semibold bg-white border border-[#DCE3ED] rounded-[10px] text-[#172033] focus:outline-none focus:border-[#315ECA] cursor-pointer"
              >
                <option value="All">All Statuses</option>
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-[#64748B]">Loading dispatch queue...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#64748B]">No matching orders found.</div>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {filteredOrders.map((order) => {
                const expanded = expandedOrderId === order.id;
                return (
                  <li key={order.id} className="px-5 py-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                          <span className="font-mono font-bold text-[#315ECA]">#{order.orderNumber}</span>
                          <span aria-hidden="true" className="text-[#64748B]">·</span>
                          <span className="text-[#64748B]">{formatOrderDate(order.createdAt)}</span>
                          <span aria-hidden="true" className="text-[#64748B]">·</span>
                          <span className="font-mono font-semibold text-[#101827] tabular-nums">
                            {formatPrice(order.totalCents)}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#F5F8FC] border border-[#E2E8F0] rounded-md text-[#64748B]">
                            {order.paymentStatus}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-[#101827] truncate">
                          {order.customerName} — {order.city}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setExpandedOrderId(expanded ? null : order.id)}
                          aria-label={expanded ? 'Hide order items' : 'Inspect order items'}
                          className="kt-btn-secondary px-2.5 py-2 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>{order.items.length} item{order.items.length === 1 ? '' : 's'}</span>
                          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        <select
                          value={order.status}
                          disabled={busyKey === `order-${order.orderNumber}` || order.status === 'Cancelled'}
                          onChange={(e) => handleStatusChange(order.orderNumber, e.target.value)}
                          aria-label={`Order status for ${order.orderNumber}`}
                          className="px-3 py-2 text-xs font-semibold bg-white border border-[#DCE3ED] rounded-[10px] text-[#172033] focus:outline-none focus:border-[#315ECA] cursor-pointer disabled:opacity-50"
                        >
                          {ORDER_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {expanded && (
                      <div className="bg-[#F5F8FC] border border-[#E2E8F0] rounded-[12px] p-3.5 text-xs space-y-2">
                        <p className="text-[#64748B]">
                          Ship to: <span className="text-[#172033] font-medium">{order.shippingAddress}, {order.city} {order.postalCode}</span> · {order.phone} ({order.customerEmail})
                        </p>
                        <ul className="divide-y divide-[#E2E8F0]">
                          {order.items.map((item) => (
                            <li key={item.id} className="py-1.5 flex justify-between gap-2">
                              <span className="text-[#172033]">
                                <strong>{item.productName}</strong> ({item.variant}) × {item.quantity}
                                {item.engraving ? ` · Engraving: "${item.engraving}"` : ''}
                              </span>
                              <span className="font-mono font-semibold text-[#101827] tabular-nums">
                                {formatPrice(item.unitPriceCents * item.quantity)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
