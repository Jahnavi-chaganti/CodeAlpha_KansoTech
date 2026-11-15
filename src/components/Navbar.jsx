import { Heart, Lock, Menu, ShieldCheck, ShoppingBag, Sparkles, X } from 'lucide-react';
import { useState } from 'react';

export function Navbar({
  activePage,
  cartCount,
  wishlistCount,
  compareCount = 0,
  wishlistOnly,
  user,
  onNavigateCatalog,
  onNavigateFinder,
  onNavigateCompare,
  onNavigateOrders,
  onNavigateAccount,
  onNavigateDispatch,
  onToggleWishlist,
  onOpenCart,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = user?.role === 'admin';
  const isSignedIn = Boolean(user);

  return (
    <header className="no-print sticky top-0 z-40 kt-glass-strong">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigateCatalog('All')}
          className="inline-flex items-center gap-2.5 font-display text-lg sm:text-xl font-extrabold tracking-tight text-[#101827] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315ECA] rounded-lg"
        >
          <span className="w-8 h-8 rounded-[10px] bg-[#101827] flex items-center justify-center shadow-xs border border-[#315ECA]/40">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" aria-hidden="true">
              <path
                d="M7 5V19M7 12L15 5M9.5 10L16.5 19"
                stroke="#F5F8FC"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="17.5" cy="6.5" r="2" fill="#5B8DEF" />
            </svg>
          </span>
          <span>Kanso Tech</span>
        </button>

        <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-[#64748B]">
          <button
            type="button"
            onClick={() => onNavigateCatalog('All')}
            className={`hover:text-[#315ECA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'store' && !wishlistOnly ? 'text-[#315ECA]' : ''
            }`}
          >
            Store
          </button>
          <button
            type="button"
            onClick={onNavigateFinder}
            title={isSignedIn ? 'Open Smart Product Finder' : 'Sign in required for Smart Finder'}
            className={`inline-flex items-center gap-1 hover:text-[#315ECA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'finder' ? 'text-[#315ECA]' : ''
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#315ECA]" />
            <span>Smart Finder</span>
            {!isSignedIn && <Lock className="w-3 h-3 text-[#64748B]" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={onNavigateCompare}
            className={`hover:text-[#315ECA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'compare' ? 'text-[#315ECA]' : ''
            }`}
          >
            Compare{isSignedIn && compareCount > 0 ? ` (${compareCount})` : ''}
          </button>
          <button
            type="button"
            onClick={onNavigateOrders}
            title={isSignedIn ? 'View orders and invoices' : 'Sign in required to view orders'}
            className={`inline-flex items-center gap-1 hover:text-[#315ECA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'orders' ? 'text-[#315ECA]' : ''
            }`}
          >
            <span>Orders</span>
            {!isSignedIn && <Lock className="w-3 h-3 text-[#64748B]" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={onNavigateAccount}
            className={`hover:text-[#315ECA] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'account' ? 'text-[#315ECA]' : ''
            }`}
          >
            {user ? user.name.split(' ')[0] : 'Sign In'}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={onNavigateDispatch}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'dispatch'
                  ? 'bg-[#101827] text-white border-[#101827]'
                  : 'bg-[#F5F8FC] text-[#172B4D] border-[#DCE3ED] hover:border-[#315ECA]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#5B8DEF]" />
              <span>Admin</span>
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleWishlist}
            aria-label={isSignedIn ? `View saved items (${wishlistCount})` : 'Sign in to view saved items'}
            title={isSignedIn ? 'Saved Wishlist' : 'Sign in to save items'}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-[12px] border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315ECA] ${
              wishlistOnly && activePage === 'store'
                ? 'bg-[#F5F8FC] border-[#315ECA] text-[#315ECA]'
                : 'bg-white border-[#E2E8F0] text-[#172033] hover:border-[#315ECA] hover:text-[#315ECA]'
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${
                wishlistOnly && activePage === 'store'
                  ? 'fill-[#315ECA] text-[#315ECA]'
                  : isSignedIn && wishlistCount > 0
                    ? 'fill-[#315ECA]/25 text-[#315ECA]'
                    : 'text-[#64748B]'
              }`}
              strokeWidth={1.85}
            />
            {isSignedIn ? (
              <>
                <span className="hidden sm:inline tabular-nums">Saved ({wishlistCount})</span>
                <span className="sm:hidden tabular-nums">{wishlistCount}</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Saved</span>
                <Lock className="w-3 h-3 text-[#64748B]" aria-hidden="true" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={
              isSignedIn
                ? `Open shopping bag with ${cartCount} items`
                : 'Sign in to open shopping bag'
            }
            title={isSignedIn ? 'Shopping Bag' : 'Sign in to unlock Shopping Bag'}
            className="kt-btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315ECA]"
          >
            <ShoppingBag className="w-3.5 h-3.5" strokeWidth={1.9} />
            {isSignedIn ? (
              <span className="tabular-nums">Bag ({cartCount})</span>
            ) : (
              <>
                <span className="hidden sm:inline">Sign In for Bag</span>
                <span className="sm:hidden">Bag</span>
                <Lock className="w-3 h-3 opacity-90" aria-hidden="true" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 text-[#101827] hover:bg-[#F5F8FC] rounded-[12px] transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#E2E8F0] bg-white/95 backdrop-blur-[18px] px-4 py-3 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              onNavigateCatalog('All');
              setMobileMenuOpen(false);
            }}
            className={`text-left py-2.5 px-3 text-sm font-semibold rounded-[12px] ${
              activePage === 'store' && !wishlistOnly ? 'bg-[#F5F8FC] text-[#315ECA]' : 'text-[#172033] hover:bg-[#F5F8FC]'
            }`}
          >
            Store Catalog
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigateFinder();
              setMobileMenuOpen(false);
            }}
            className={`text-left py-2.5 px-3 text-sm font-semibold rounded-[12px] flex items-center justify-between gap-2 ${
              activePage === 'finder' ? 'bg-[#F5F8FC] text-[#315ECA]' : 'text-[#172033] hover:bg-[#F5F8FC]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#315ECA]" />
              <span>Smart Product Finder</span>
            </span>
            {!isSignedIn && <Lock className="w-3.5 h-3.5 text-[#64748B]" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigateCompare();
              setMobileMenuOpen(false);
            }}
            className={`text-left py-2.5 px-3 text-sm font-semibold rounded-[12px] ${
              activePage === 'compare' ? 'bg-[#F5F8FC] text-[#315ECA]' : 'text-[#64748B] hover:bg-[#F5F8FC]'
            }`}
          >
            Compare Devices{isSignedIn && compareCount > 0 ? ` (${compareCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigateOrders();
              setMobileMenuOpen(false);
            }}
            className={`text-left py-2.5 px-3 text-sm font-semibold rounded-[12px] flex items-center justify-between gap-2 ${
              activePage === 'orders' ? 'bg-[#F5F8FC] text-[#315ECA]' : 'text-[#64748B] hover:bg-[#F5F8FC]'
            }`}
          >
            <span>Orders &amp; Invoices</span>
            {!isSignedIn && <Lock className="w-3.5 h-3.5 text-[#64748B]" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigateAccount();
              setMobileMenuOpen(false);
            }}
            className={`text-left py-2.5 px-3 text-sm font-semibold rounded-[12px] ${
              activePage === 'account' ? 'bg-[#F5F8FC] text-[#315ECA]' : 'text-[#64748B] hover:bg-[#F5F8FC]'
            }`}
          >
            {user ? `Account (${user.name.split(' ')[0]})` : 'Sign In / Create Account'}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                onNavigateDispatch();
                setMobileMenuOpen(false);
              }}
              className={`text-left py-2.5 px-3 text-sm font-semibold rounded-[12px] flex items-center gap-2 ${
                activePage === 'dispatch' ? 'bg-[#101827] text-white' : 'text-[#172B4D] bg-[#F5F8FC]'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-[#5B8DEF]" />
              <span>Admin Fulfillment</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
