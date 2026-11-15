import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatOrderDate, formatPrice } from '../lib/media.js';
import { ProductImage } from './ProductImage.jsx';

function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `kanso-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CartDrawer({
  open,
  initialStep = 'cart',
  cart,
  user,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  onViewOrders,
}) {
  const [step, setStep] = useState(initialStep);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const idempotencyKeyRef = useRef(generateIdempotencyKey());
  const onlinePaymentsConfigured = Boolean(cart?.onlinePaymentsConfigured);

  useEffect(() => {
    if (open) {
      setStep(initialStep);
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
  }, [open, initialStep]);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.name);
      setCustomerEmail((prev) => prev || user.email);
    }
  }, [user]);

  useEffect(() => {
    if (!onlinePaymentsConfigured && paymentMethod === 'card') {
      setPaymentMethod('cod');
    }
  }, [onlinePaymentsConfigured, paymentMethod]);

  useEffect(() => {
    if (appliedCoupon?.couponCode && cart.subtotalCents > 0) {
      api
        .validateCoupon(appliedCoupon.couponCode)
        .then((res) => {
          setAppliedCoupon(res);
          setCouponError(null);
        })
        .catch(() => {
          setAppliedCoupon(null);
        });
    } else if (cart.subtotalCents === 0) {
      setAppliedCoupon(null);
    }
  }, [cart.subtotalCents, appliedCoupon?.couponCode]);

  useEffect(() => {
    if (!open) {
      if (step === 'confirmation') {
        setStep('cart');
        setConfirmedOrder(null);
        setAppliedCoupon(null);
        setCouponInput('');
      }
      setError(null);
      setCouponError(null);
    }
  }, [open, step]);

  if (!open) return null;

  const discountCents = appliedCoupon?.discountCents || 0;
  const effectiveTotalCents = Math.max(0, cart.subtotalCents - discountCents + cart.shippingCents);

  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    setCouponError(null);
    if (!couponInput.trim()) {
      setAppliedCoupon(null);
      return;
    }
    setValidatingCoupon(true);
    try {
      const res = await api.validateCoupon(couponInput.trim());
      setAppliedCoupon(res);
      setCouponInput(res.couponCode);
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err instanceof Error ? err.message : 'Invalid promo code.');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const order = await onPlaceOrder({
        customerName,
        customerEmail,
        phone,
        shippingAddress,
        city,
        postalCode,
        paymentMethod,
        couponCode: appliedCoupon?.couponCode || '',
        idempotencyKey: idempotencyKeyRef.current,
      });
      setConfirmedOrder(order);
      setStep('confirmation');
      idempotencyKeyRef.current = generateIdempotencyKey();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place order.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = step === 'cart' ? 1 : step === 'checkout' ? 2 : 3;

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-[#101827]/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        aria-label="Shopping bag and checkout"
        className="relative z-10 w-full max-w-md bg-[#F5F8FC] h-full flex flex-col border-l border-[#DCE3ED] shadow-2xl"
      >
        <div className="px-6 py-4 bg-white border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {step === 'checkout' && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep('cart');
                  }}
                  aria-label="Back to bag"
                  className="p-1.5 -ml-1.5 text-[#64748B] hover:text-[#315ECA] rounded-[10px] cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="font-display text-xl font-bold text-[#101827]">
                {step === 'cart' && `Bag (${cart.itemCount})`}
                {step === 'checkout' && 'Checkout'}
                {step === 'confirmation' && 'Order Confirmed'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="w-8 h-8 inline-flex items-center justify-center text-[#64748B] hover:text-[#101827] hover:bg-[#F5F8FC] rounded-[10px] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] font-semibold">
            <div className={`pb-1 border-b-2 ${stepIndex >= 1 ? 'border-[#315ECA] text-[#101827]' : 'border-[#E2E8F0] text-[#64748B]'}`}>
              1. Bag
            </div>
            <div className={`pb-1 border-b-2 ${stepIndex >= 2 ? 'border-[#315ECA] text-[#101827]' : 'border-[#E2E8F0] text-[#64748B]'}`}>
              2. Delivery &amp; Pay
            </div>
            <div className={`pb-1 border-b-2 ${stepIndex >= 3 ? 'border-[#16A34A] text-[#16A34A]' : 'border-[#E2E8F0] text-[#64748B]'}`}>
              3. Confirmation
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 bg-[#F5F8FC]">
          {step === 'cart' && (
            <>
              {cart.items.length === 0 ? (
                <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center py-12">
                  <ShoppingBag className="w-10 h-10 text-[#315ECA] opacity-55 mb-3" strokeWidth={1.5} />
                  <p className="font-display text-xl font-bold text-[#101827] mb-1">
                    Your Kanso Tech bag is empty.
                  </p>
                  <p className="text-sm text-[#64748B] max-w-[28ch] mb-6">
                    Configure any device or explore Smart Product Finder to add items to your bag.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="kt-btn-primary px-5 py-2.5 text-xs font-semibold cursor-pointer"
                  >
                    Browse Hardware
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="kt-glass px-4 py-3 rounded-[14px] text-xs text-[#172033] bg-white">
                    Free next-day insured courier delivery and 14-day returns included.
                  </div>

                  <ul className="divide-y divide-[#E2E8F0] kt-glass rounded-[20px] px-4 bg-white">
                    {cart.items.map((item) => (
                      <li key={item.id} className="py-4 flex gap-4">
                        <div className="w-20 h-16 rounded-[12px] overflow-hidden bg-[#F5F8FC] border border-[#E2E8F0] shrink-0">
                          <ProductImage
                            imageKey={item.imageKey}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-[#101827] truncate">
                              {item.name}
                            </h3>
                            <button
                              type="button"
                              aria-label={`Remove ${item.name}`}
                              onClick={() => onRemoveItem(item.id)}
                              className="text-[#64748B] hover:text-[#DC2626] p-1 -mr-1 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <p className="text-xs text-[#64748B] mt-0.5">{item.variant}</p>
                          {item.careIncluded && (
                            <p className="text-[11px] font-medium text-[#315ECA] mt-0.5">+ KansoCare+ Protection</p>
                          )}
                          {item.engraving && (
                            <p className="text-[11px] text-[#64748B] mt-0.5">
                              Engraving: &ldquo;{item.engraving}&rdquo;
                            </p>
                          )}

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="inline-flex items-center border border-[#DCE3ED] rounded-[10px] bg-[#F5F8FC]">
                              <button
                                type="button"
                                aria-label="Decrease quantity"
                                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                                className="w-7 h-7 flex items-center justify-center text-[#101827] hover:bg-[#DCE3ED]/70 rounded-l-[10px] cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-7 text-center font-mono text-xs font-semibold text-[#101827] tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                aria-label="Increase quantity"
                                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                                className="w-7 h-7 flex items-center justify-center text-[#101827] hover:bg-[#DCE3ED]/70 rounded-r-[10px] cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <span className="font-mono text-sm font-bold text-[#315ECA] tabular-nums">
                              {formatPrice(item.priceCents * item.quantity)}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <form onSubmit={handleApplyCoupon} className="kt-glass rounded-[16px] p-4 bg-white space-y-2">
                    <label htmlFor="coupon-input" className="text-xs font-bold text-[#172033] flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#315ECA]" />
                      <span>Promo Code (KANSO10 or TECH5000)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="coupon-input"
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Enter promo code"
                        className="flex-1 px-3 py-2 text-xs font-mono uppercase bg-[#F5F8FC] border border-[#DCE3ED] rounded-[10px] text-[#172033] focus:outline-none focus:border-[#315ECA]"
                      />
                      <button
                        type="submit"
                        disabled={validatingCoupon}
                        className="kt-btn-secondary px-3.5 py-2 text-xs font-semibold cursor-pointer"
                      >
                        {validatingCoupon ? 'Checking...' : 'Apply'}
                      </button>
                    </div>
                    {appliedCoupon?.couponCode && (
                      <div className="flex items-center justify-between text-xs text-[#16A34A] font-medium">
                        <span>{appliedCoupon.couponCode}: {appliedCoupon.description}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedCoupon(null);
                            setCouponInput('');
                          }}
                          className="underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {couponError && (
                      <p className="text-xs text-[#DC2626] font-medium">{couponError}</p>
                    )}
                  </form>
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form id="checkout-form" onSubmit={handleCheckoutSubmit} className="space-y-5">
              {error && (
                <div className="px-4 py-3 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] text-xs font-medium rounded-[12px]">
                  {error}
                </div>
              )}

              <div className="kt-glass rounded-[20px] p-5 space-y-3.5 bg-white">
                <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#315ECA]">
                  Shipping Details
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Jahnavi Chaganti"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#172033] mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#172033] mb-1">Phone</label>
                    <input
                      type="tel"
                      required
                      minLength={6}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98480 12345"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Road No. 12, Banjara Hills"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#172033] mb-1">City</label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Hyderabad"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#172033] mb-1">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="500034"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
                    />
                  </div>
                </div>
              </div>

              <div className="kt-glass rounded-[20px] p-5 space-y-3 bg-white">
                <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#315ECA]">
                  Payment Method
                </h3>

                <div className="grid grid-cols-1 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cod')}
                    className={`px-4 py-3 text-xs font-semibold rounded-[12px] border text-left transition-colors cursor-pointer flex items-center justify-between ${
                      paymentMethod === 'cod'
                        ? 'bg-[#172B4D] text-white border-[#172B4D]'
                        : 'bg-[#F5F8FC] text-[#172033] border-[#DCE3ED]'
                    }`}
                  >
                    <span>Cash / Pay on Delivery (COD)</span>
                    <span className="text-[11px] font-mono opacity-90">Available</span>
                  </button>

                  <button
                    type="button"
                    disabled={!onlinePaymentsConfigured}
                    onClick={() => onlinePaymentsConfigured && setPaymentMethod('card')}
                    className={`px-4 py-3 text-xs font-semibold rounded-[12px] border text-left transition-colors flex items-center justify-between ${
                      !onlinePaymentsConfigured
                        ? 'bg-[#F5F8FC] text-[#64748B] border-[#E2E8F0] opacity-70 cursor-not-allowed'
                        : paymentMethod === 'card'
                          ? 'bg-[#172B4D] text-white border-[#172B4D] cursor-pointer'
                          : 'bg-[#F5F8FC] text-[#172033] border-[#DCE3ED] cursor-pointer'
                    }`}
                  >
                    <span>Online Card / UPI Gateway</span>
                    <span className="text-[11px] font-mono">
                      {onlinePaymentsConfigured ? 'Available' : 'Unavailable'}
                    </span>
                  </button>
                </div>

                {!onlinePaymentsConfigured ? (
                  <p className="text-xs text-[#D97706] flex items-start gap-2 leading-relaxed">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Online card/UPI processing is currently unavailable (no live payment gateway keys configured). Orders are fulfilled via verified Cash on Delivery (<span className="font-mono font-semibold text-[#101827]">{formatPrice(effectiveTotalCents)}</span> due on arrival).
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    Pay <span className="font-mono font-semibold text-[#101827]">{formatPrice(effectiveTotalCents)}</span> using your chosen method.
                  </p>
                )}
              </div>
            </form>
          )}

          {step === 'confirmation' && confirmedOrder && (
            <div className="space-y-5">
              <div className="kt-glass rounded-[20px] p-5 bg-white">
                <div className="flex items-center gap-2.5 text-[#16A34A] mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-bold">
                    Order #{confirmedOrder.orderNumber} {confirmedOrder.status}
                  </span>
                </div>
                <p className="text-xs text-[#172033] leading-relaxed">
                  Thank you, <span className="font-bold">{confirmedOrder.customerName}</span>. Your order was confirmed on {formatOrderDate(confirmedOrder.createdAt)} and queued for express dispatch.
                </p>

                <div className="mt-4 pt-4 border-t border-[#E2E8F0] text-xs space-y-1 text-[#64748B]">
                  <p>
                    Deliver to: <span className="text-[#172033] font-medium">{confirmedOrder.shippingAddress}, {confirmedOrder.city} {confirmedOrder.postalCode}</span>
                  </p>
                  <p>
                    Payment Status: <span className="text-[#172033] font-medium">{confirmedOrder.paymentStatus}</span>
                  </p>
                </div>
              </div>

              <div className="kt-glass rounded-[20px] p-5 space-y-3 bg-white">
                <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#315ECA]">
                  Order Summary
                </h3>
                <ul className="divide-y divide-[#E2E8F0] text-sm">
                  {confirmedOrder.items.map((item) => (
                    <li key={item.id} className="py-2.5 flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#101827] truncate">{item.productName}</p>
                        <p className="text-xs text-[#64748B]">
                          {item.variant} · Qty {item.quantity}
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
                      <span className="font-mono font-semibold tabular-nums text-[#315ECA]">
                        {formatPrice(item.unitPriceCents * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="pt-3 border-t border-[#E2E8F0] space-y-1.5 text-xs">
                  {confirmedOrder.discountCents > 0 && (
                    <div className="flex justify-between text-[#16A34A] font-medium">
                      <span>Promo ({confirmedOrder.couponCode})</span>
                      <span className="font-mono">-{formatPrice(confirmedOrder.discountCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#64748B]">
                    <span>Delivery</span>
                    <span className="font-mono font-semibold text-[#16A34A]">Free</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-[#101827] pt-1">
                    <span>Total</span>
                    <span className="font-mono tabular-nums text-[#315ECA]">{formatPrice(confirmedOrder.totalCents)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewOrders();
                  }}
                  className="kt-btn-primary flex-1 py-2.5 px-4 text-xs font-semibold cursor-pointer"
                >
                  Track Order Live
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="kt-btn-secondary py-2.5 px-4 text-xs font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {step !== 'confirmation' && cart.items.length > 0 && (
          <div className="px-6 py-4 bg-white border-t border-[#E2E8F0] space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-[#64748B]">
                <span>Subtotal</span>
                <span className="font-mono font-medium text-[#172033] tabular-nums">{formatPrice(cart.subtotalCents)}</span>
              </div>
              {discountCents > 0 && (
                <div className="flex justify-between text-[#16A34A] font-medium">
                  <span>Promo ({appliedCoupon.couponCode})</span>
                  <span className="font-mono tabular-nums">-{formatPrice(discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-[#64748B]">
                <span>Shipping</span>
                <span className="font-mono font-semibold text-[#16A34A]">Free</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[#101827] pt-1.5 border-t border-[#E2E8F0]">
                <span>Total</span>
                <span className="font-mono tabular-nums text-[#315ECA]">{formatPrice(effectiveTotalCents)}</span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="kt-btn-primary w-full py-3 px-4 text-sm font-semibold cursor-pointer"
              >
                Proceed to Checkout
              </button>
            ) : (
              <button
                type="submit"
                form="checkout-form"
                disabled={submitting}
                className="kt-btn-primary w-full py-3 px-4 text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Confirming Order...' : `Confirm Order · ${formatPrice(effectiveTotalCents)}`}
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
