import { useState } from 'react';
import { Package } from 'lucide-react';
import { PRODUCT_IMAGES } from '../lib/media.js';

export function ProductImage({ imageKey, alt, className = '', srcOverride, loading = 'lazy' }) {
  const [failed, setFailed] = useState(false);
  const src = srcOverride || PRODUCT_IMAGES[imageKey];

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F5F8FC] to-[#DCE3ED] text-[#172033] p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Package className="w-8 h-8 mb-2 text-[#315ECA] opacity-80" strokeWidth={1.5} />
        <span className="text-xs font-semibold tracking-wide max-w-[18ch]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
