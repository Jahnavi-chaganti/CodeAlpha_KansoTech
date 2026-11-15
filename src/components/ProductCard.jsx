import { useState } from 'react';
import { ArrowLeftRight, ArrowRight, Check, Heart, Lock, Star } from 'lucide-react';
import { formatMonthly, formatPrice } from '../lib/media.js';
import { ProductImage } from './ProductImage.jsx';

export function ProductCard({
  product,
  isAuthenticated = false,
  wishlisted = false,
  compared = false,
  onToggleWishlist,
  onToggleCompare,
  onSelect,
  onQuickAdd,
  onRequireAuth,
}) {
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const handleQuickAdd = async (e) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      onRequireAuth?.(`Sign in to add ${product.name} to your bag and place orders.`);
      return;
    }
    if (adding || product.stock <= 0) return;
    setAdding(true);
    try {
      await onQuickAdd(product);
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1200);
    } finally {
      setAdding(false);
    }
  };

  const handleWishlistClick = (e) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      onRequireAuth?.('Sign in to save hardware items to your wishlist.');
      return;
    }
    onToggleWishlist?.(product);
  };

  const handleCompareClick = (e) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      onRequireAuth?.('Sign in to add devices to your comparison list.');
      return;
    }
    onToggleCompare?.(product);
  };

  const badgeText =
    product.stock <= 0
      ? 'Sold Out'
      : product.stock <= 5
        ? `Only ${product.stock} Left`
        : product.tag || 'In Stock';

  const isSaleBadge = typeof badgeText === 'string' && badgeText.toLowerCase().includes('off');

  return (
    <article
      onClick={() => onSelect(product)}
      className="group flex flex-col kt-glass kt-glass-hover rounded-[20px] overflow-hidden cursor-pointer transition-all duration-150 ease-out hover:-translate-y-0.5 bg-white"
    >
      <div className="relative bg-gradient-to-b from-[#F5F8FC] to-[#DCE3ED]/75 p-3 pb-4 border-b border-[#E2E8F0]">
        <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
          <span
            className={`px-2.5 py-1 rounded-[10px] text-[10px] font-bold uppercase tracking-[0.06em] text-white shadow-xs ${
              product.stock <= 0
                ? 'bg-[#DC2626]'
                : product.stock <= 5
                  ? 'bg-[#D97706]'
                  : isSaleBadge
                    ? 'bg-[#315ECA]'
                    : 'bg-[#172B4D]'
            }`}
          >
            {badgeText}
          </span>

          <div className="flex items-center gap-1.5">
            {onToggleCompare && (
              <button
                type="button"
                onClick={handleCompareClick}
                aria-label={
                  !isAuthenticated
                    ? `Sign in to compare ${product.name}`
                    : compared
                      ? `Remove ${product.name} from compare`
                      : `Add ${product.name} to compare`
                }
                title={
                  !isAuthenticated
                    ? 'Sign in to compare'
                    : compared
                      ? 'In Compare List'
                      : 'Compare'
                }
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs border ${
                  compared && isAuthenticated
                    ? 'bg-[#315ECA] border-[#315ECA] text-white'
                    : 'bg-white/90 border-[#E2E8F0] text-[#64748B] hover:text-[#315ECA] hover:border-[#315ECA]'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" strokeWidth={1.9} />
              </button>
            )}

            <button
              type="button"
              onClick={handleWishlistClick}
              aria-label={
                !isAuthenticated
                  ? `Sign in to save ${product.name}`
                  : wishlisted
                    ? `Remove ${product.name} from saved items`
                    : `Save ${product.name} to wishlist`
              }
              title={!isAuthenticated ? 'Sign in to save' : wishlisted ? 'Remove from saved' : 'Save item'}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs border ${
                wishlisted && isAuthenticated
                  ? 'bg-white border-[#315ECA] text-[#315ECA]'
                  : 'bg-white/90 border-[#E2E8F0] text-[#64748B] hover:text-[#315ECA] hover:border-[#315ECA]'
              }`}
            >
              <Heart
                className={`w-4 h-4 ${wishlisted && isAuthenticated ? 'fill-[#315ECA]' : ''}`}
                strokeWidth={1.85}
              />
            </button>
          </div>
        </div>

        <div className="aspect-[4/3] w-full rounded-[14px] overflow-hidden bg-white shadow-inner border border-[#E2E8F0]">
          <ProductImage
            imageKey={product.imageKey}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover object-center transition-transform duration-200 ease-out group-hover:scale-[1.03]"
          />
        </div>
      </div>

      <div className="p-5 bg-white flex-1 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold text-[#172033] leading-snug truncate">
                {product.name}
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">{product.category}</p>
            </div>

            <div className="text-right shrink-0">
              <p className="font-mono text-base font-bold text-[#315ECA] tabular-nums leading-snug">
                {formatPrice(product.priceCents)}
              </p>
              {product.originalPriceCents && product.originalPriceCents > product.priceCents ? (
                <p className="font-mono text-[11px] text-[#64748B] line-through tabular-nums">
                  {formatPrice(product.originalPriceCents)}
                </p>
              ) : (
                <p className="text-[11px] text-[#64748B] tabular-nums">
                  {formatMonthly(product.priceCents)}/mo
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-[#64748B] mt-2 line-clamp-2 leading-relaxed">
            {product.shortDescription}
          </p>

          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="flex items-center gap-1 text-xs">
              <Star className="w-3.5 h-3.5 fill-[#D97706] text-[#D97706]" />
              <span className="font-semibold text-[#172033] tabular-nums">
                {Number(product.rating || 4.8).toFixed(1)}
              </span>
              <span className="text-[#64748B] tabular-nums">({product.reviewCount || 120})</span>
            </div>

            {Array.isArray(product.swatches) && product.swatches.length > 0 && (
              <div className="flex items-center gap-1.5" aria-label="Available finishes">
                {product.swatches.map((swatch) => (
                  <span
                    key={swatch.name}
                    title={swatch.name}
                    className="w-3.5 h-3.5 rounded-full border border-[#DCE3ED] shadow-xs inline-block"
                    style={{ backgroundColor: swatch.hex }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={isAuthenticated && (adding || product.stock <= 0)}
          onClick={handleQuickAdd}
          className={`w-full py-2.5 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all duration-150 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            !isAuthenticated
              ? 'kt-btn-secondary text-[#172B4D]'
              : justAdded
                ? 'bg-[#16A34A] text-white rounded-[12px] shadow-sm'
                : 'kt-btn-primary'
          }`}
        >
          {!isAuthenticated ? (
            <>
              <Lock className="w-3.5 h-3.5 text-[#315ECA]" />
              <span>{product.stock <= 0 ? 'Sold Out' : 'Sign in to Add'}</span>
            </>
          ) : justAdded ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Added to Bag</span>
            </>
          ) : product.stock <= 0 ? (
            <span>Sold Out</span>
          ) : (
            <>
              <span>Add to Bag</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </article>
  );
}
