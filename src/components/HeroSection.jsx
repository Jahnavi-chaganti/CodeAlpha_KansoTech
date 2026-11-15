import { ChevronRight, Sparkles } from 'lucide-react';
import { HERO_IMAGE } from '../lib/media.js';
import { ProductImage } from './ProductImage.jsx';

export function HeroSection({ onConfigureFlagship, onOpenFinder, onCompare, activeShoppers }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#101827] via-[#172B4D] to-[#315ECA] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[820px] h-[380px] rounded-full bg-[#5B8DEF]/25 blur-[110px]"
      />

      <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-14 lg:pt-16 lg:pb-16 text-center">
        <div className="inline-flex items-center gap-3 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#DCE3ED] mb-3">
          <span className="w-6 h-px bg-[#5B8DEF]/70" aria-hidden="true" />
          <span>Kanso Tech · K4 Pro Flagship Lineup</span>
          <span className="w-6 h-px bg-[#5B8DEF]/70" aria-hidden="true" />
        </div>

        <h1
          className="font-display font-extrabold tracking-tight leading-[1.08] text-white mx-auto mb-4"
          style={{ fontSize: 'clamp(2.25rem, 4.7vw, 3.85rem)', textWrap: 'balance', maxWidth: '22ch' }}
        >
          Premium Technology.{' '}
          <span className="inline-block bg-[#F5F8FC] text-[#101827] px-3.5 py-0.5 rounded-[12px] shadow-md">
            Thoughtfully Designed.
          </span>
        </h1>

        <p className="text-sm sm:text-base text-[#DCE3ED] max-w-[56ch] mx-auto mb-7 leading-relaxed">
          Precision laptops, titanium phones, Tandem OLED tablets, studio audio, and reference displays built for engineers, creators, and teams across India. Starting at ₹1,59,900 or ₹13,325/mo.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <button
            type="button"
            onClick={onConfigureFlagship}
            className="px-6 py-3 text-sm font-semibold text-[#101827] bg-white hover:bg-[#F5F8FC] rounded-[12px] shadow-lg transition-all cursor-pointer whitespace-nowrap"
          >
            Configure Flagship Book Pro
          </button>
          <button
            type="button"
            onClick={onOpenFinder}
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#315ECA] hover:bg-[#5B8DEF] border border-[#5B8DEF]/60 rounded-[12px] shadow-md transition-all cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4 text-[#F5F8FC]" />
            <span>Smart Product Finder</span>
          </button>
          <button
            type="button"
            onClick={onCompare}
            className="inline-flex items-center gap-1.5 px-5 py-3 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/25 rounded-[12px] backdrop-blur-md transition-all cursor-pointer whitespace-nowrap"
          >
            <span>Compare lineup</span>
            <ChevronRight className="w-4 h-4 text-[#DCE3ED]" />
          </button>
        </div>

        {activeShoppers > 1 && (
          <p className="text-xs text-[#DCE3ED] tabular-nums mb-5">
            {activeShoppers} shoppers exploring Kanso Tech right now
          </p>
        )}

        <div className="max-w-[940px] mx-auto aspect-[16/9] rounded-[20px] overflow-hidden bg-white/15 backdrop-blur-[18px] border border-white/25 p-2 shadow-2xl">
          <div className="w-full h-full rounded-[14px] overflow-hidden bg-[#101827]">
            <ProductImage
              imageKey="hero"
              srcOverride={HERO_IMAGE}
              loading="eager"
              alt="Kanso Tech flagship hardware lineup showcase"
              className="w-full h-full object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
