import { useState } from 'react';
import { ArrowLeftRight, Check, Cpu, Lock, ShoppingBag, Sparkles, Star } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatPrice } from '../lib/media.js';
import { ProductImage } from './ProductImage.jsx';

const FINDER_CATEGORIES = ['All', 'Laptops', 'Phones', 'Tablets', 'Audio', 'Wearables', 'Displays'];
const USAGE_OPTIONS = [
  'Programming',
  'Photography',
  'College Studies',
  'Music',
  'Fitness',
  'Graphic Design',
  'Gaming',
  'Travel',
];
const SPEC_PRIORITIES = ['Performance', 'Battery', 'Display', 'Portability', 'Camera', 'Audio'];
const BUDGET_PRESETS = [
  { label: 'Up to ₹45,000', value: 45000 },
  { label: 'Up to ₹95,000', value: 95000 },
  { label: 'Up to ₹1,60,000', value: 160000 },
  { label: 'Up to ₹3,25,000', value: 325000 },
];

export function SmartFinderView({
  isAuthenticated = false,
  compareIds = [],
  onSelectProduct,
  onToggleCompare,
  onQuickAdd,
  onBrowseCatalog,
  onRequireAuth,
}) {
  const [category, setCategory] = useState('All');
  const [budgetRupees, setBudgetRupees] = useState('160000');
  const [usage, setUsage] = useState('Programming');
  const [importantSpecs, setImportantSpecs] = useState(['Performance', 'Battery']);
  const [preferences, setPreferences] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [addedSlug, setAddedSlug] = useState(null);

  const toggleSpec = (spec) => {
    setImportantSpecs((prev) =>
      prev.includes(spec) ? prev.filter((item) => item !== spec) : [...prev, spec]
    );
  };

  const handleFind = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth?.('Sign in to run Smart Product Finder and view top recommendations.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.runFinder({
        category,
        budgetRupees: Number(budgetRupees || 0),
        usage,
        importantSpecs,
        preferences,
        inStockOnly: true,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run Smart Product Finder.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMatch = async (product) => {
    if (!isAuthenticated) {
      onRequireAuth?.(`Sign in to add ${product.name} to your bag.`);
      return;
    }
    await onQuickAdd(product);
    setAddedSlug(product.slug);
    window.setTimeout(() => setAddedSlug(null), 1400);
  };

  return (
    <section className="max-w-[1140px] mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <div className="max-w-2xl mb-10">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA] mb-2">
          <Sparkles className="w-4 h-4" />
          <span>Kanso Smart Product Finder</span>
        </div>
        <h1
          className="font-display text-3xl sm:text-5xl font-extrabold text-[#101827] tracking-tight mb-3"
          style={{ textWrap: 'balance' }}
        >
          Find the exact device for your workflow.
        </h1>
        <p className="text-sm sm:text-base text-[#64748B] leading-relaxed">
          Filter live Kanso Tech warehouse inventory by category, INR budget, daily workload, and hardware priorities to surface up to three best-fit recommendations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form
          onSubmit={handleFind}
          className="lg:col-span-5 kt-glass rounded-[20px] p-6 bg-white space-y-5"
        >
          <div>
            <label className="block text-xs font-bold uppercase tracking-[0.08em] text-[#172B4D] mb-2">
              1. Device Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FINDER_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-2 text-xs font-semibold rounded-[10px] border transition-colors cursor-pointer ${
                    category === cat
                      ? 'bg-[#315ECA] text-white border-[#315ECA]'
                      : 'bg-[#F5F8FC] text-[#172033] border-[#DCE3ED] hover:border-[#315ECA]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="finder-budget" className="text-xs font-bold uppercase tracking-[0.08em] text-[#172B4D]">
                2. Max Budget (INR)
              </label>
              <span className="font-mono text-xs font-bold text-[#315ECA] tabular-nums">
                {Number(budgetRupees) > 0
                  ? `₹${Number(budgetRupees).toLocaleString('en-IN')}`
                  : 'Flexible'}
              </span>
            </div>
            <input
              id="finder-budget"
              type="number"
              min="0"
              step="1000"
              value={budgetRupees}
              onChange={(e) => setBudgetRupees(e.target.value)}
              placeholder="e.g. 160000 (0 for flexible)"
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA] mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setBudgetRupees(String(preset.value))}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-[8px] border cursor-pointer ${
                    Number(budgetRupees) === preset.value
                      ? 'bg-[#172B4D] text-white border-[#172B4D]'
                      : 'bg-[#F5F8FC] text-[#64748B] border-[#E2E8F0] hover:text-[#172033]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="finder-usage" className="block text-xs font-bold uppercase tracking-[0.08em] text-[#172B4D] mb-2">
              3. Primary Usage
            </label>
            <select
              id="finder-usage"
              value={usage}
              onChange={(e) => setUsage(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-semibold bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA] cursor-pointer"
            >
              {USAGE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-bold uppercase tracking-[0.08em] text-[#172B4D] mb-2">
              4. Important Specifications
            </span>
            <div className="flex flex-wrap gap-2">
              {SPEC_PRIORITIES.map((spec) => {
                const selected = importantSpecs.includes(spec);
                return (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => toggleSpec(spec)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#172B4D] text-white border-[#172B4D]'
                        : 'bg-white text-[#64748B] border-[#DCE3ED] hover:border-[#315ECA] hover:text-[#315ECA]'
                    }`}
                  >
                    {spec}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="finder-pref" className="block text-xs font-bold uppercase tracking-[0.08em] text-[#172B4D] mb-2">
              5. Optional Preferences
            </label>
            <input
              id="finder-pref"
              type="text"
              maxLength={140}
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="e.g. OLED screen, titanium, lightweight, 32GB"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
            />
          </div>

          {error && (
            <div className="px-3.5 py-2.5 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] text-xs font-medium rounded-[12px]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthenticated && loading}
            className="kt-btn-primary w-full py-3 px-5 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isAuthenticated ? (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{loading ? 'Analyzing Live Catalog...' : 'Find Top Recommendations'}</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Sign In to Find Recommendations</span>
              </>
            )}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-5">
          {!isAuthenticated ? (
            <div className="kt-glass rounded-[20px] p-10 bg-white text-center space-y-4">
              <div className="w-12 h-12 rounded-[14px] bg-[#F5F8FC] border border-[#DCE3ED] flex items-center justify-center mx-auto text-[#315ECA]">
                <Lock className="w-6 h-6" strokeWidth={1.75} />
              </div>
              <h2 className="font-display text-2xl font-bold text-[#101827]">
                Sign in required for Smart Recommendations
              </h2>
              <p className="text-sm text-[#64748B] max-w-[46ch] mx-auto leading-relaxed">
                Sign in with your Kanso Tech account to run personalized product matching, save hardware to your wishlist, add devices to bag, and place orders.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onRequireAuth?.('Sign in to unlock Smart Product Finder recommendations.')
                  }
                  className="kt-btn-primary px-6 py-2.5 text-xs font-semibold cursor-pointer"
                >
                  Sign In / Create Account
                </button>
                <button
                  type="button"
                  onClick={onBrowseCatalog}
                  className="kt-btn-secondary px-5 py-2.5 text-xs font-semibold cursor-pointer"
                >
                  Browse Hardware Catalog
                </button>
              </div>
            </div>
          ) : (
            <>
              {!result && !loading && (
                <div className="kt-glass rounded-[20px] p-10 bg-white text-center">
                  <Cpu className="w-10 h-10 text-[#315ECA] mx-auto mb-3 opacity-80" strokeWidth={1.6} />
                  <h2 className="font-display text-2xl font-bold text-[#101827] mb-2">
                    Ready when you are
                  </h2>
                  <p className="text-sm text-[#64748B] max-w-[44ch] mx-auto">
                    Choose your category, INR budget, and key priorities on the left to match against all 72 live Kanso Tech devices.
                  </p>
                </div>
              )}

              {result && result.matches.length === 0 && (
                <div className="kt-glass rounded-[20px] p-10 bg-white text-center">
                  <h2 className="font-display text-2xl font-bold text-[#101827] mb-2">
                    No matching hardware found
                  </h2>
                  <p className="text-sm text-[#64748B] max-w-[46ch] mx-auto mb-5">
                    {result.emptyReason}
                  </p>
                  <button
                    type="button"
                    onClick={onBrowseCatalog}
                    className="kt-btn-secondary px-5 py-2.5 text-xs font-semibold cursor-pointer"
                  >
                    Browse Full Catalog
                  </button>
                </div>
              )}

              {result && result.matches.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-xl font-bold text-[#101827]">
                      Top {result.matches.length} Recommended Match{result.matches.length === 1 ? '' : 'es'}
                    </h2>
                    <span className="text-xs font-semibold text-[#315ECA] bg-[#F5F8FC] border border-[#DCE3ED] px-3 py-1 rounded-[10px]">
                      {result.aiEnhanced ? 'AI-Enhanced Catalog Ranking' : 'Live Spec & Inventory Ranking'}
                    </span>
                  </div>

                  {result.matches.map((match, idx) => {
                    const { product, whyRecommended, matchReasons } = match;
                    const isCompared = compareIds.includes(product.id);
                    const justAdded = addedSlug === product.slug;

                    return (
                      <article
                        key={product.id}
                        className="kt-glass rounded-[20px] p-5 bg-white flex flex-col sm:flex-row gap-5"
                      >
                        <div
                          onClick={() => onSelectProduct(product)}
                          className="sm:w-48 aspect-[4/3] sm:aspect-square rounded-[14px] overflow-hidden bg-[#F5F8FC] border border-[#E2E8F0] shrink-0 cursor-pointer"
                        >
                          <ProductImage
                            imageKey={product.imageKey}
                            alt={product.name}
                            loading="eager"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#315ECA]">
                                Match #{idx + 1} · {product.category}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#172033]">
                                <Star className="w-3.5 h-3.5 fill-[#D97706] text-[#D97706]" />
                                {Number(product.rating).toFixed(1)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <h3
                                onClick={() => onSelectProduct(product)}
                                className="font-display text-lg font-bold text-[#101827] hover:text-[#315ECA] cursor-pointer"
                              >
                                {product.name}
                              </h3>
                              <span className="font-mono text-lg font-bold text-[#315ECA] tabular-nums">
                                {formatPrice(product.priceCents)}
                              </span>
                            </div>

                            <p className="text-xs sm:text-sm text-[#172033] mt-2 leading-relaxed">
                              {whyRecommended}
                            </p>

                            <ul className="mt-2.5 space-y-1">
                              {matchReasons.map((reason) => (
                                <li key={reason} className="text-xs text-[#64748B] flex items-start gap-1.5">
                                  <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 mt-0.5" />
                                  <span>{reason}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E2E8F0]">
                            <button
                              type="button"
                              onClick={() => onSelectProduct(product)}
                              className="kt-btn-secondary px-3.5 py-2 text-xs font-semibold cursor-pointer"
                            >
                              Configure
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleCompare(product)}
                              className={`px-3.5 py-2 text-xs font-semibold rounded-[12px] border inline-flex items-center gap-1.5 cursor-pointer ${
                                isCompared
                                  ? 'bg-[#172B4D] text-white border-[#172B4D]'
                                  : 'bg-white text-[#172033] border-[#DCE3ED] hover:border-[#315ECA]'
                              }`}
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              <span>{isCompared ? 'In Compare' : 'Compare'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={product.stock <= 0}
                              onClick={() => handleAddMatch(product)}
                              className={`px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ml-auto ${
                                justAdded
                                  ? 'bg-[#16A34A] text-white rounded-[12px]'
                                  : 'kt-btn-primary'
                              }`}
                            >
                              <ShoppingBag className="w-3.5 h-3.5" />
                              <span>{justAdded ? 'Added' : 'Add to Bag'}</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
