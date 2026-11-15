import { Cpu, ShieldCheck, Sparkles, Truck } from 'lucide-react';

export function CraftsmanshipSection({ onCompare, onOpenFinder }) {
  return (
    <section className="bg-[#DCE3ED]/45 border-t border-[#E2E8F0]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA] mb-2">
              The Kanso Tech Standard
            </p>
            <h2
              className="font-display text-3xl sm:text-4xl font-extrabold text-[#101827] tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              Engineered hardware. Transparent fulfillment.
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {onOpenFinder && (
              <button
                type="button"
                onClick={onOpenFinder}
                className="text-sm font-semibold text-[#172B4D] hover:text-[#315ECA] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 text-[#315ECA]" />
                <span>Try Smart Finder</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCompare}
              className="text-sm font-semibold text-[#315ECA] hover:text-[#172B4D] hover:underline underline-offset-4 cursor-pointer whitespace-nowrap"
            >
              Compare all hardware specs &rarr;
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="kt-glass kt-glass-hover rounded-[20px] p-6 bg-white transition-all duration-150">
            <div className="w-10 h-10 rounded-[12px] bg-[#F5F8FC] border border-[#DCE3ED] flex items-center justify-center mb-4">
              <Cpu className="w-5 h-5 text-[#315ECA]" strokeWidth={1.75} />
            </div>
            <h3 className="font-display text-lg font-bold text-[#101827] mb-1.5">
              Custom silicon &amp; calibrated displays.
            </h3>
            <p className="text-sm leading-relaxed text-[#64748B]">
              Every Kanso Tech laptop, tablet, and monitor pairs recycled aluminum enclosures with verified color accuracy and sustained thermal performance.
            </p>
          </div>

          <div className="kt-glass kt-glass-hover rounded-[20px] p-6 bg-white transition-all duration-150">
            <div className="w-10 h-10 rounded-[12px] bg-[#F5F8FC] border border-[#DCE3ED] flex items-center justify-center mb-4">
              <Truck className="w-5 h-5 text-[#315ECA]" strokeWidth={1.75} />
            </div>
            <h3 className="font-display text-lg font-bold text-[#101827] mb-1.5">
              Live warehouse stock &amp; next-day dispatch.
            </h3>
            <p className="text-sm leading-relaxed text-[#64748B]">
              Real-time inventory updates reserve your serialized device immediately upon confirmation with complimentary courier shipping across India.
            </p>
          </div>

          <div className="kt-glass kt-glass-hover rounded-[20px] p-6 bg-white transition-all duration-150">
            <div className="w-10 h-10 rounded-[12px] bg-[#F5F8FC] border border-[#DCE3ED] flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5 text-[#315ECA]" strokeWidth={1.75} />
            </div>
            <h3 className="font-display text-lg font-bold text-[#101827] mb-1.5">
              Configured to order &amp; protected.
            </h3>
            <p className="text-sm leading-relaxed text-[#64748B]">
              Choose memory tiers, complimentary laser engraving, promo savings, and 2-year KansoCare+ accidental coverage with instant printable tax invoices.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
