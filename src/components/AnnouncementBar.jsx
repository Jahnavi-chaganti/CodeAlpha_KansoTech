import { X } from 'lucide-react';
import { useState } from 'react';

export function AnnouncementBar({ onOpenFinder }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="no-print bg-[#172B4D] text-[#F5F8FC] min-h-9 px-4 py-1.5 flex items-center justify-center relative text-xs font-medium border-b border-[#315ECA]/30">
      <p className="truncate pr-8 text-center">
        Kanso Tech Direct · Free next-day delivery across India · Use{' '}
        <span className="font-mono font-semibold text-[#5B8DEF]">KANSO10</span> (10% off) or{' '}
        <span className="font-mono font-semibold text-[#5B8DEF]">TECH5000</span> (₹5,000 off ₹75k+) ·{' '}
        <button
          type="button"
          onClick={onOpenFinder}
          className="underline underline-offset-2 text-white hover:text-[#5B8DEF] cursor-pointer"
        >
          Try Smart Product Finder
        </button>
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss announcement"
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#DCE3ED] hover:text-white transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
