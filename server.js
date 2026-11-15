import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import {
  clearAuthCookie,
  createRateLimiter,
  getAuthFromRequest,
  getGuestSessionId,
  hashPassword,
  setAuthCookie,
  signAuthToken,
  timingSafeEqualsString,
  verifyPassword,
} from './src/server/auth.js';
import {
  clearRuntimeAdminSetupToken,
  db,
  FREE_SHIPPING_THRESHOLD_CENTS,
  getAdminCount,
  getRuntimeAdminSetupToken,
  hydrateOrder,
  initDatabase,
  mapProductRow,
  mapUserRow,
  STANDARD_SHIPPING_CENTS,
} from './src/server/db.js';
import { runSmartProductFinder } from './src/server/finder.js';
import {
  broadcastAll,
  broadcastOrderEvent,
  broadcastToOwner,
  setupRealtimeServer,
} from './src/server/realtime.js';

const ALLOWED_ORDER_STATUSES = [
  'Confirmed',
  'Preparing Shipment',
  'Shipped',
  'Delivered',
  'Cancelled',
];

const COUPONS = {
  KANSO10: {
    code: 'KANSO10',
    type: 'percent',
    value: 10,
    minSubtotalCents: 2500000,
    maxDiscountCents: 1500000,
    description: '10% off orders ₹25,000+ (up to ₹15,000 savings)',
  },
  TECH5000: {
    code: 'TECH5000',
    type: 'flat',
    valueCents: 500000,
    minSubtotalCents: 7500000,
    description: 'Flat ₹5,000 off orders ₹75,000+',
  },
};

function evaluateCoupon(rawCode, subtotalCents) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!code) {
    return { valid: true, couponCode: '', discountCents: 0, description: '', error: null };
  }

  const rule = COUPONS[code];
  if (!rule) {
    return {
      valid: false,
      couponCode: code,
      discountCents: 0,
      description: '',
      error: `Promo code "${code}" is invalid. Active codes: KANSO10, TECH5000.`,
    };
  }

  if (subtotalCents < rule.minSubtotalCents) {
    const minRupees = Math.round(rule.minSubtotalCents / 100).toLocaleString('en-IN');
    return {
      valid: false,
      couponCode: code,
      discountCents: 0,
      description: rule.description,
      error: `Promo code ${rule.code} requires a minimum subtotal of ₹${minRupees}.`,
    };
  }

  let discountCents =
    rule.type === 'percent'
      ? Math.round((subtotalCents * rule.value) / 100)
      : rule.valueCents;

  if (rule.maxDiscountCents) {
    discountCents = Math.min(discountCents, rule.maxDiscountCents);
  }
  discountCents = Math.min(discountCents, subtotalCents);

  return {
    valid: true,
    couponCode: rule.code,
    discountCents,
    description: rule.description,
    error: null,
  };
}

function getCartSummary(userId, sessionId) {
  const rows = userId
    ? db
        .prepare(`
          SELECT
            c.id, c.product_id, c.variant, c.storage_label, c.care_included, c.engraving, c.unit_price_cents, c.quantity,
            p.slug, p.sku, p.name, p.category, p.image_key, p.price_cents, p.stock
          FROM cart_items c
          JOIN products p ON p.id = c.product_id
          WHERE c.user_id = ?
          ORDER BY c.id ASC
        `)
        .all(userId)
    : db
        .prepare(`
          SELECT
            c.id, c.product_id, c.variant, c.storage_label, c.care_included, c.engraving, c.unit_price_cents, c.quantity,
            p.slug, p.sku, p.name, p.category, p.image_key, p.price_cents, p.stock
          FROM cart_items c
          JOIN products p ON p.id = c.product_id
          WHERE c.session_id = ? AND c.user_id IS NULL
          ORDER BY c.id ASC
        `)
        .all(sessionId);

  const items = rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    slug: r.slug,
    sku: r.sku,
    name: r.name,
    category: r.category,
    imageKey: r.image_key,
    variant: r.variant,
    storageLabel: r.storage_label || '',
    careIncluded: r.care_included === 1,
    engraving: r.engraving || '',
    priceCents: r.unit_price_cents > 0 ? r.unit_price_cents : r.price_cents,
    stock: r.stock,
    quantity: r.quantity,
  }));

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const shippingCents =
    subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
      ? 0
      : STANDARD_SHIPPING_CENTS;

  return {
    items,
    itemCount,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    freeShippingThresholdCents: FREE_SHIPPING_THRESHOLD_CENTS,
  };
}

function getWishlistSummary(userId, sessionId) {
  const rows = userId
    ? db
        .prepare(`
          SELECT p.*
          FROM wishlist_items w
          JOIN products p ON p.id = w.product_id
          WHERE w.user_id = ?
          ORDER BY w.id DESC
        `)
        .all(userId)
    : db
        .prepare(`
          SELECT p.*
          FROM wishlist_items w
          JOIN products p ON p.id = w.product_id
          WHERE w.session_id = ? AND w.user_id IS NULL
          ORDER BY w.id DESC
        `)
        .all(sessionId);

  const items = rows.map(mapProductRow);
  return {
    productIds: items.map((item) => item.id),
    items,
  };
}

function mergeGuestStateIntoUser(guestSessionId, userId) {
  if (!guestSessionId || !userId) return;

  const mergeTx = db.transaction(() => {
    const guestCartRows = db
      .prepare('SELECT id, product_id, variant, engraving, care_included, quantity FROM cart_items WHERE session_id = ? AND user_id IS NULL')
      .all(guestSessionId);

    for (const g of guestCartRows) {
      const existing = db
        .prepare(
          'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND variant = ? AND engraving = ? AND care_included = ?'
        )
        .get(userId, g.product_id, g.variant, g.engraving || '', g.care_included || 0);

      if (existing) {
        db.prepare("UPDATE cart_items SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?").run(
          g.quantity,
          existing.id
        );
        db.prepare('DELETE FROM cart_items WHERE id = ?').run(g.id);
      } else {
        db.prepare("UPDATE cart_items SET user_id = ?, session_id = NULL, updated_at = datetime('now') WHERE id = ?").run(
          userId,
          g.id
        );
      }
    }

    const guestWishlistRows = db
      .prepare('SELECT id, product_id FROM wishlist_items WHERE session_id = ? AND user_id IS NULL')
      .all(guestSessionId);

    for (const w of guestWishlistRows) {
      const exists = db
        .prepare('SELECT id FROM wishlist_items WHERE user_id = ? AND product_id = ?')
        .get(userId, w.product_id);
      if (exists) {
        db.prepare('DELETE FROM wishlist_items WHERE id = ?').run(w.id);
      } else {
        db.prepare('UPDATE wishlist_items SET user_id = ?, session_id = NULL WHERE id = ?').run(userId, w.id);
      }
    }
  });

  mergeTx();
}

function isOnlineGatewayConfigured() {
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(
    (razorpaySecret && !razorpaySecret.startsWith('replace-')) ||
      (stripeSecret && !stripeSecret.startsWith('replace-'))
  );
}

function escapeHtml(val) {
  return String(val ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInrHtml(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(Number(paise || 0) / 100));
}

function renderInvoiceHtml(order) {
  const rowsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td>
          <strong>${escapeHtml(item.productName)}</strong>
          <div style="font-size:12px;color:#64748B;">${escapeHtml(item.variant)} · SKU ${escapeHtml(item.productSku)}${
            item.careIncluded ? ' · +KansoCare+' : ''
          }${item.engraving ? ` · Engraving: "${escapeHtml(item.engraving)}"` : ''}</div>
        </td>
        <td style="text-align:center;">${item.quantity}</td>
        <td style="text-align:right;font-family:monospace;">${formatInrHtml(item.unitPriceCents)}</td>
        <td style="text-align:right;font-family:monospace;font-weight:700;">${formatInrHtml(
          item.unitPriceCents * item.quantity
        )}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Kanso Tech Tax Invoice #${escapeHtml(order.orderNumber)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #172033; background: #F5F8FC; margin: 0; padding: 32px; }
    .sheet { max-width: 780px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 36px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #DCE3ED; padding-bottom: 20px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: 800; color: #101827; letter-spacing: -0.02em; }
    .tagline { font-size: 12px; color: #315ECA; font-weight: 600; margin-top: 2px; }
    .meta { text-align: right; font-size: 13px; color: #64748B; }
    .meta strong { color: #172033; font-family: monospace; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; font-size: 13px; }
    .box { background: #F5F8FC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; }
    .box h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #315ECA; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748B; padding: 10px 8px; border-bottom: 1px solid #DCE3ED; }
    td { padding: 12px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
    .totals { max-width: 300px; margin-left: auto; font-size: 14px; }
    .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
    .totals .grand { border-top: 2px solid #101827; margin-top: 6px; padding-top: 10px; font-size: 17px; font-weight: 800; color: #101827; }
    .actions { margin-top: 24px; text-align: right; }
    .btn { background: #315ECA; color: #FFF; border: 0; border-radius: 10px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
    @media print { body { background: #FFF; padding: 0; } .sheet { border: 0; } .actions { display: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">Kanso Tech</div>
        <div class="tagline">Premium Technology. Thoughtfully Designed.</div>
      </div>
      <div class="meta">
        <div>INVOICE <strong>#${escapeHtml(order.orderNumber)}</strong></div>
        <div>Issued: ${escapeHtml(order.createdAt)}</div>
        <div>Status: ${escapeHtml(order.status)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <h3>Billed &amp; Shipped To</h3>
        <div><strong>${escapeHtml(order.customerName)}</strong></div>
        <div>${escapeHtml(order.customerEmail)} · ${escapeHtml(order.phone)}</div>
        <div>${escapeHtml(order.shippingAddress)}</div>
        <div>${escapeHtml(order.city)} — ${escapeHtml(order.postalCode)}</div>
      </div>
      <div class="box">
        <h3>Payment &amp; Fulfillment</h3>
        <div>Method: <strong>${escapeHtml(order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Card / UPI')}</strong></div>
        <div>Payment Status: <strong>${escapeHtml(order.paymentStatus)}</strong></div>
        <div>Fulfillment: <strong>${escapeHtml(order.shippingStatus)}</strong></div>
        ${order.couponCode ? `<div>Promo Applied: <strong>${escapeHtml(order.couponCode)}</strong></div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Hardware Item</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Unit Price</th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span style="font-family:monospace;">${formatInrHtml(order.subtotalCents)}</span></div>
      ${
        order.discountCents > 0
          ? `<div style="color:#16A34A;"><span>Promo (${escapeHtml(order.couponCode)})</span><span style="font-family:monospace;">-${formatInrHtml(order.discountCents)}</span></div>`
          : ''
      }
      <div><span>Express Shipping</span><span>${order.shippingCents === 0 ? 'Free' : formatInrHtml(order.shippingCents)}</span></div>
      <div class="grand"><span>Total (INR)</span><span style="font-family:monospace;">${formatInrHtml(order.totalCents)}</span></div>
    </div>

    <div class="actions">
      <button class="btn" onclick="window.print()">Print / Save PDF</button>
    </div>
  </div>
</body>
</html>`;
}

export function createApp() {
  initDatabase();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 35,
    message: 'Too many authentication attempts. Please wait a few minutes and try again.',
  });

  const adminSetupLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many admin setup attempts. Please verify the setup token in server logs or environment variables.',
  });

  app.use((req, _res, next) => {
    const auth = getAuthFromRequest(req);
    if (!auth?.userId) {
      req.authUser = null;
      next();
      return;
    }

    const row = db
      .prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?')
      .get(auth.userId);
    req.authUser = row ? mapUserRow(row) : null;
    next();
  });

  function requireAuth(req, res, next) {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
      return;
    }
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.authUser.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges are required for this action.' });
      return;
    }
    next();
  }

  function canAccessOrder(req, guestId, orderRow) {
    if (!orderRow) return false;
    if (req.authUser?.role === 'admin') return true;
    if (orderRow.user_id && req.authUser?.id === orderRow.user_id) return true;
    if (!orderRow.user_id && orderRow.session_id && orderRow.session_id === guestId) return true;
    return false;
  }

  // Health & Payment capability status
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'kanso-tech-api',
      brand: 'Kanso Tech',
      runtime: 'javascript',
      onlinePaymentsConfigured: isOnlineGatewayConfigured(),
    });
  });

  // Catalog
  app.get('/api/products', (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'featured';
    const inStockOnly = req.query.inStockOnly === 'true' || req.query.inStockOnly === '1';
    const spec = typeof req.query.spec === 'string' ? req.query.spec.trim().toLowerCase() : '';
    const minPriceRupees = Number(req.query.minPrice || 0);
    const maxPriceRupees = Number(req.query.maxPrice || 0);

    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category && category !== 'All') {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (inStockOnly) {
      sql += ' AND stock > 0';
    }

    if (Number.isFinite(minPriceRupees) && minPriceRupees > 0) {
      sql += ' AND price_cents >= ?';
      params.push(Math.round(minPriceRupees * 100));
    }

    if (Number.isFinite(maxPriceRupees) && maxPriceRupees > 0) {
      sql += ' AND price_cents <= ?';
      params.push(Math.round(maxPriceRupees * 100));
    }

    if (q) {
      sql +=
        ' AND (LOWER(name) LIKE ? OR LOWER(short_description) LIKE ? OR LOWER(category) LIKE ? OR LOWER(materials) LIKE ? OR LOWER(specs_json) LIKE ? OR LOWER(sku) LIKE ?)';
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    if (spec && spec !== 'all') {
      sql += ' AND (LOWER(specs_json) LIKE ? OR LOWER(storage_options_json) LIKE ? OR LOWER(name) LIKE ?)';
      const specPattern = `%${spec}%`;
      params.push(specPattern, specPattern, specPattern);
    }

    if (sort === 'price-asc') {
      sql += ' ORDER BY price_cents ASC';
    } else if (sort === 'price-desc') {
      sql += ' ORDER BY price_cents DESC';
    } else {
      sql += ' ORDER BY id ASC';
    }

    let mapped = db.prepare(sql).all(...params).map(mapProductRow);
    if (sort === 'rating-desc') {
      mapped = mapped.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    }

    res.json({ products: mapped });
  });

  app.get('/api/products/:slug', (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE slug = ?').get(req.params.slug);
    if (!row) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ product: mapProductRow(row) });
  });

  app.patch('/api/products/:slug/stock', requireAdmin, (req, res) => {
    const delta = Number(req.body?.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 5000) {
      res.status(400).json({ error: 'Provide a non-zero integer stock delta within +/- 5000.' });
      return;
    }

    const row = db.prepare('SELECT * FROM products WHERE slug = ?').get(req.params.slug);
    if (!row) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const nextStock = Math.max(0, row.stock + delta);
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(nextStock, row.id);
    const updated = mapProductRow(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id));

    broadcastAll('inventory:updated', {
      productId: updated.id,
      slug: updated.slug,
      name: updated.name,
      stock: updated.stock,
    });

    res.json({ product: updated });
  });

  // Smart Product Finder (Authenticated)
  app.post('/api/finder', requireAuth, async (req, res) => {
    try {
      const result = await runSmartProductFinder(req.body || {});
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Unable to run Smart Product Finder right now.' });
    }
  });

  // Authentication & Setup
  app.get('/api/auth/setup-status', (_req, res) => {
    res.json({
      needsAdminSetup: getAdminCount() === 0,
      hasEnvSecret: Boolean(process.env.ADMIN_SETUP_SECRET?.trim()),
    });
  });

  app.post('/api/auth/setup-admin', adminSetupLimiter, (req, res) => {
    if (getAdminCount() > 0) {
      res.status(409).json({ error: 'An administrator account already exists.' });
      return;
    }

    const expectedSecret = process.env.ADMIN_SETUP_SECRET?.trim() || getRuntimeAdminSetupToken();
    const providedSecret = typeof req.body?.setupSecret === 'string' ? req.body.setupSecret.trim() : '';

    if (!expectedSecret || !timingSafeEqualsString(providedSecret, expectedSecret)) {
      res.status(403).json({ error: 'Invalid admin setup token.' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (name.length < 2) {
      res.status(400).json({ error: 'Please enter a valid admin name.' });
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const { hash, salt } = hashPassword(password);
    let userId;

    if (existing) {
      db.prepare("UPDATE users SET name = ?, password_hash = ?, salt = ?, role = 'admin' WHERE id = ?").run(
        name,
        hash,
        salt,
        existing.id
      );
      userId = existing.id;
    } else {
      const insert = db
        .prepare("INSERT INTO users (name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, 'admin')")
        .run(name, email, hash, salt);
      userId = Number(insert.lastInsertRowid);
    }

    clearRuntimeAdminSetupToken();

    const guestId = getGuestSessionId(req, res);
    mergeGuestStateIntoUser(guestId, userId);

    const userRow = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(userId);
    const user = mapUserRow(userRow);
    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setAuthCookie(req, res, token);

    res.status(201).json({ user, token });
  });

  app.post('/api/auth/register', authRateLimiter, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (name.length < 2) {
      res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    // Security: Always assign 'customer' role; never trust client-supplied role values.
    const { hash, salt } = hashPassword(password);
    const insert = db
      .prepare("INSERT INTO users (name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, 'customer')")
      .run(name, email, hash, salt);

    const userId = Number(insert.lastInsertRowid);
    const guestId = getGuestSessionId(req, res);
    mergeGuestStateIntoUser(guestId, userId);

    const userRow = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(userId);
    const user = mapUserRow(userRow);
    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setAuthCookie(req, res, token);

    res.status(201).json({ user, token });
  });

  app.post('/api/auth/login', authRateLimiter, (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db
      .prepare('SELECT id, name, email, role, password_hash, salt, created_at FROM users WHERE email = ?')
      .get(email);

    if (!row || !verifyPassword(password, row.password_hash, row.salt)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const guestId = getGuestSessionId(req, res);
    mergeGuestStateIntoUser(guestId, row.id);

    const user = mapUserRow(row);
    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setAuthCookie(req, res, token);

    res.json({ user, token });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearAuthCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: req.authUser || null });
  });

  // Persistent Wishlist (Authenticated users only)
  app.get('/api/wishlist', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const summary = getWishlistSummary(req.authUser.id, guestId);
    res.json(summary);
  });

  app.post('/api/wishlist', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const productId = Number(req.body?.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: 'Valid productId is required.' });
      return;
    }

    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    if (req.authUser) {
      db.prepare('INSERT OR IGNORE INTO wishlist_items (user_id, session_id, product_id) VALUES (?, NULL, ?)').run(
        req.authUser.id,
        productId
      );
    } else {
      db.prepare('INSERT OR IGNORE INTO wishlist_items (user_id, session_id, product_id) VALUES (NULL, ?, ?)').run(
        guestId,
        productId
      );
    }

    const summary = getWishlistSummary(req.authUser ? req.authUser.id : null, guestId);
    broadcastToOwner(req.authUser ? req.authUser.id : null, guestId, 'wishlist:updated', summary);
    res.json(summary);
  });

  app.delete('/api/wishlist/:productId', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: 'Valid productId is required.' });
      return;
    }

    if (req.authUser) {
      db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?').run(req.authUser.id, productId);
    } else {
      db.prepare('DELETE FROM wishlist_items WHERE session_id = ? AND user_id IS NULL AND product_id = ?').run(
        guestId,
        productId
      );
    }

    const summary = getWishlistSummary(req.authUser ? req.authUser.id : null, guestId);
    broadcastToOwner(req.authUser ? req.authUser.id : null, guestId, 'wishlist:updated', summary);
    res.json(summary);
  });

  // Shopping Cart & Coupons (Authenticated users only)
  app.get('/api/cart', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const summary = getCartSummary(req.authUser.id, guestId);
    res.json({ ...summary, guestSessionId: guestId, onlinePaymentsConfigured: isOnlineGatewayConfigured() });
  });

  app.post('/api/cart/coupon', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const cart = getCartSummary(req.authUser ? req.authUser.id : null, guestId);
    const couponCode = typeof req.body?.couponCode === 'string' ? req.body.couponCode.trim() : '';

    if (!couponCode) {
      res.json({
        valid: true,
        couponCode: '',
        discountCents: 0,
        description: '',
        subtotalCents: cart.subtotalCents,
        shippingCents: cart.shippingCents,
        totalCents: cart.totalCents,
      });
      return;
    }

    const evaluation = evaluateCoupon(couponCode, cart.subtotalCents);
    if (!evaluation.valid) {
      res.status(400).json({ error: evaluation.error });
      return;
    }

    res.json({
      valid: true,
      couponCode: evaluation.couponCode,
      discountCents: evaluation.discountCents,
      description: evaluation.description,
      subtotalCents: cart.subtotalCents,
      shippingCents: cart.shippingCents,
      totalCents: Math.max(0, cart.subtotalCents - evaluation.discountCents + cart.shippingCents),
    });
  });

  app.post('/api/cart', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const productId = Number(req.body?.productId);
    const rawQty = Number(req.body?.quantity ?? 1);
    const quantity = Number.isFinite(rawQty) ? Math.max(1, Math.min(20, Math.trunc(rawQty))) : 1;
    const requestedFinish = typeof req.body?.variant === 'string' ? req.body.variant.trim() : '';
    const requestedStorage = typeof req.body?.storageLabel === 'string' ? req.body.storageLabel.trim() : '';
    const careIncluded = Boolean(req.body?.careIncluded);
    const engraving = typeof req.body?.engraving === 'string' ? req.body.engraving.trim().slice(0, 24) : '';

    const productRow = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!productRow) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const product = mapProductRow(productRow);
    if (product.stock <= 0) {
      res.status(400).json({ error: 'This item is currently out of stock.' });
      return;
    }

    const finish =
      requestedFinish && product.variants.includes(requestedFinish)
        ? requestedFinish
        : product.variants[0] || 'Standard';

    const matchedStorage =
      product.storageOptions.find((opt) => opt.label === requestedStorage) ||
      product.storageOptions[0] || { label: '', deltaCents: 0 };

    const configuredPriceCents =
      product.priceCents +
      Number(matchedStorage.deltaCents || 0) +
      (careIncluded ? product.carePriceCents : 0);

    const variantLabel = matchedStorage.label ? `${finish} · ${matchedStorage.label}` : finish;

    const existing = req.authUser
      ? db
          .prepare(
            'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND variant = ? AND engraving = ? AND care_included = ?'
          )
          .get(req.authUser.id, product.id, variantLabel, engraving, careIncluded ? 1 : 0)
      : db
          .prepare(
            'SELECT id, quantity FROM cart_items WHERE session_id = ? AND user_id IS NULL AND product_id = ? AND variant = ? AND engraving = ? AND care_included = ?'
          )
          .get(guestId, product.id, variantLabel, engraving, careIncluded ? 1 : 0);

    if (existing) {
      const nextQty = Math.min(product.stock, existing.quantity + quantity);
      db.prepare("UPDATE cart_items SET quantity = ?, unit_price_cents = ?, updated_at = datetime('now') WHERE id = ?").run(
        nextQty,
        configuredPriceCents,
        existing.id
      );
    } else {
      const initialQty = Math.min(product.stock, quantity);
      db.prepare(
        `INSERT INTO cart_items (
          user_id, session_id, product_id, variant, storage_label, care_included, engraving, unit_price_cents, quantity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        req.authUser ? req.authUser.id : null,
        req.authUser ? null : guestId,
        product.id,
        variantLabel,
        matchedStorage.label,
        careIncluded ? 1 : 0,
        engraving,
        configuredPriceCents,
        initialQty
      );
    }

    const summary = getCartSummary(req.authUser ? req.authUser.id : null, guestId);
    broadcastToOwner(req.authUser ? req.authUser.id : null, guestId, 'cart:updated', summary);
    res.json(summary);
  });

  app.patch('/api/cart/:id', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const itemId = Number(req.params.id);
    const quantity = Number(req.body?.quantity);

    if (!Number.isFinite(quantity)) {
      res.status(400).json({ error: 'Invalid quantity.' });
      return;
    }

    const item = req.authUser
      ? db.prepare('SELECT id, product_id FROM cart_items WHERE id = ? AND user_id = ?').get(itemId, req.authUser.id)
      : db
          .prepare('SELECT id, product_id FROM cart_items WHERE id = ? AND session_id = ? AND user_id IS NULL')
          .get(itemId, guestId);

    if (!item) {
      res.status(404).json({ error: 'Cart item not found.' });
      return;
    }

    if (quantity <= 0) {
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
    } else {
      const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
      if (!product || product.stock <= 0) {
        db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
      } else {
        const clampedQty = Math.min(Math.max(1, Math.trunc(quantity)), product.stock);
        db.prepare("UPDATE cart_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(
          clampedQty,
          item.id
        );
      }
    }

    const summary = getCartSummary(req.authUser ? req.authUser.id : null, guestId);
    broadcastToOwner(req.authUser ? req.authUser.id : null, guestId, 'cart:updated', summary);
    res.json(summary);
  });

  app.delete('/api/cart/:id', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const itemId = Number(req.params.id);

    if (req.authUser) {
      db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(itemId, req.authUser.id);
    } else {
      db.prepare('DELETE FROM cart_items WHERE id = ? AND session_id = ? AND user_id IS NULL').run(itemId, guestId);
    }

    const summary = getCartSummary(req.authUser ? req.authUser.id : null, guestId);
    broadcastToOwner(req.authUser ? req.authUser.id : null, guestId, 'cart:updated', summary);
    res.json(summary);
  });

  // Orders & Checkout (Authenticated users only)
  app.post('/api/orders', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const body = req.body || {};

    const rawIdempotencyKey =
      (typeof req.headers['x-idempotency-key'] === 'string' && req.headers['x-idempotency-key'].trim()) ||
      (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()) ||
      null;
    const idempotencyKey = rawIdempotencyKey ? rawIdempotencyKey.slice(0, 120) : null;

    if (idempotencyKey) {
      const existingOrder = db
        .prepare('SELECT * FROM orders WHERE idempotency_key = ?')
        .get(idempotencyKey);
      if (existingOrder) {
        if (canAccessOrder(req, guestId, existingOrder)) {
          res.status(200).json({ order: hydrateOrder(existingOrder), idempotentReplay: true });
          return;
        }
        res.status(409).json({ error: 'Duplicate submission key conflict.' });
        return;
      }
    }

    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const shippingAddress = typeof body.shippingAddress === 'string' ? body.shippingAddress.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const postalCode = typeof body.postalCode === 'string' ? body.postalCode.trim() : '';
    const requestedPaymentMethod = body.paymentMethod === 'card' || body.paymentMethod === 'online' ? 'card' : 'cod';
    const couponInput = typeof body.couponCode === 'string' ? body.couponCode.trim() : '';

    if (
      customerName.length < 2 ||
      !customerEmail.includes('@') ||
      !customerEmail.includes('.') ||
      phone.length < 6 ||
      shippingAddress.length < 4 ||
      city.length < 2 ||
      postalCode.length < 4
    ) {
      res.status(400).json({ error: 'Please complete all shipping and contact fields accurately.' });
      return;
    }

    if (requestedPaymentMethod === 'card' && !isOnlineGatewayConfigured()) {
      res.status(400).json({
        error:
          'Online Card / UPI payments are unavailable because payment gateway credentials are not configured on this server. Please select Cash on Delivery.',
      });
      return;
    }

    const cart = getCartSummary(req.authUser ? req.authUser.id : null, guestId);
    if (cart.items.length === 0) {
      res.status(400).json({ error: 'Your shopping bag is empty.' });
      return;
    }

    const couponEval = evaluateCoupon(couponInput, cart.subtotalCents);
    if (!couponEval.valid) {
      res.status(400).json({ error: couponEval.error });
      return;
    }

    const discountCents = couponEval.discountCents;
    const totalCents = Math.max(0, cart.subtotalCents - discountCents + cart.shippingCents);
    const paymentStatus = requestedPaymentMethod === 'cod' ? 'Pending COD' : 'Authorized';

    try {
      const orderNumber = `KT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const updatedProducts = [];

      const createdOrderId = db.transaction(() => {
        for (const item of cart.items) {
          const deduct = db
            .prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
            .run(item.quantity, item.productId, item.quantity);

          if (deduct.changes !== 1) {
            throw new Error(`Insufficient warehouse stock for ${item.name}.`);
          }

          const updatedProd = db.prepare('SELECT id, slug, stock, name FROM products WHERE id = ?').get(item.productId);
          updatedProducts.push({
            productId: updatedProd.id,
            slug: updatedProd.slug,
            name: updatedProd.name,
            stock: updatedProd.stock,
          });
        }

        const orderRes = db
          .prepare(`
            INSERT INTO orders (
              order_number, user_id, session_id, customer_name, customer_email, phone,
              shipping_address, city, postal_code, payment_method, payment_status,
              shipping_status, status, subtotal_cents, discount_cents, coupon_code,
              shipping_cents, total_cents, idempotency_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', 'Confirmed', ?, ?, ?, ?, ?, ?)
          `)
          .run(
            orderNumber,
            req.authUser ? req.authUser.id : null,
            req.authUser ? null : guestId,
            customerName,
            customerEmail,
            phone,
            shippingAddress,
            city,
            postalCode,
            requestedPaymentMethod,
            paymentStatus,
            cart.subtotalCents,
            discountCents,
            couponEval.couponCode,
            cart.shippingCents,
            totalCents,
            idempotencyKey
          );

        const newOrderId = Number(orderRes.lastInsertRowid);
        const insertOrderItem = db.prepare(`
          INSERT INTO order_items (
            order_id, product_id, product_name, product_sku, image_key, variant, engraving, care_included, unit_price_cents, quantity
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of cart.items) {
          insertOrderItem.run(
            newOrderId,
            item.productId,
            item.name,
            item.sku,
            item.imageKey,
            item.variant,
            item.engraving || '',
            item.careIncluded ? 1 : 0,
            item.priceCents,
            item.quantity
          );
        }

        if (req.authUser) {
          db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.authUser.id);
        } else {
          db.prepare('DELETE FROM cart_items WHERE session_id = ? AND user_id IS NULL').run(guestId);
        }

        return newOrderId;
      })();

      const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(createdOrderId);
      const hydrated = hydrateOrder(orderRow);

      for (const delta of updatedProducts) {
        broadcastAll('inventory:updated', delta);
      }

      const emptyCart = getCartSummary(req.authUser ? req.authUser.id : null, guestId);
      broadcastToOwner(req.authUser ? req.authUser.id : null, guestId, 'cart:updated', emptyCart);
      broadcastOrderEvent('order:created', hydrated);

      res.status(201).json({ order: hydrated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to process order.';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/orders', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);

    const rows = req.authUser
      ? db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.authUser.id)
      : db.prepare('SELECT * FROM orders WHERE session_id = ? AND user_id IS NULL ORDER BY id DESC').all(guestId);

    res.json({ orders: rows.map(hydrateOrder) });
  });

  app.get('/api/orders/dispatch/all', requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 100').all();
    res.json({ orders: rows.map(hydrateOrder) });
  });

  app.get('/api/orders/:orderNumber', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const code = req.params.orderNumber.trim().toUpperCase();
    const row = db.prepare('SELECT * FROM orders WHERE UPPER(order_number) = ?').get(code);

    if (!row) {
      res.status(404).json({ error: 'Order not found. Please verify your order reference.' });
      return;
    }

    if (!canAccessOrder(req, guestId, row)) {
      res.status(403).json({
        error: 'You do not have permission to view this order.',
      });
      return;
    }

    res.json({ order: hydrateOrder(row) });
  });

  app.get('/api/orders/:orderNumber/invoice', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const code = req.params.orderNumber.trim().toUpperCase();
    const row = db.prepare('SELECT * FROM orders WHERE UPPER(order_number) = ?').get(code);

    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (!canAccessOrder(req, guestId, row)) {
      res.status(403).json({ error: 'Unauthorized invoice request.' });
      return;
    }

    const hydrated = hydrateOrder(row);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderInvoiceHtml(hydrated));
  });

  app.patch('/api/orders/:orderNumber/status', requireAuth, (req, res) => {
    const guestId = getGuestSessionId(req, res);
    const code = req.params.orderNumber.trim().toUpperCase();
    const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim() : '';

    if (!ALLOWED_ORDER_STATUSES.includes(nextStatus)) {
      res.status(400).json({ error: 'Invalid order status.' });
      return;
    }

    const orderRow = db.prepare('SELECT * FROM orders WHERE UPPER(order_number) = ?').get(code);
    if (!orderRow) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const isAdmin = req.authUser?.role === 'admin';
    const isOwner = canAccessOrder(req, guestId, orderRow);

    if (!isAdmin) {
      if (!isOwner) {
        res.status(req.authUser ? 403 : 401).json({ error: 'You are not authorized to modify this order.' });
        return;
      }
      if (nextStatus !== 'Cancelled') {
        res.status(403).json({ error: 'Only fulfillment administrators can advance shipping status.' });
        return;
      }
      if (orderRow.status !== 'Confirmed') {
        res.status(400).json({ error: 'Only orders in Confirmed status can be cancelled by customers.' });
        return;
      }
    }

    if (orderRow.status === 'Cancelled') {
      res.status(400).json({ error: 'Cancelled orders cannot be modified.' });
      return;
    }

    if (orderRow.status === nextStatus) {
      res.json({ order: hydrateOrder(orderRow) });
      return;
    }

    const restoredProducts = [];
    db.transaction(() => {
      let nextPaymentStatus = orderRow.payment_status;
      if (nextStatus === 'Cancelled') {
        nextPaymentStatus = orderRow.payment_method === 'cod' ? 'Cancelled' : 'Refunded';
      } else if (nextStatus === 'Delivered' && orderRow.payment_method === 'cod') {
        nextPaymentStatus = 'Paid (COD Collected)';
      }

      db.prepare('UPDATE orders SET status = ?, shipping_status = ?, payment_status = ? WHERE id = ?').run(
        nextStatus,
        nextStatus,
        nextPaymentStatus,
        orderRow.id
      );

      if (nextStatus === 'Cancelled') {
        const markRestored = db
          .prepare('UPDATE orders SET stock_restored = 1 WHERE id = ? AND stock_restored = 0')
          .run(orderRow.id);

        if (markRestored.changes === 1) {
          const items = db
            .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
            .all(orderRow.id);
          for (const item of items) {
            db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.product_id);
            const p = db.prepare('SELECT id, slug, name, stock FROM products WHERE id = ?').get(item.product_id);
            if (p) {
              restoredProducts.push({ productId: p.id, slug: p.slug, name: p.name, stock: p.stock });
            }
          }
        }
      }
    })();

    const updatedOrder = hydrateOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderRow.id));

    for (const delta of restoredProducts) {
      broadcastAll('inventory:updated', delta);
    }
    broadcastOrderEvent('order:updated', updatedOrder);

    res.json({ order: updatedOrder });
  });

  app.post('/api/newsletter', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email.includes('@') || !email.includes('.')) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)').run(email);
    res.status(201).json({ ok: true, email });
  });

  return app;
}

export async function startServer({ port = Number(process.env.PORT || 3000), serveFrontend = true } = {}) {
  const app = createApp();
  const httpServer = http.createServer(app);
  setupRealtimeServer(httpServer);

  if (serveFrontend) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(process.cwd(), 'dist');
      if (fs.existsSync(distDir)) {
        app.use(express.static(distDir));
        app.get('*', (req, res, next) => {
          if (req.path.startsWith('/api')) {
            next();
            return;
          }
          res.sendFile(path.join(distDir, 'index.html'));
        });
      }
    }
  }

  await new Promise((resolve) => {
    httpServer.listen(port, '0.0.0.0', resolve);
  });

  const address = httpServer.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  return { app, httpServer, port: boundPort };
}

const isMainEntry =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainEntry && process.env.KANSO_NO_LISTEN !== '1') {
  startServer()
    .then(({ port }) => {
      console.log(`Kanso Tech server running on http://localhost:${port}`);
    })
    .catch((err) => {
      console.error('Failed to start Kanso Tech server:', err);
      process.exit(1);
    });
}
