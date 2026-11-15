const TOKEN_KEY = 'kanso_auth_token';
const GUEST_KEY = 'kanso_guest_session';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

export function getOrCreateGuestKey() {
  try {
    let existing = localStorage.getItem(GUEST_KEY);
    if (!existing || existing.length < 8) {
      existing =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(GUEST_KEY, existing);
    }
    return existing;
  } catch {
    return 'guest-fallback-session';
  }
}

async function request(url, options = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('X-Guest-Session', getOrCreateGuestKey());

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  async listProducts(params) {
    const query = new URLSearchParams();
    if (params?.category && params.category !== 'All') query.set('category', params.category);
    if (params?.q) query.set('q', params.q);
    if (params?.sort) query.set('sort', params.sort);
    if (params?.inStockOnly) query.set('inStockOnly', 'true');
    if (params?.spec && params.spec !== 'all') query.set('spec', params.spec);
    if (params?.minPrice) query.set('minPrice', String(params.minPrice));
    if (params?.maxPrice) query.set('maxPrice', String(params.maxPrice));
    const qs = query.toString();
    const res = await request(`/api/products${qs ? `?${qs}` : ''}`);
    return res.products;
  },

  async getProduct(slug) {
    const res = await request(`/api/products/${encodeURIComponent(slug)}`);
    return res.product;
  },

  async adjustProductStock(slug, delta) {
    const res = await request(`/api/products/${encodeURIComponent(slug)}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ delta }),
    });
    return res.product;
  },

  async runFinder(payload) {
    return request('/api/finder', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getSetupStatus() {
    return request('/api/auth/setup-status');
  },

  async setupAdmin(payload) {
    const res = await request('/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    return res.user;
  },

  async getMe() {
    const res = await request('/api/auth/me');
    return res.user;
  },

  async register(name, email, password) {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  async login(email, password) {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  async logout() {
    await request('/api/auth/logout', { method: 'POST' });
    setStoredToken(null);
  },

  async getWishlist() {
    return request('/api/wishlist');
  },

  async addToWishlist(productId) {
    return request('/api/wishlist', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    });
  },

  async removeFromWishlist(productId) {
    return request(`/api/wishlist/${productId}`, {
      method: 'DELETE',
    });
  },

  async getCart() {
    return request('/api/cart');
  },

  async validateCoupon(couponCode) {
    return request('/api/cart/coupon', {
      method: 'POST',
      body: JSON.stringify({ couponCode }),
    });
  },

  async addToCart({
    productId,
    variant,
    storageLabel = '',
    careIncluded = false,
    engraving = '',
    quantity = 1,
  }) {
    return request('/api/cart', {
      method: 'POST',
      body: JSON.stringify({
        productId,
        variant,
        storageLabel,
        careIncluded,
        engraving,
        quantity,
      }),
    });
  },

  async updateCartQuantity(itemId, quantity) {
    return request(`/api/cart/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  },

  async removeCartItem(itemId) {
    return request(`/api/cart/${itemId}`, {
      method: 'DELETE',
    });
  },

  async createOrder(payload) {
    const headers = {};
    if (payload?.idempotencyKey) {
      headers['X-Idempotency-Key'] = payload.idempotencyKey;
    }
    const res = await request('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return res.order;
  },

  async listOrders() {
    const res = await request('/api/orders');
    return res.orders;
  },

  async listAllDispatchOrders() {
    const res = await request('/api/orders/dispatch/all');
    return res.orders;
  },

  async lookupOrder(orderNumber) {
    const res = await request(`/api/orders/${encodeURIComponent(orderNumber)}`);
    return res.order;
  },

  async fetchInvoiceHtml(orderNumber) {
    const headers = new Headers();
    const token = getStoredToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Guest-Session', getOrCreateGuestKey());

    const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/invoice`, {
      headers,
      credentials: 'include',
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Unable to generate invoice.');
    }
    return response.text();
  },

  async updateOrderStatus(orderNumber, status) {
    const res = await request(`/api/orders/${encodeURIComponent(orderNumber)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return res.order;
  },

  async subscribeNewsletter(email) {
    return request('/api/newsletter', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
};
