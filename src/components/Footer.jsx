import { useState } from 'react';
import { api } from '../lib/api.js';

export function Footer({
  user,
  onNavigateCatalog,
  onNavigateFinder,
  onNavigateCompare,
  onNavigateOrders,
  onNavigateAccount,
  onNavigateDispatch,
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setStatus(null);
    try {
      await api.subscribeNewsletter(email.trim());
      setStatus({ ok: true, message: 'Subscribed to Kanso Tech product releases.' });
      setEmail('');
    } catch (err) {
      setStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to subscribe.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer className="no-print bg-[#101827] border-t border-[#172B4D] text-[#DCE3ED]">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-10 pb-12">
        <p className="text-[11px] text-[#DCE3ED]/75 leading-relaxed pb-6 mb-8 border-b border-white/10">
          All Kanso Tech prices are inclusive of standard delivery across India. Monthly INR EMI estimates reflect 12-month installments. KansoCare+ extends hardware coverage to two years including accidental damage protection. Promo codes: KANSO10 (10% off ₹25,000+, max ₹15,000) and TECH5000 (₹5,000 off ₹75,000+).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-8 border-b border-white/10">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-extrabold text-[#F5F8FC]">Kanso Tech</span>
              <span className="text-[11px] font-semibold text-[#5B8DEF]">· Premium Technology</span>
            </div>
            <p className="text-xs text-[#DCE3ED]/85 leading-relaxed max-w-[40ch] mt-2 mb-4">
              Premium Technology. Thoughtfully Designed. Precision laptops, titanium phones, tablets, audio devices, wearables, and studio displays.
            </p>

            <form onSubmit={handleSubscribe} className="flex items-center gap-2 max-w-sm">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email for Kanso Tech releases"
                aria-label="Email for newsletter"
                className="flex-1 px-3.5 py-2 text-xs bg-white/10 border border-white/20 rounded-[12px] text-[#F5F8FC] placeholder:text-[#DCE3ED]/50 focus:outline-none focus:border-[#5B8DEF]"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-[#315ECA] hover:bg-[#5B8DEF] text-white rounded-[12px] transition-colors cursor-pointer whitespace-nowrap"
              >
                {submitting ? 'Saving...' : 'Subscribe'}
              </button>
            </form>
            {status && (
              <p className={`text-xs mt-2 ${status.ok ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                {status.message}
              </p>
            )}
          </div>

          <div className="md:col-span-3 space-y-2 text-xs">
            <h3 className="font-bold text-[#F5F8FC] mb-3">Shop &amp; Discover</h3>
            <button
              type="button"
              onClick={() => onNavigateCatalog('All')}
              className="block text-[#DCE3ED]/85 hover:text-white transition-colors cursor-pointer"
            >
              All Hardware
            </button>
            <button
              type="button"
              onClick={onNavigateFinder}
              className="block text-[#DCE3ED]/85 hover:text-white transition-colors cursor-pointer"
            >
              Smart Product Finder
            </button>
            <button
              type="button"
              onClick={() => onNavigateCatalog('Laptops')}
              className="block text-[#DCE3ED]/85 hover:text-white transition-colors cursor-pointer"
            >
              Laptops &amp; Workstations
            </button>
            <button
              type="button"
              onClick={onNavigateCompare}
              className="block text-[#DCE3ED]/85 hover:text-white transition-colors cursor-pointer"
            >
              Compare Models
            </button>
          </div>

          <div className="md:col-span-4 space-y-2 text-xs">
            <h3 className="font-bold text-[#F5F8FC] mb-3">Account &amp; Fulfillment</h3>
            <button
              type="button"
              onClick={onNavigateOrders}
              className="block text-[#DCE3ED]/85 hover:text-white transition-colors cursor-pointer"
            >
              Orders &amp; Tax Invoices
            </button>
            <button
              type="button"
              onClick={onNavigateAccount}
              className="block text-[#DCE3ED]/85 hover:text-white transition-colors cursor-pointer"
            >
              Manage Kanso Tech Account
            </button>
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={onNavigateDispatch}
                className="block text-[#5B8DEF] hover:text-white transition-colors cursor-pointer"
              >
                Admin Fulfillment Portal
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] pt-6 text-[#DCE3ED]/60">
          Copyright © {new Date().getFullYear()} Kanso Tech Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
