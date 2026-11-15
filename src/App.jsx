import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Heart, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { AccountView } from './components/AccountView.jsx';
import { AnnouncementBar } from './components/AnnouncementBar.jsx';
import { CartDrawer } from './components/CartDrawer.jsx';
import { CompareView } from './components/CompareView.jsx';
import { CraftsmanshipSection } from './components/CraftsmanshipSection.jsx';
import { DispatchView } from './components/DispatchView.jsx';
import { Footer } from './components/Footer.jsx';
import { HeroSection } from './components/HeroSection.jsx';
import { Navbar } from './components/Navbar.jsx';
import { OrdersView } from './components/OrdersView.jsx';
import { ProductCard } from './components/ProductCard.jsx';
import { ProductDetailView } from './components/ProductDetailView.jsx';
import { SmartFinderView } from './components/SmartFinderView.jsx';
import { api } from './lib/api.js';
import { createRealtimeClient } from './lib/realtime.js';

const CATEGORIES = ['All', 'Laptops', 'Phones', 'Tablets', 'Audio', 'Wearables', 'Displays'];
const PRICE_RANGES = [
  { id: 'all', label: 'All Prices', min: 0, max: 0 },
  { id: 'under-50k', label: 'Under ₹50,000', min: 0, max: 49999 },
  { id: '50k-120k', label: '₹50,000 – ₹1,20,000', min: 50000, max: 120000 },
  { id: 'above-120k', label: 'Above ₹1,20,000', min: 120001, max: 0 },
];
const SPEC_FILTERS = [
  { id: 'all', label: 'All Specs' },
  { id: 'k4', label: 'K4 Silicon' },
  { id: 'a18', label: 'A18 Chip' },
  { id: 'oled', label: 'OLED Display' },
  { id: '120hz', label: '120Hz Motion' },
  { id: 'anc', label: 'ANC Audio' },
  { id: 'titanium', label: 'Titanium Build' },
];
const PAGE_SIZE = 12;
const RECENTLY_VIEWED_KEY = 'kanso_tech_recently_viewed';

const EMPTY_CART = {
  items: [],
  itemCount: 0,
  subtotalCents: 0,
  shippingCents: 0,
  totalCents: 0,
  freeShippingThresholdCents: 0,
  onlinePaymentsConfigured: false,
};

function parseRoute(pathname) {
  if (pathname.startsWith('/products/')) {
    const slug = decodeURIComponent(pathname.slice('/products/'.length)).replace(/\/+$/, '');
    if (slug) return { page: 'product', slug };
  }
  if (pathname === '/finder') return { page: 'finder', slug: null };
  if (pathname === '/compare') return { page: 'compare', slug: null };
  if (pathname === '/orders') return { page: 'orders', slug: null };
  if (pathname === '/account') return { page: 'account', slug: null };
  if (pathname === '/dispatch') return { page: 'dispatch', slug: null };
  return { page: 'store', slug: null };
}

function loadRecentlyViewedIds() {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const initialRoute = useMemo(() => parseRoute(window.location.pathname), []);

  const [activePage, setActivePage] = useState(initialRoute.page);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [allCatalogProducts, setAllCatalogProducts] = useState([]);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);

  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priceRange, setPriceRange] = useState('all');
  const [specFilter, setSpecFilter] = useState('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortOrder, setSortOrder] = useState('featured');
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [wishlistIds, setWishlistIds] = useState([]);
  const [compareIds, setCompareIds] = useState([]);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState(loadRecentlyViewedIds);

  const [user, setUser] = useState(null);
  const [cart, setCart] = useState(EMPTY_CART);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartInitialStep, setCartInitialStep] = useState('cart');

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [activeShoppers, setActiveShoppers] = useState(1);
  const [liveViewers, setLiveViewers] = useState(1);
  const [toastMessage, setToastMessage] = useState(null);
  const [authNotice, setAuthNotice] = useState(null);

  const catalogRef = useRef(null);
  const realtimeRef = useRef(null);
  const toastTimerRef = useRef(null);
  const selectedSlugRef = useRef(initialRoute.slug);
  const userRef = useRef(null);
  const pendingRedirectRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const showToast = useCallback((message) => {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  const recordRecentlyViewed = useCallback((productId) => {
    setRecentlyViewedIds((prev) => {
      const next = [productId, ...prev.filter((id) => id !== productId)].slice(0, 4);
      try {
        localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const pushRoute = useCallback((path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      const nextCart = await api.getCart();
      setCart(nextCart);
    } catch {
      // Keep current cart
    }
  }, []);

  const refreshWishlist = useCallback(async () => {
    try {
      const res = await api.getWishlist();
      setWishlistIds(Array.isArray(res?.productIds) ? res.productIds : []);
    } catch {
      // Keep current wishlist
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const list = await api.listOrders();
      setOrders(list);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const requireSignedInAction = useCallback(
    (reason, overrideTarget = null) => {
      if (userRef.current) return true;
      const target =
        overrideTarget ||
        (activePage === 'product' && selectedProduct
          ? { page: 'product', product: selectedProduct, slug: selectedProduct.slug }
          : { page: activePage === 'account' ? 'store' : activePage, slug: null });
      pendingRedirectRef.current = target;
      const noticeText = reason || 'Please sign in to access bag, ordering, and recommendations.';
      setAuthNotice(noticeText);
      showToast(noticeText);
      setActivePage('account');
      setSelectedProduct(null);
      selectedSlugRef.current = null;
      realtimeRef.current?.watchProduct(null);
      pushRoute('/account');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    },
    [activePage, selectedProduct, pushRoute, showToast]
  );

  const toggleWishlist = useCallback(
    async (product) => {
      if (!requireSignedInAction('Sign in to save hardware items to your wishlist.')) return;
      const exists = wishlistIds.includes(product.id);
      try {
        const res = exists
          ? await api.removeFromWishlist(product.id)
          : await api.addToWishlist(product.id);
        setWishlistIds(Array.isArray(res?.productIds) ? res.productIds : []);
        showToast(exists ? `Removed ${product.name} from saved items` : `Saved ${product.name} to wishlist`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to update wishlist');
      }
    },
    [wishlistIds, showToast, requireSignedInAction]
  );

  const toggleCompare = useCallback(
    (product) => {
      if (!requireSignedInAction('Sign in to add devices to your comparison list.')) return;
      setCompareIds((prev) => {
        if (prev.includes(product.id)) {
          showToast(`Removed ${product.name} from compare`);
          return prev.filter((id) => id !== product.id);
        }
        if (prev.length >= 4) {
          showToast('Comparison holds up to 4 devices. Replacing oldest selection.');
          return [...prev.slice(1), product.id];
        }
        showToast(`Added ${product.name} to compare`);
        return [...prev, product.id];
      });
    },
    [showToast, requireSignedInAction]
  );

  const loadProducts = useCallback(async (cat, q, sort, rangeId, spec, stockOnly) => {
    setProductsLoading(true);
    setProductsError(null);
    const rangeObj = PRICE_RANGES.find((r) => r.id === rangeId) || PRICE_RANGES[0];
    try {
      const list = await api.listProducts({
        category: cat,
        q,
        sort,
        minPrice: rangeObj.min,
        maxPrice: rangeObj.max,
        spec,
        inStockOnly: stockOnly,
      });
      setProducts(list);
    } catch (err) {
      setProductsError(err instanceof Error ? err.message : 'Unable to load hardware catalog.');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [me, fullList] = await Promise.all([api.getMe(), api.listProducts()]);
        setUser(me);
        userRef.current = me;
        setAllCatalogProducts(fullList);

        if (me) {
          const [initialCart, initialWishlist] = await Promise.all([
            api.getCart(),
            api.getWishlist(),
          ]);
          setCart(initialCart);
          setWishlistIds(Array.isArray(initialWishlist?.productIds) ? initialWishlist.productIds : []);
          if (initialRoute.page === 'orders' || initialRoute.page === 'account') {
            void refreshOrders();
          }
        } else {
          setCart(EMPTY_CART);
          setWishlistIds([]);
          setOrders([]);
        }

        if (initialRoute.page === 'product' && initialRoute.slug) {
          const matched = fullList.find((p) => p.slug === initialRoute.slug);
          if (matched) {
            setSelectedProduct(matched);
            recordRecentlyViewed(matched.id);
          } else {
            try {
              const fetched = await api.getProduct(initialRoute.slug);
              setSelectedProduct(fetched);
              recordRecentlyViewed(fetched.id);
            } catch {
              setActivePage('store');
              pushRoute('/');
            }
          }
        }
      } catch {
        // Ignore bootstrap errors
      }
    })();
  }, [initialRoute.page, initialRoute.slug, pushRoute, refreshOrders, recordRecentlyViewed]);

  useEffect(() => {
    const handlePopState = async () => {
      const route = parseRoute(window.location.pathname);
      setActivePage(route.page);
      if (route.page === 'product' && route.slug) {
        selectedSlugRef.current = route.slug;
        try {
          const fetched = await api.getProduct(route.slug);
          setSelectedProduct(fetched);
          recordRecentlyViewed(fetched.id);
          realtimeRef.current?.watchProduct(fetched.slug);
        } catch {
          setActivePage('store');
        }
      } else {
        selectedSlugRef.current = null;
        setSelectedProduct(null);
        realtimeRef.current?.watchProduct(null);
        if ((route.page === 'orders' || route.page === 'account') && userRef.current) {
          void refreshOrders();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [refreshOrders, recordRecentlyViewed]);

  useEffect(() => {
    const client = createRealtimeClient({
      onEvent: (type, payload) => {
        if (type === 'connection:ready' || type === 'presence:updated') {
          if (typeof payload?.activeShoppers === 'number') {
            setActiveShoppers(payload.activeShoppers);
          }
        } else if (type === 'product:viewers') {
          if (payload?.slug === selectedSlugRef.current && typeof payload?.viewers === 'number') {
            setLiveViewers(payload.viewers);
          }
        } else if (type === 'inventory:updated' && payload) {
          const updateStock = (list) =>
            list.map((p) => (p.id === payload.productId ? { ...p, stock: payload.stock } : p));

          setProducts(updateStock);
          setAllCatalogProducts(updateStock);
          setSelectedProduct((prev) =>
            prev && prev.id === payload.productId ? { ...prev, stock: payload.stock } : prev
          );
        } else if (type === 'cart:updated' && payload) {
          setCart(payload);
        } else if (type === 'wishlist:updated' && payload) {
          if (Array.isArray(payload.productIds)) {
            setWishlistIds(payload.productIds);
          }
        } else if (type === 'order:created' && payload) {
          setOrders((prev) => {
            if (prev.some((o) => o.orderNumber === payload.orderNumber)) return prev;
            return [payload, ...prev];
          });
        } else if (type === 'order:updated' && payload) {
          setOrders((prev) => {
            const exists = prev.some((o) => o.orderNumber === payload.orderNumber);
            if (!exists) return prev;
            showToast(`Order #${payload.orderNumber} updated to ${payload.status}`);
            return prev.map((o) => (o.orderNumber === payload.orderNumber ? payload : o));
          });
        }
      },
    });

    realtimeRef.current = client;
    return () => {
      client.close();
      realtimeRef.current = null;
    };
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts(categoryFilter, searchQuery, sortOrder, priceRange, specFilter, inStockOnly);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [categoryFilter, searchQuery, sortOrder, priceRange, specFilter, inStockOnly, loadProducts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, priceRange, specFilter, inStockOnly, searchQuery, sortOrder, wishlistOnly]);

  const displayedProducts = useMemo(() => {
    if (!wishlistOnly) return products;
    return products.filter((p) => wishlistIds.includes(p.id));
  }, [products, wishlistOnly, wishlistIds]);

  const totalPages = Math.max(1, Math.ceil(displayedProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return displayedProducts.slice(start, start + PAGE_SIZE);
  }, [displayedProducts, currentPage]);

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !searchFocused) return [];
    const pool = allCatalogProducts.length > 0 ? allCatalogProducts : products;
    return pool
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.specs?.chip || '').toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [searchQuery, searchFocused, allCatalogProducts, products]);

  const recentlyViewedProducts = useMemo(() => {
    const pool = allCatalogProducts.length > 0 ? allCatalogProducts : products;
    return recentlyViewedIds.map((id) => pool.find((p) => p.id === id)).filter(Boolean);
  }, [recentlyViewedIds, allCatalogProducts, products]);

  const hasActiveFilters =
    categoryFilter !== 'All' ||
    priceRange !== 'all' ||
    specFilter !== 'all' ||
    inStockOnly ||
    Boolean(searchQuery.trim()) ||
    wishlistOnly;

  const resetAllFilters = () => {
    setCategoryFilter('All');
    setPriceRange('all');
    setSpecFilter('all');
    setInStockOnly(false);
    setSearchQuery('');
    setSortOrder('featured');
    setWishlistOnly(false);
  };

  const handleNavigateCatalog = (category) => {
    if (category) {
      setCategoryFilter(category);
    }
    setWishlistOnly(false);
    setActivePage('store');
    setSelectedProduct(null);
    selectedSlugRef.current = null;
    realtimeRef.current?.watchProduct(null);
    pushRoute('/');

    window.setTimeout(() => {
      if (category && category !== 'All') {
        catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 40);
  };

  const handleToggleWishlistView = () => {
    if (!requireSignedInAction('Sign in to view your saved wishlist items.', { page: 'store' })) return;
    const nextWishlistOnly = activePage !== 'store' ? true : !wishlistOnly;
    setWishlistOnly(nextWishlistOnly);
    setActivePage('store');
    setSelectedProduct(null);
    selectedSlugRef.current = null;
    realtimeRef.current?.watchProduct(null);
    pushRoute('/');
    window.setTimeout(() => {
      catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const handleNavigateFinder = () => {
    setActivePage('finder');
    setSelectedProduct(null);
    selectedSlugRef.current = null;
    realtimeRef.current?.watchProduct(null);
    pushRoute('/finder');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateCompare = () => {
    setActivePage('compare');
    setSelectedProduct(null);
    selectedSlugRef.current = null;
    realtimeRef.current?.watchProduct(null);
    pushRoute('/compare');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateOrders = () => {
    setActivePage('orders');
    setSelectedProduct(null);
    selectedSlugRef.current = null;
    realtimeRef.current?.watchProduct(null);
    pushRoute('/orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (userRef.current) {
      void refreshOrders();
    }
  };

  const handleNavigateAccount = (notice = null, returnTarget = null) => {
    if (typeof notice === 'string' && notice) {
      setAuthNotice(notice);
    } else {
      setAuthNotice(null);
    }
    if (returnTarget) {
      pendingRedirectRef.current = returnTarget;
    }
    setActivePage('account');
    setSelectedProduct(null);
    selectedSlugRef.current = null;
    realtimeRef.current?.watchProduct(null);
    pushRoute('/account');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (userRef.current) {
      void refreshOrders();
    }
  };

  const handleNavigateDispatch = () => {
    setActivePage('dispatch');
    setSelectedProduct(null);
    selectedSlugRef.current = null;
    realtimeRef.current?.watchProduct(null);
    pushRoute('/dispatch');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectProduct = async (product) => {
    setSelectedProduct(product);
    selectedSlugRef.current = product.slug;
    setLiveViewers(1);
    setActivePage('product');
    setSearchFocused(false);
    recordRecentlyViewed(product.id);
    pushRoute(`/products/${encodeURIComponent(product.slug)}`);
    realtimeRef.current?.watchProduct(product.slug);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const fresh = await api.getProduct(product.slug);
      setSelectedProduct(fresh);
    } catch {
      // Retain existing details
    }
  };

  const handleConfigureFlagship = () => {
    const flagship =
      allCatalogProducts.find((p) => p.slug === 'kanso-book-pro-14') || products[0];
    if (flagship) {
      void handleSelectProduct(flagship);
    } else {
      catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleAddToCart = async (configPayload) => {
    if (!requireSignedInAction('Sign in to add products to your bag.')) return;
    const updated = await api.addToCart(configPayload);
    setCart(updated);
  };

  const handleBuyNow = async (configPayload) => {
    if (!requireSignedInAction('Sign in to order via Express Checkout.')) return;
    const updated = await api.addToCart(configPayload);
    setCart(updated);
    setCartInitialStep('checkout');
    setCartOpen(true);
  };

  const handleQuickAdd = async (product) => {
    if (!requireSignedInAction(`Sign in to add ${product.name} to your bag.`)) return;
    await handleAddToCart({
      productId: product.id,
      variant: product.variants[0] || 'Standard',
      storageLabel: product.storageOptions?.[0]?.label || '',
      careIncluded: false,
      engraving: '',
      quantity: 1,
    });
  };

  const handleUpdateQuantity = async (itemId, quantity) => {
    if (!requireSignedInAction('Sign in to manage your shopping bag.')) return;
    const updated = await api.updateCartQuantity(itemId, quantity);
    setCart(updated);
  };

  const handleRemoveCartItem = async (itemId) => {
    if (!requireSignedInAction('Sign in to manage your shopping bag.')) return;
    const updated = await api.removeCartItem(itemId);
    setCart(updated);
  };

  const handlePlaceOrder = async (payload) => {
    if (!requireSignedInAction('Sign in to place your order.')) {
      throw new Error('Authentication required to place order.');
    }
    const order = await api.createOrder(payload);
    await Promise.all([
      refreshCart(),
      loadProducts(categoryFilter, searchQuery, sortOrder, priceRange, specFilter, inStockOnly),
      refreshOrders(),
    ]);
    if (selectedProduct) {
      try {
        const refreshed = await api.getProduct(selectedProduct.slug);
        setSelectedProduct(refreshed);
      } catch {
        // Ignore
      }
    }
    return order;
  };

  const applyPendingRedirect = async () => {
    const pending = pendingRedirectRef.current;
    pendingRedirectRef.current = null;
    setAuthNotice(null);
    if (!pending) return;

    if (pending.page === 'product' && pending.slug) {
      const targetProd =
        pending.product ||
        allCatalogProducts.find((p) => p.slug === pending.slug) ||
        products.find((p) => p.slug === pending.slug);
      if (targetProd) {
        await handleSelectProduct(targetProd);
        return;
      }
    }
    if (pending.page === 'finder') {
      handleNavigateFinder();
      return;
    }
    if (pending.page === 'orders') {
      handleNavigateOrders();
      return;
    }
    if (pending.page === 'compare') {
      handleNavigateCompare();
      return;
    }
    if (pending.page === 'store') {
      handleNavigateCatalog('All');
    }
  };

  const handleLogin = async (email, password) => {
    const loggedInUser = await api.login(email, password);
    setUser(loggedInUser);
    userRef.current = loggedInUser;
    realtimeRef.current?.identifySession();
    await Promise.all([refreshCart(), refreshWishlist(), refreshOrders()]);
    await applyPendingRedirect();
  };

  const handleRegister = async (name, email, password) => {
    const createdUser = await api.register(name, email, password);
    setUser(createdUser);
    userRef.current = createdUser;
    realtimeRef.current?.identifySession();
    await Promise.all([refreshCart(), refreshWishlist(), refreshOrders()]);
    await applyPendingRedirect();
  };

  const handleAdminClaimed = async (adminUser) => {
    setUser(adminUser);
    userRef.current = adminUser;
    realtimeRef.current?.identifySession();
    await Promise.all([refreshCart(), refreshWishlist(), refreshOrders()]);
    showToast(`Administrator account ready for ${adminUser.email}`);
    await applyPendingRedirect();
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    userRef.current = null;
    pendingRedirectRef.current = null;
    setAuthNotice(null);
    setCart(EMPTY_CART);
    setWishlistIds([]);
    setCompareIds([]);
    setOrders([]);
    setWishlistOnly(false);
    setCartOpen(false);
    realtimeRef.current?.identifySession();
  };

  const relatedProducts = useMemo(() => {
    if (!selectedProduct) return [];
    const pool = allCatalogProducts.length > 0 ? allCatalogProducts : products;
    return pool.filter((p) => p.id !== selectedProduct.id && p.category === selectedProduct.category).slice(0, 3);
  }, [selectedProduct, allCatalogProducts, products]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F8FC] text-[#172033]">
      <AnnouncementBar onOpenFinder={handleNavigateFinder} />

      <Navbar
        activePage={activePage}
        cartCount={cart.itemCount}
        wishlistCount={wishlistIds.length}
        compareCount={compareIds.length}
        wishlistOnly={wishlistOnly}
        user={user}
        onNavigateCatalog={handleNavigateCatalog}
        onNavigateFinder={handleNavigateFinder}
        onNavigateCompare={handleNavigateCompare}
        onNavigateOrders={handleNavigateOrders}
        onNavigateAccount={() => handleNavigateAccount()}
        onNavigateDispatch={handleNavigateDispatch}
        onToggleWishlist={handleToggleWishlistView}
        onOpenCart={() => {
          if (!requireSignedInAction('Sign in to open your shopping bag and checkout.')) return;
          setCartInitialStep('cart');
          setCartOpen(true);
        }}
      />

      <main className="flex-1">
        {activePage === 'store' && (
          <>
            <HeroSection
              activeShoppers={activeShoppers}
              onConfigureFlagship={handleConfigureFlagship}
              onOpenFinder={handleNavigateFinder}
              onCompare={handleNavigateCompare}
            />

            <section
              ref={catalogRef}
              id="catalog"
              className="max-w-[1240px] mx-auto px-4 sm:px-6 py-12 lg:py-16"
            >
              <div className="flex flex-col gap-5 pb-8 mb-8 border-b border-[#E2E8F0]">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA] mb-2">
                      {wishlistOnly ? 'Synced Saved Hardware' : 'Kanso Tech Store Catalog'}
                    </p>
                    <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-[#101827] tracking-tight">
                      {wishlistOnly ? 'Your Wishlist.' : 'Precision Hardware.'}{' '}
                      <span className="text-[#64748B] font-normal">
                        {wishlistOnly
                          ? `${displayedProducts.length} saved device${displayedProducts.length === 1 ? '' : 's'}.`
                          : `${displayedProducts.length} device${displayedProducts.length === 1 ? '' : 's'} ready to order.`}
                      </span>
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-3.5 h-3.5 text-[#315ECA] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={searchQuery}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => window.setTimeout(() => setSearchFocused(false), 160)}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search devices, chips, OLED..."
                        aria-label="Search Kanso Tech catalog"
                        className="w-full pl-8 pr-7 py-2.5 text-xs bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#101827] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {searchSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-[#DCE3ED] rounded-[14px] shadow-xl overflow-hidden">
                          {searchSuggestions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onMouseDown={() => handleSelectProduct(item)}
                              className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-[#F5F8FC] flex items-center justify-between gap-2 border-b last:border-b-0 border-[#E2E8F0] cursor-pointer"
                            >
                              <span className="font-semibold text-[#101827] truncate">{item.name}</span>
                              <span className="text-[11px] text-[#315ECA] font-mono shrink-0">
                                {item.category}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <select
                      value={priceRange}
                      onChange={(e) => setPriceRange(e.target.value)}
                      aria-label="Filter by price range"
                      className="px-3 py-2.5 text-xs font-semibold bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA] cursor-pointer"
                    >
                      {PRICE_RANGES.map((range) => (
                        <option key={range.id} value={range.id}>
                          {range.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={specFilter}
                      onChange={(e) => setSpecFilter(e.target.value)}
                      aria-label="Filter by specification"
                      className="px-3 py-2.5 text-xs font-semibold bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA] cursor-pointer"
                    >
                      {SPEC_FILTERS.map((spec) => (
                        <option key={spec.id} value={spec.id}>
                          {spec.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                      aria-label="Sort products"
                      className="px-3 py-2.5 text-xs font-semibold bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA] cursor-pointer"
                    >
                      <option value="featured">Featured</option>
                      <option value="rating-desc">Highest Rated</option>
                      <option value="price-asc">Price: Low to High</option>
                      <option value="price-desc">Price: High to Low</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 p-1 bg-white border border-[#DCE3ED] rounded-[14px] overflow-x-auto max-w-full">
                    {CATEGORIES.map((cat) => {
                      const active = categoryFilter === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          className={`px-3.5 py-1.5 text-xs font-semibold rounded-[10px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'bg-[#315ECA] text-white shadow-xs'
                              : 'text-[#64748B] hover:text-[#315ECA] hover:bg-[#F5F8FC]'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInStockOnly((prev) => !prev)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-[12px] border transition-colors cursor-pointer ${
                        inStockOnly
                          ? 'bg-[#172B4D] text-white border-[#172B4D]'
                          : 'bg-white text-[#172033] border-[#DCE3ED] hover:border-[#315ECA]'
                      }`}
                    >
                      In Stock Only
                    </button>

                    {compareIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleNavigateCompare}
                        className="px-3.5 py-2 text-xs font-semibold rounded-[12px] bg-[#101827] text-white hover:bg-[#172B4D] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 text-[#5B8DEF]" />
                        <span>Compare ({compareIds.length})</span>
                      </button>
                    )}

                    {wishlistOnly && (
                      <button
                        type="button"
                        onClick={() => setWishlistOnly(false)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#315ECA] bg-white border border-[#315ECA] rounded-[12px] cursor-pointer"
                      >
                        <Heart className="w-3.5 h-3.5 fill-[#315ECA]" />
                        <span>Wishlist Active · Show All</span>
                      </button>
                    )}

                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#64748B] hover:text-[#101827] cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {productsError ? (
                <div className="kt-glass border-[#DC2626]/30 rounded-[20px] p-6 text-center text-sm text-[#DC2626] bg-white">
                  {productsError}
                </div>
              ) : productsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="kt-glass rounded-[20px] overflow-hidden animate-pulse bg-white"
                    >
                      <div className="aspect-[4/3] bg-[#DCE3ED]/60" />
                      <div className="p-6 space-y-3 bg-white">
                        <div className="h-3 w-24 bg-[#F5F8FC] rounded" />
                        <div className="h-5 w-44 bg-[#F5F8FC] rounded" />
                        <div className="h-4 w-full bg-[#F5F8FC] rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : paginatedProducts.length === 0 ? (
                <div className="kt-glass rounded-[20px] py-16 px-6 text-center bg-white">
                  <p className="font-display text-2xl font-bold text-[#101827] mb-1">
                    {wishlistOnly ? 'Your saved wishlist is empty' : 'No matching hardware found'}
                  </p>
                  <p className="text-sm text-[#64748B] mb-5">
                    {wishlistOnly
                      ? 'Tap the heart button on any product card to sync items to your wishlist.'
                      : 'Try clearing your search, price, or spec filters — or ask Smart Product Finder.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="kt-btn-primary px-5 py-2.5 text-xs font-semibold cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                    <button
                      type="button"
                      onClick={handleNavigateFinder}
                      className="kt-btn-secondary px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#315ECA]" />
                      <span>Open Smart Finder</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                    {paginatedProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        isAuthenticated={Boolean(user)}
                        wishlisted={wishlistIds.includes(product.id)}
                        compared={compareIds.includes(product.id)}
                        onToggleWishlist={toggleWishlist}
                        onToggleCompare={toggleCompare}
                        onSelect={handleSelectProduct}
                        onQuickAdd={handleQuickAdd}
                        onRequireAuth={(msg) => requireSignedInAction(msg, { page: 'store' })}
                      />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => {
                          setCurrentPage((p) => Math.max(1, p - 1));
                          catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="kt-btn-secondary px-4 py-2 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Previous
                      </button>

                      {Array.from({ length: totalPages }).map((_, idx) => {
                        const pageNum = idx + 1;
                        const active = currentPage === pageNum;
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => {
                              setCurrentPage(pageNum);
                              catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className={`w-9 h-9 text-xs font-mono font-bold rounded-[12px] transition-colors cursor-pointer ${
                              active
                                ? 'bg-[#315ECA] text-white shadow-sm'
                                : 'bg-white border border-[#DCE3ED] text-[#172033] hover:border-[#315ECA] hover:text-[#315ECA]'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => {
                          setCurrentPage((p) => Math.min(totalPages, p + 1));
                          catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="kt-btn-secondary px-4 py-2 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}

              {recentlyViewedProducts.length > 0 && (
                <div className="mt-16 pt-10 border-t border-[#E2E8F0]">
                  <div className="flex items-center justify-between gap-4 mb-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#315ECA]">
                        Recently Explored
                      </p>
                      <h3 className="font-display text-2xl font-extrabold text-[#101827]">
                        Pick up where you left off
                      </h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {recentlyViewedProducts.map((item) => (
                      <ProductCard
                        key={item.id}
                        product={item}
                        isAuthenticated={Boolean(user)}
                        wishlisted={wishlistIds.includes(item.id)}
                        compared={compareIds.includes(item.id)}
                        onToggleWishlist={toggleWishlist}
                        onToggleCompare={toggleCompare}
                        onSelect={handleSelectProduct}
                        onQuickAdd={handleQuickAdd}
                        onRequireAuth={(msg) => requireSignedInAction(msg, { page: 'store' })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>

            <CraftsmanshipSection
              onCompare={handleNavigateCompare}
              onOpenFinder={handleNavigateFinder}
            />
          </>
        )}

        {activePage === 'finder' && (
          <SmartFinderView
            isAuthenticated={Boolean(user)}
            compareIds={compareIds}
            onSelectProduct={handleSelectProduct}
            onToggleCompare={toggleCompare}
            onQuickAdd={handleQuickAdd}
            onBrowseCatalog={() => handleNavigateCatalog('All')}
            onRequireAuth={(msg) => requireSignedInAction(msg, { page: 'finder' })}
          />
        )}

        {activePage === 'product' && selectedProduct && (
          <ProductDetailView
            product={selectedProduct}
            isAuthenticated={Boolean(user)}
            relatedProducts={relatedProducts}
            liveViewers={liveViewers}
            wishlistIds={wishlistIds}
            compareIds={compareIds}
            onToggleWishlist={toggleWishlist}
            onToggleCompare={toggleCompare}
            onBack={() => handleNavigateCatalog()}
            onSelectProduct={handleSelectProduct}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onRequireAuth={(msg) =>
              requireSignedInAction(msg, {
                page: 'product',
                product: selectedProduct,
                slug: selectedProduct.slug,
              })
            }
          />
        )}

        {activePage === 'compare' && (
          <CompareView
            products={allCatalogProducts.length > 0 ? allCatalogProducts : products}
            isAuthenticated={Boolean(user)}
            compareIds={compareIds}
            onSetCompareIds={setCompareIds}
            onSelectProduct={handleSelectProduct}
            onQuickAdd={handleQuickAdd}
            onOpenFinder={handleNavigateFinder}
            onRequireAuth={(msg) => requireSignedInAction(msg, { page: 'compare' })}
          />
        )}

        {activePage === 'orders' && (
          <OrdersView
            orders={orders}
            loading={ordersLoading}
            user={user}
            onNavigateAccount={() =>
              handleNavigateAccount('Sign in to track orders, deliveries, and invoices.', {
                page: 'orders',
              })
            }
            onBrowseCatalog={() => handleNavigateCatalog('All')}
            onOrderUpdated={(updated) => {
              setOrders((prev) =>
                prev.map((o) => (o.orderNumber === updated.orderNumber ? updated : o))
              );
              showToast(`Order #${updated.orderNumber} updated to ${updated.status}`);
            }}
          />
        )}

        {activePage === 'account' && (
          <AccountView
            user={user}
            orders={orders}
            wishlistCount={wishlistIds.length}
            authNotice={authNotice}
            onLogin={handleLogin}
            onRegister={handleRegister}
            onAdminClaimed={handleAdminClaimed}
            onLogout={handleLogout}
            onViewOrders={handleNavigateOrders}
            onOpenDispatch={handleNavigateDispatch}
            onBrowseCatalog={() => handleNavigateCatalog('All')}
          />
        )}

        {activePage === 'dispatch' && (
          <DispatchView
            user={user}
            products={allCatalogProducts.length > 0 ? allCatalogProducts : products}
            onNavigateAccount={() => handleNavigateAccount(null, { page: 'dispatch' })}
            onStockAdjusted={(updated) => {
              setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              setAllCatalogProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              showToast(`Updated ${updated.name} stock to ${updated.stock}`);
            }}
            onOrderStatusUpdated={(updated) => {
              setOrders((prev) =>
                prev.map((o) => (o.orderNumber === updated.orderNumber ? updated : o))
              );
              showToast(`Order #${updated.orderNumber} marked ${updated.status}`);
            }}
          />
        )}
      </main>

      <Footer
        user={user}
        onNavigateCatalog={handleNavigateCatalog}
        onNavigateFinder={handleNavigateFinder}
        onNavigateCompare={handleNavigateCompare}
        onNavigateOrders={handleNavigateOrders}
        onNavigateAccount={() => handleNavigateAccount()}
        onNavigateDispatch={handleNavigateDispatch}
      />

      <CartDrawer
        open={cartOpen}
        initialStep={cartInitialStep}
        cart={cart}
        user={user}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveCartItem}
        onPlaceOrder={handlePlaceOrder}
        onViewOrders={handleNavigateOrders}
      />

      {toastMessage && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-50 bg-[#101827] text-[#F5F8FC] text-xs font-semibold px-4 py-3 rounded-[14px] shadow-xl flex items-center gap-3 border border-[#315ECA]/60"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss notification"
            className="text-[#DCE3ED] hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
