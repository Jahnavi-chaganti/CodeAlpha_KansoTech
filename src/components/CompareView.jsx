import { useMemo, useState } from 'react';
import { Check, Lock, Plus, ShoppingBag, Sparkles, X } from 'lucide-react';
import { formatMonthly, formatPrice } from '../lib/media.js';
import { ProductImage } from './ProductImage.jsx';

export function CompareView({
  products,
  isAuthenticated = false,
  compareIds = [],
  onSetCompareIds,
  onSelectProduct,
  onQuickAdd,
  onOpenFinder,
  onRequireAuth,
}) {
  const [highlightDiffs, setHighlightDiffs] = useState(true);
  const [addedId, setAddedId] = useState(null);

  const selectedProducts = useMemo(() => {
    const resolved = compareIds
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean);
    if (resolved.length > 0) return resolved;
    return products.slice(0, 3);
  }, [products, compareIds]);

  const handleReplaceAt = (colIdx, slug) => {
    const target = products.find((p) => p.slug === slug);
    if (!target) return;
    const baseIds = selectedProducts.map((p) => p.id);
    baseIds[colIdx] = target.id;
    onSetCompareIds?.(Array.from(new Set(baseIds)));
  };

  const handleAddSlot = () => {
    if (!isAuthenticated) {
      onRequireAuth?.('Sign in to customize and save your comparison list.');
      return;
    }
    const unused = products.find((p) => !selectedProducts.some((sel) => sel.id === p.id));
    if (!unused || selectedProducts.length >= 4) return;
    onSetCompareIds?.([...selectedProducts.map((p) => p.id), unused.id]);
  };

  const handleRemoveSlot = (idToRemove) => {
    const next = selectedProducts.filter((p) => p.id !== idToRemove).map((p) => p.id);
    onSetCompareIds?.(next);
  };

  const handleAddToCart = async (product) => {
    if (!isAuthenticated) {
      onRequireAuth?.(`Sign in to add ${product.name} to your bag and place orders.`);
      return;
    }
    if (!onQuickAdd || product.stock <= 0) return;
    await onQuickAdd(product);
    setAddedId(product.id);
    window.setTimeout(() => setAddedId(null), 1200);
  };

  const specRows = useMemo(() => {
    const defs = [
      { key: 'category', label: 'Category', getVal: (p) => p.category || '—' },
      { key: 'rating', label: 'Customer Rating', getVal: (p) => `${Number(p.rating || 4.8).toFixed(1)} (${p.reviewCount || 120})` },
      { key: 'display', label: 'Display', getVal: (p) => p.specs?.display || '—' },
      { key: 'chip', label: 'Processor / Silicon', getVal: (p) => p.specs?.chip || '—' },
      { key: 'battery', label: 'Battery & Power', getVal: (p) => p.specs?.battery || '—' },
      { key: 'weight', label: 'Weight', getVal: (p) => p.specs?.weight || '—' },
      { key: 'connectivity', label: 'Connectivity', getVal: (p) => p.specs?.connectivity || '—' },
      { key: 'materials', label: 'Enclosure & Materials', getVal: (p) => p.materials || '—' },
      { key: 'dimensions', label: 'Dimensions', getVal: (p) => p.dimensions || '—' },
      {
        key: 'storage',
        label: 'Configurations',
        getVal: (p) =>
          p.storageOptions?.length ? p.storageOptions.map((s) => s.label).join(', ') : 'Standard',
      },
      {
        key: 'stock',
        label: 'Warehouse Availability',
        getVal: (p) => (p.stock > 0 ? `${p.stock} in stock` : 'Out of Stock'),
      },
    ];

    return defs
      .map((row) => {
        const values = selectedProducts.map((p) => row.getVal(p));
        const hasRealValue = values.some((v) => v && v !== '—');
        const uniqueCount = new Set(values).size;
        return {
          ...row,
          values,
          hasDiff: selectedProducts.length > 1 && uniqueCount > 1,
          hasRealValue,
        };
      })
      .filter((row) => row.hasRealValue);
  }, [selectedProducts]);

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 mb-8 border-b border-[#E2E8F0]">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA] mb-2">
            Side-by-Side Technical Matrix
          </p>
          <h1
            className="font-display text-3xl sm:text-5xl font-extrabold text-[#101827] tracking-tight mb-2"
            style={{ textWrap: 'balance' }}
          >
            Compare Kanso Tech hardware.
          </h1>
          <p className="text-sm text-[#64748B]">
            Inspect silicon, display tech, battery endurance, dimensions, and live stock across up to four devices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setHighlightDiffs((prev) => !prev)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-[12px] border cursor-pointer transition-colors ${
              highlightDiffs
                ? 'bg-[#172B4D] text-white border-[#172B4D]'
                : 'bg-white text-[#172033] border-[#DCE3ED] hover:border-[#315ECA]'
            }`}
          >
            {highlightDiffs ? 'Highlighting Differences' : 'Highlight Differences'}
          </button>

          {selectedProducts.length < 4 && products.length > selectedProducts.length && (
            <button
              type="button"
              onClick={handleAddSlot}
              className="kt-btn-secondary px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Device</span>
            </button>
          )}

          {onOpenFinder && (
            <button
              type="button"
              onClick={onOpenFinder}
              className="kt-btn-primary px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Finder</span>
            </button>
          )}
        </div>
      </div>

      {selectedProducts.length === 0 ? (
        <div className="kt-glass rounded-[20px] py-16 text-center text-sm text-[#64748B] bg-white">
          Loading comparison specs...
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div
            className="grid gap-5"
            style={{
              minWidth: selectedProducts.length >= 3 ? '780px' : '540px',
              gridTemplateColumns: `repeat(${selectedProducts.length}, minmax(0, 1fr))`,
            }}
          >
            {selectedProducts.map((product, colIdx) => (
              <div
                key={`${product.id}-${colIdx}`}
                className="flex flex-col kt-glass rounded-[20px] p-5 bg-white"
              >
                <div className="flex items-center gap-2 mb-4">
                  <select
                    value={product.slug}
                    onChange={(e) => handleReplaceAt(colIdx, e.target.value)}
                    aria-label={`Select device ${colIdx + 1}`}
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-[#F5F8FC] border border-[#DCE3ED] rounded-[10px] text-[#172033] focus:outline-none focus:border-[#315ECA] cursor-pointer"
                  >
                    {products.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  {selectedProducts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(product.id)}
                      aria-label={`Remove ${product.name} from comparison`}
                      className="w-8 h-8 rounded-[10px] border border-[#E2E8F0] text-[#64748B] hover:text-[#DC2626] hover:border-[#DC2626]/40 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div
                  onClick={() => onSelectProduct(product)}
                  className="aspect-[4/3] w-full rounded-[14px] overflow-hidden bg-gradient-to-b from-[#F5F8FC] to-[#DCE3ED]/70 border border-[#E2E8F0] p-2 mb-4 cursor-pointer group"
                >
                  <div className="w-full h-full rounded-[10px] overflow-hidden bg-white">
                    <ProductImage
                      imageKey={product.imageKey}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  </div>
                </div>

                <div className="text-center pb-5 border-b border-[#E2E8F0]">
                  <h2
                    onClick={() => onSelectProduct(product)}
                    className="font-display text-base sm:text-lg font-bold text-[#101827] hover:text-[#315ECA] cursor-pointer"
                  >
                    {product.name}
                  </h2>
                  <p className="font-mono text-base font-bold text-[#315ECA] mt-1 tabular-nums">
                    {formatPrice(product.priceCents)}
                  </p>
                  <p className="text-xs text-[#64748B] mb-3 tabular-nums">
                    or {formatMonthly(product.priceCents)}/mo.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      className="kt-btn-secondary px-3 py-2 text-xs font-semibold cursor-pointer"
                    >
                      Configure
                    </button>
                    <button
                      type="button"
                      disabled={isAuthenticated && product.stock <= 0}
                      onClick={() => handleAddToCart(product)}
                      className={`px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                        !isAuthenticated
                          ? 'kt-btn-secondary text-[#172B4D]'
                          : addedId === product.id
                            ? 'bg-[#16A34A] text-white rounded-[12px]'
                            : 'kt-btn-primary'
                      }`}
                    >
                      {!isAuthenticated ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-[#315ECA]" />
                          <span>Sign in to Add</span>
                        </>
                      ) : addedId === product.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Added</span>
                        </>
                      ) : (
                        <>
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <dl className="divide-y divide-[#E2E8F0] text-center text-xs mt-1">
                  {specRows.map((row) => {
                    const value = row.values[colIdx];
                    const highlight = highlightDiffs && row.hasDiff;
                    return (
                      <div
                        key={row.key}
                        className={`py-3 px-2 rounded-md transition-colors ${
                          highlight ? 'bg-[#F5F8FC]' : ''
                        }`}
                      >
                        <dt className="text-[#64748B] mb-1 flex items-center justify-center gap-1.5">
                          <span>{row.label}</span>
                          {highlight && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#315ECA]" title="Differs across compared models" />
                          )}
                        </dt>
                        <dd
                          className={`font-semibold ${
                            row.key === 'stock'
                              ? product.stock > 0
                                ? 'text-[#16A34A] font-mono'
                                : 'text-[#DC2626] font-mono'
                              : 'text-[#172033]'
                          }`}
                        >
                          {value}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
