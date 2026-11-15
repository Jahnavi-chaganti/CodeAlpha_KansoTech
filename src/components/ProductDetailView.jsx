import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Heart,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Star,
  Truck,
} from 'lucide-react';
import { formatMonthly, formatPrice } from '../lib/media.js';
import { ProductCard } from './ProductCard.jsx';
import { ProductImage } from './ProductImage.jsx';

export function ProductDetailView({
  product,
  isAuthenticated = false,
  relatedProducts,
  liveViewers,
  wishlistIds,
  compareIds = [],
  onToggleWishlist,
  onToggleCompare,
  onBack,
  onSelectProduct,
  onAddToCart,
  onBuyNow,
  onRequireAuth,
}) {
  const storageOptions = product.storageOptions?.length
    ? product.storageOptions
    : [{ label: 'Standard Configuration', deltaCents: 0 }];
  const swatches = product.swatches?.length
    ? product.swatches
    : product.variants.map((v) => ({ name: v, hex: '#94A3B8' }));

  const [selectedFinish, setSelectedFinish] = useState(swatches[0]?.name || 'Standard');
  const [selectedStorage, setSelectedStorage] = useState(storageOptions[0]);
  const [careIncluded, setCareIncluded] = useState(false);
  const [engraving, setEngraving] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  const wishlisted = isAuthenticated && wishlistIds?.includes(product.id);
  const compared = isAuthenticated && compareIds?.includes(product.id);

  useEffect(() => {
    const nextSwatches = product.swatches?.length
      ? product.swatches
      : product.variants.map((v) => ({ name: v, hex: '#94A3B8' }));
    const nextStorage = product.storageOptions?.length
      ? product.storageOptions
      : [{ label: 'Standard Configuration', deltaCents: 0 }];

    setSelectedFinish(nextSwatches[0]?.name || 'Standard');
    setSelectedStorage(nextStorage[0]);
    setCareIncluded(false);
    setEngraving('');
    setQuantity(1);
    setAddedFeedback(false);
  }, [product]);

  const unitPriceCents =
    product.priceCents +
    Number(selectedStorage?.deltaCents || 0) +
    (careIncluded ? Number(product.carePriceCents || 0) : 0);

  const totalLineCents = unitPriceCents * quantity;

  const buildPayload = () => ({
    productId: product.id,
    variant: selectedFinish,
    storageLabel: selectedStorage?.label || '',
    careIncluded,
    engraving: engraving.trim(),
    quantity,
  });

  const handleAdd = async () => {
    if (!isAuthenticated) {
      onRequireAuth?.(`Sign in to add ${product.name} to your bag and place orders.`);
      return;
    }
    if (submitting || product.stock <= 0) return;
    setSubmitting(true);
    try {
      await onAddToCart(buildPayload());
      setAddedFeedback(true);
      window.setTimeout(() => setAddedFeedback(false), 1600);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBuyNow = async () => {
    if (!isAuthenticated) {
      onRequireAuth?.(`Sign in to order ${product.name} via Express Checkout.`);
      return;
    }
    if (submitting || product.stock <= 0) return;
    setSubmitting(true);
    try {
      await onBuyNow(buildPayload());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 lg:py-12 pb-24 md:pb-16">
      <div className="flex items-center justify-between gap-4 pb-5 mb-8 border-b border-[#E2E8F0]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#315ECA] hover:text-[#172B4D] transition-colors cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.9} />
          <span>Back to Kanso Tech Store</span>
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs text-[#64748B]">
          <span>Kanso Tech</span>
          <span aria-hidden="true">/</span>
          <span>{product.category}</span>
          <span aria-hidden="true">/</span>
          <span className="text-[#101827] font-semibold">{product.name}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-4">
          <div className="kt-glass rounded-[20px] p-3 bg-gradient-to-b from-[#F5F8FC] to-[#DCE3ED]">
            <div className="aspect-[4/3] w-full rounded-[14px] overflow-hidden bg-white shadow-sm border border-[#E2E8F0]">
              <ProductImage
                imageKey={product.imageKey}
                alt={product.name}
                loading="eager"
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center text-xs text-[#172033]">
            <div className="p-3.5 kt-glass rounded-[16px] flex flex-col items-center gap-1.5 bg-white">
              <Truck className="w-4 h-4 text-[#315ECA]" strokeWidth={1.75} />
              <span className="font-medium">Free next-day delivery</span>
            </div>
            <div className="p-3.5 kt-glass rounded-[16px] flex flex-col items-center gap-1.5 bg-white">
              <RotateCcw className="w-4 h-4 text-[#315ECA]" strokeWidth={1.75} />
              <span className="font-medium">14-day easy returns</span>
            </div>
            <div className="p-3.5 kt-glass rounded-[16px] flex flex-col items-center gap-1.5 bg-white">
              <ShieldCheck className="w-4 h-4 text-[#315ECA]" strokeWidth={1.75} />
              <span className="font-medium">1-year brand warranty</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] mb-2">
              <span className="font-semibold text-[#315ECA]">{product.tag || product.category}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{product.sku}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-[#101827] font-semibold">
                <Star className="w-3.5 h-3.5 fill-[#D97706] text-[#D97706]" />
                {Number(product.rating || 4.8).toFixed(1)} ({product.reviewCount || 120})
              </span>
              {liveViewers > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#315ECA] font-semibold tabular-nums">
                    {liveViewers} viewing now
                  </span>
                </>
              )}
            </div>

            <h1
              className="font-display text-3xl sm:text-4xl font-extrabold text-[#101827] tracking-tight mb-2"
              style={{ textWrap: 'balance' }}
            >
              {product.name}
            </h1>

            <div className="flex flex-wrap items-baseline gap-3">
              <p className="font-mono text-2xl font-bold text-[#315ECA] tabular-nums">
                {formatPrice(unitPriceCents)}
              </p>
              {product.originalPriceCents && product.originalPriceCents > product.priceCents && (
                <span className="font-mono text-sm text-[#64748B] line-through tabular-nums">
                  {formatPrice(product.originalPriceCents)}
                </span>
              )}
              <span className="text-xs text-[#64748B] tabular-nums">
                or {formatMonthly(unitPriceCents)}/mo. No-cost EMI
              </span>
            </div>
            <p className="text-sm text-[#172033] leading-relaxed mt-3">{product.description}</p>
          </div>

          <div className="pt-5 border-t border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#101827] mb-3">
              1. Finish.{' '}
              <span className="font-normal text-[#64748B]">Selected — {selectedFinish}</span>
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {swatches.map((swatch) => {
                const active = selectedFinish === swatch.name;
                return (
                  <button
                    key={swatch.name}
                    type="button"
                    onClick={() => setSelectedFinish(swatch.name)}
                    aria-label={swatch.name}
                    className={`inline-flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold rounded-[12px] border transition-all cursor-pointer ${
                      active
                        ? 'border-[#315ECA] bg-[#F5F8FC] text-[#101827] shadow-xs'
                        : 'border-[#DCE3ED] bg-white text-[#64748B] hover:border-[#315ECA] hover:text-[#172033]'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-[#DCE3ED] shrink-0"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    <span>{swatch.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-5 border-t border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#101827] mb-3">
              2. Configuration.{' '}
              <span className="font-normal text-[#64748B]">Select memory &amp; edition</span>
            </h2>
            <div className="space-y-2.5">
              {storageOptions.map((opt) => {
                const active = selectedStorage?.label === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSelectedStorage(opt)}
                    className={`w-full px-4 py-3.5 rounded-[14px] border text-left flex items-center justify-between gap-4 transition-all cursor-pointer ${
                      active
                        ? 'border-[#315ECA] bg-[#F5F8FC] shadow-xs'
                        : 'border-[#DCE3ED] bg-white hover:border-[#315ECA]'
                    }`}
                  >
                    <span className="text-sm font-semibold text-[#172033]">{opt.label}</span>
                    <span className="font-mono text-xs font-semibold text-[#315ECA] tabular-nums shrink-0">
                      {opt.deltaCents === 0 ? 'Included' : `+${formatPrice(opt.deltaCents)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {product.carePriceCents > 0 && (
            <div className="pt-5 border-t border-[#E2E8F0]">
              <h2 className="text-sm font-bold text-[#101827] mb-3">
                3. Protection.{' '}
                <span className="font-normal text-[#64748B]">Cover your investment.</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCareIncluded(false)}
                  className={`p-3.5 rounded-[14px] border text-left transition-all cursor-pointer ${
                    !careIncluded
                      ? 'border-[#315ECA] bg-[#F5F8FC]'
                      : 'border-[#DCE3ED] bg-white hover:border-[#315ECA]'
                  }`}
                >
                  <span className="block text-xs font-bold text-[#101827]">Standard Warranty</span>
                  <span className="block text-[11px] text-[#64748B] mt-0.5">1-year included coverage</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCareIncluded(true)}
                  className={`p-3.5 rounded-[14px] border text-left transition-all cursor-pointer ${
                    careIncluded
                      ? 'border-[#315ECA] bg-[#F5F8FC]'
                      : 'border-[#DCE3ED] bg-white hover:border-[#315ECA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#101827]">{product.careName}</span>
                    <span className="font-mono text-xs font-semibold text-[#315ECA] tabular-nums">
                      +{formatPrice(product.carePriceCents)}
                    </span>
                  </div>
                  <span className="block text-[11px] text-[#64748B] mt-0.5">
                    2-year accidental damage &amp; priority swap
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="pt-5 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="engraving-input" className="text-sm font-bold text-[#101827]">
                4. Custom Laser Engraving. <span className="font-normal text-[#64748B]">Complimentary.</span>
              </label>
              <span className="text-xs text-[#64748B] tabular-nums">{engraving.length}/24</span>
            </div>
            <input
              id="engraving-input"
              type="text"
              maxLength={24}
              value={engraving}
              onChange={(e) => setEngraving(e.target.value)}
              placeholder="Optional monogram (e.g. J. CHAGANTI)"
              className="w-full px-3.5 py-2.5 text-sm bg-white text-[#172033] placeholder:text-[#64748B]/70 border border-[#DCE3ED] rounded-[12px] focus:outline-none focus:border-[#315ECA]"
            />
          </div>

          <div className="kt-glass rounded-[20px] p-6 space-y-4 bg-white">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="font-mono text-2xl font-bold text-[#315ECA] tabular-nums">
                  {formatPrice(totalLineCents)}
                </p>
                <p className="text-xs text-[#64748B] tabular-nums">
                  or {formatMonthly(totalLineCents)}/mo. for 12 mo.
                </p>
              </div>

              <span
                className={`text-xs font-semibold tabular-nums ${
                  product.stock <= 0
                    ? 'text-[#DC2626]'
                    : product.stock <= 5
                      ? 'text-[#D97706]'
                      : 'text-[#16A34A]'
                }`}
              >
                {product.stock > 0 ? `In Stock · ${product.stock} ready` : 'Out of Stock'}
              </span>
            </div>

            <div className="text-xs text-[#172033] space-y-0.5">
              <p className="font-medium">
                {product.name} · {selectedFinish} · {selectedStorage?.label}
              </p>
              {careIncluded && <p className="text-[#315ECA] font-medium">+ {product.careName}</p>}
              {engraving.trim() && <p>Engraving: &ldquo;{engraving.trim()}&rdquo;</p>}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <div className="inline-flex items-center border border-[#DCE3ED] rounded-[12px] bg-[#F5F8FC] h-11">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-11 flex items-center justify-center text-[#101827] hover:bg-[#DCE3ED]/60 rounded-l-[12px] cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center font-mono text-xs font-semibold text-[#101827] tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
                  className="w-9 h-11 flex items-center justify-center text-[#101827] hover:bg-[#DCE3ED]/60 rounded-r-[12px] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                disabled={isAuthenticated && (submitting || product.stock <= 0)}
                onClick={handleAdd}
                className="kt-btn-primary flex-1 h-11 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {!isAuthenticated ? (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Sign in to Add to Bag</span>
                  </>
                ) : addedFeedback ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Added to Bag</span>
                  </>
                ) : (
                  <span>{product.stock <= 0 ? 'Out of Stock' : 'Add to Bag'}</span>
                )}
              </button>

              {onToggleCompare && (
                <button
                  type="button"
                  onClick={() => {
                    if (!isAuthenticated) {
                      onRequireAuth?.('Sign in to add devices to your comparison list.');
                      return;
                    }
                    onToggleCompare(product);
                  }}
                  aria-label={
                    !isAuthenticated
                      ? 'Sign in to add to comparison'
                      : compared
                        ? 'Remove from comparison'
                        : 'Add to comparison'
                  }
                  title={
                    !isAuthenticated
                      ? 'Sign in to compare'
                      : compared
                        ? 'In Compare List'
                        : 'Add to Compare'
                  }
                  className={`w-11 h-11 rounded-[12px] border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    compared
                      ? 'bg-[#172B4D] border-[#172B4D] text-white'
                      : 'bg-white border-[#DCE3ED] text-[#64748B] hover:border-[#315ECA] hover:text-[#315ECA]'
                  }`}
                >
                  <ArrowLeftRight className="w-4 h-4" strokeWidth={1.85} />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) {
                    onRequireAuth?.('Sign in to save items to your wishlist.');
                    return;
                  }
                  onToggleWishlist?.(product);
                }}
                aria-label={
                  !isAuthenticated
                    ? 'Sign in to save to wishlist'
                    : wishlisted
                      ? 'Remove from wishlist'
                      : 'Save to wishlist'
                }
                title={!isAuthenticated ? 'Sign in to save' : wishlisted ? 'Remove from saved' : 'Save item'}
                className={`w-11 h-11 rounded-[12px] border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  wishlisted
                    ? 'bg-[#F5F8FC] border-[#315ECA] text-[#315ECA]'
                    : 'bg-white border-[#DCE3ED] text-[#64748B] hover:border-[#315ECA] hover:text-[#315ECA]'
                }`}
              >
                <Heart className={`w-4 h-4 ${wishlisted ? 'fill-[#315ECA]' : ''}`} strokeWidth={1.85} />
              </button>
            </div>

            <button
              type="button"
              disabled={isAuthenticated && (submitting || product.stock <= 0)}
              onClick={handleBuyNow}
              className="kt-btn-secondary w-full h-11 px-5 text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {!isAuthenticated ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-[#315ECA]" />
                  <span>Sign in to Order — Express Checkout</span>
                </>
              ) : (
                <span>Buy Now — Express Checkout</span>
              )}
            </button>
          </div>

          <dl className="border-t border-[#E2E8F0] divide-y divide-[#E2E8F0] text-xs">
            {product.specs?.display && (
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#64748B]">Display</dt>
                <dd className="text-[#172033] font-semibold text-right">{product.specs.display}</dd>
              </div>
            )}
            {product.specs?.chip && (
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#64748B]">Processor / Architecture</dt>
                <dd className="text-[#172033] font-semibold text-right">{product.specs.chip}</dd>
              </div>
            )}
            {product.specs?.battery && (
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#64748B]">Battery &amp; Power</dt>
                <dd className="text-[#172033] font-semibold text-right">{product.specs.battery}</dd>
              </div>
            )}
            {product.specs?.weight && (
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#64748B]">Weight</dt>
                <dd className="text-[#172033] font-semibold text-right">{product.specs.weight}</dd>
              </div>
            )}
            {product.specs?.connectivity && (
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#64748B]">Connectivity</dt>
                <dd className="text-[#172033] font-semibold text-right">{product.specs.connectivity}</dd>
              </div>
            )}
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#64748B]">Materials</dt>
              <dd className="text-[#172033] font-medium text-right">{product.materials}</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#64748B]">Dimensions</dt>
              <dd className="text-[#172033] font-mono text-right">{product.dimensions}</dd>
            </div>
          </dl>
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <div className="mt-16 pt-12 border-t border-[#E2E8F0]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA] mb-1">
            Kanso Tech Ecosystem
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#101827] mb-6">
            More in {product.category}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
            {relatedProducts.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                isAuthenticated={isAuthenticated}
                wishlisted={wishlistIds?.includes(item.id)}
                compared={compareIds?.includes(item.id)}
                onToggleWishlist={onToggleWishlist}
                onToggleCompare={onToggleCompare}
                onSelect={onSelectProduct}
                onRequireAuth={onRequireAuth}
                onQuickAdd={(p) =>
                  onAddToCart({
                    productId: p.id,
                    variant: p.variants[0] || 'Standard',
                    storageLabel: p.storageOptions?.[0]?.label || '',
                    quantity: 1,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 kt-glass-strong border-t border-[#E2E8F0] px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#101827] truncate">{product.name}</p>
          <p className="font-mono text-sm font-bold text-[#315ECA] tabular-nums">
            {formatPrice(totalLineCents)}
          </p>
        </div>
        <button
          type="button"
          disabled={isAuthenticated && (submitting || product.stock <= 0)}
          onClick={handleAdd}
          className="kt-btn-primary px-5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          {!isAuthenticated && <Lock className="w-3.5 h-3.5" />}
          <span>{!isAuthenticated ? 'Sign in to Order' : addedFeedback ? 'Added' : 'Add to Bag'}</span>
        </button>
      </div>
    </section>
  );
}
