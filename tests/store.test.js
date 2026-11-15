import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanso-tech-test-'));
const testDbPath = path.join(tmpDir, 'test-store.db');

process.env.KANSO_DB_PATH = testDbPath;
process.env.SESSION_SECRET = 'test-suite-cryptographic-session-secret-kanso-tech';
process.env.ADMIN_EMAIL = 'admin@kansotech.com';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';
process.env.DISABLE_RATE_LIMIT = '1';
process.env.KANSO_NO_LISTEN = '1';

const { startServer } = await import('../server.js');

let baseUrl = '';
let wsBaseUrl = '';
let httpServerRef = null;

async function apiFetch(route, { method = 'GET', body, token, guestId, headers = {} } = {}) {
  const reqHeaders = new Headers(headers);
  if (body && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  if (token) reqHeaders.set('Authorization', `Bearer ${token}`);
  if (guestId) reqHeaders.set('X-Guest-Session', guestId);

  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

describe('Kanso Tech End-to-End Platform & Security Suite', () => {
  before(async () => {
    const started = await startServer({ port: 0, serveFrontend: false });
    httpServerRef = started.httpServer;
    baseUrl = `http://127.0.0.1:${started.port}`;
    wsBaseUrl = `ws://127.0.0.1:${started.port}/ws`;
  });

  after(async () => {
    if (httpServerRef) {
      await new Promise((resolve) => httpServerRef.close(resolve));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves health check and preserves seeded 72-device catalog and demo user data', async () => {
    const health = await apiFetch('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.brand, 'Kanso Tech');

    const catalog = await apiFetch('/api/products');
    assert.equal(catalog.status, 200);
    assert.equal(catalog.data.products.length, 72);

    const demoLogin = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'demo@kansogoods.com', password: 'demo1234' },
    });
    assert.equal(demoLogin.status, 200);
    assert.equal(demoLogin.data.user.name, 'Jahnavi Chaganti');
    assert.equal(demoLogin.data.user.role, 'customer');

    const sampleOrder = await apiFetch('/api/orders/KG-1042', {
      token: demoLogin.data.token,
    });
    assert.equal(sampleOrder.status, 200);
    assert.equal(sampleOrder.data.order.orderNumber, 'KG-1042');
  });

  it('prevents self-escalation on registration and enforces admin RBAC on inventory & dispatch', async () => {
    const reg = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Aarav Sharma',
        email: 'aarav@example.com',
        password: 'password123',
        role: 'admin',
      },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.role, 'customer');

    const productsRes = await apiFetch('/api/products');
    const firstSlug = productsRes.data.products[0].slug;

    const unauthStock = await apiFetch(`/api/products/${firstSlug}/stock`, {
      method: 'PATCH',
      body: { delta: 5 },
    });
    assert.equal(unauthStock.status, 401);

    const customerStock = await apiFetch(`/api/products/${firstSlug}/stock`, {
      method: 'PATCH',
      token: reg.data.token,
      body: { delta: 5 },
    });
    assert.equal(customerStock.status, 403);

    const customerDispatch = await apiFetch('/api/orders/dispatch/all', {
      token: reg.data.token,
    });
    assert.equal(customerDispatch.status, 403);

    const adminLogin = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@kansotech.com', password: 'AdminPassword123!' },
    });
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.data.user.role, 'admin');

    const adminDispatch = await apiFetch('/api/orders/dispatch/all', {
      token: adminLogin.data.token,
    });
    assert.equal(adminDispatch.status, 200);
    assert.ok(Array.isArray(adminDispatch.data.orders));

    const adminStock = await apiFetch(`/api/products/${firstSlug}/stock`, {
      method: 'PATCH',
      token: adminLogin.data.token,
      body: { delta: 2 },
    });
    assert.equal(adminStock.status, 200);
  });

  it('requires authentication for Smart Product Finder, wishlist, cart, coupons, and orders while allowing authenticated usage', async () => {
    const guestId = 'guest-blocked-session-001';
    const catalog = await apiFetch('/api/products');
    const laptop = catalog.data.products.find((p) => p.category === 'Laptops' && p.stock > 3);
    const audio = catalog.data.products.find((p) => p.category === 'Audio' && p.stock > 3);

    const unauthFinder = await apiFetch('/api/finder', {
      method: 'POST',
      guestId,
      body: { category: 'Laptops', budgetRupees: 165000, usage: 'programming' },
    });
    assert.equal(unauthFinder.status, 401);

    const unauthWishlistGet = await apiFetch('/api/wishlist', { guestId });
    assert.equal(unauthWishlistGet.status, 401);

    const unauthWishlistAdd = await apiFetch('/api/wishlist', {
      method: 'POST',
      guestId,
      body: { productId: audio.id },
    });
    assert.equal(unauthWishlistAdd.status, 401);

    const unauthCartGet = await apiFetch('/api/cart', { guestId });
    assert.equal(unauthCartGet.status, 401);

    const unauthCartAdd = await apiFetch('/api/cart', {
      method: 'POST',
      guestId,
      body: { productId: laptop.id, quantity: 1 },
    });
    assert.equal(unauthCartAdd.status, 401);

    const unauthCoupon = await apiFetch('/api/cart/coupon', {
      method: 'POST',
      guestId,
      body: { couponCode: 'KANSO10' },
    });
    assert.equal(unauthCoupon.status, 401);

    const unauthOrderPost = await apiFetch('/api/orders', {
      method: 'POST',
      guestId,
      body: {
        customerName: 'Guest Blocked',
        customerEmail: 'guest@example.com',
        phone: '+91 98480 00000',
        shippingAddress: '1 Road',
        city: 'Hyderabad',
        postalCode: '500001',
        paymentMethod: 'cod',
      },
    });
    assert.equal(unauthOrderPost.status, 401);

    const reg = await apiFetch('/api/auth/register', {
      method: 'POST',
      guestId,
      body: {
        name: 'Meera Nair',
        email: 'meera@example.com',
        password: 'password123',
      },
    });
    assert.equal(reg.status, 201);

    const wishAdd = await apiFetch('/api/wishlist', {
      method: 'POST',
      token: reg.data.token,
      body: { productId: audio.id },
    });
    assert.equal(wishAdd.status, 200);
    assert.ok(wishAdd.data.productIds.includes(audio.id));

    const cartAdd = await apiFetch('/api/cart', {
      method: 'POST',
      token: reg.data.token,
      body: { productId: laptop.id, quantity: 1 },
    });
    assert.equal(cartAdd.status, 200);
    assert.equal(cartAdd.data.itemCount, 1);

    const userCart = await apiFetch('/api/cart', { token: reg.data.token });
    assert.equal(userCart.data.itemCount, 1);
    assert.equal(userCart.data.items[0].productId, laptop.id);

    const userWishlist = await apiFetch('/api/wishlist', { token: reg.data.token });
    assert.ok(userWishlist.data.productIds.includes(audio.id));
  });

  it('supports promo validation, idempotent COD checkout, stock deduction, privacy enforcement, and once-only cancellation restore', async () => {
    const customerReg = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Rohan Verma',
        email: 'rohan@example.com',
        password: 'password123',
      },
    });
    const otherReg = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Other Shopper',
        email: 'other@example.com',
        password: 'password123',
      },
    });
    const adminLogin = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@kansotech.com', password: 'AdminPassword123!' },
    });

    const catalog = await apiFetch('/api/products');
    const target = catalog.data.products.find((p) => p.priceCents >= 5000000 && p.stock >= 5);
    const initialStock = target.stock;

    await apiFetch('/api/cart', {
      method: 'POST',
      token: customerReg.data.token,
      body: { productId: target.id, quantity: 2 },
    });

    const couponRes = await apiFetch('/api/cart/coupon', {
      method: 'POST',
      token: customerReg.data.token,
      body: { couponCode: 'KANSO10' },
    });
    assert.equal(couponRes.status, 200);
    assert.ok(couponRes.data.discountCents > 0);

    // Reject unconfigured card checkout cleanly
    const rejectedCard = await apiFetch('/api/orders', {
      method: 'POST',
      token: customerReg.data.token,
      body: {
        customerName: 'Rohan Verma',
        customerEmail: 'rohan@example.com',
        phone: '+91 98480 99999',
        shippingAddress: '14 Indiranagar',
        city: 'Bengaluru',
        postalCode: '560038',
        paymentMethod: 'card',
      },
    });
    assert.equal(rejectedCard.status, 400);

    const idempotencyKey = 'order-idem-test-0001';
    const orderPayload = {
      customerName: 'Rohan Verma',
      customerEmail: 'rohan@example.com',
      phone: '+91 98480 99999',
      shippingAddress: '14 Indiranagar',
      city: 'Bengaluru',
      postalCode: '560038',
      paymentMethod: 'cod',
      couponCode: 'KANSO10',
      idempotencyKey,
    };

    const created1 = await apiFetch('/api/orders', {
      method: 'POST',
      token: customerReg.data.token,
      body: orderPayload,
    });
    assert.equal(created1.status, 201);
    assert.equal(created1.data.order.paymentStatus, 'Pending COD');
    assert.ok(created1.data.order.discountCents > 0);

    // Duplicate retry returns same order without double stock deduction
    const created2 = await apiFetch('/api/orders', {
      method: 'POST',
      token: customerReg.data.token,
      body: orderPayload,
    });
    assert.equal(created2.status, 200);
    assert.equal(created2.data.order.orderNumber, created1.data.order.orderNumber);

    const afterPurchaseProd = await apiFetch(`/api/products/${target.slug}`);
    assert.equal(afterPurchaseProd.data.product.stock, initialStock - 2);

    // Ownership privacy on GET /api/orders/:orderNumber
    const otherLookup = await apiFetch(`/api/orders/${created1.data.order.orderNumber}`, {
      token: otherReg.data.token,
    });
    assert.equal(otherLookup.status, 403);

    const unauthLookup = await apiFetch(`/api/orders/${created1.data.order.orderNumber}`);
    assert.equal(unauthLookup.status, 401);

    // Customer cannot advance shipping status to Shipped
    const illegalAdvance = await apiFetch(`/api/orders/${created1.data.order.orderNumber}/status`, {
      method: 'PATCH',
      token: customerReg.data.token,
      body: { status: 'Shipped' },
    });
    assert.equal(illegalAdvance.status, 403);

    // Customer cancels own Confirmed order -> stock restored once
    const cancel1 = await apiFetch(`/api/orders/${created1.data.order.orderNumber}/status`, {
      method: 'PATCH',
      token: customerReg.data.token,
      body: { status: 'Cancelled' },
    });
    assert.equal(cancel1.status, 200);
    assert.equal(cancel1.data.order.status, 'Cancelled');

    const afterCancelProd = await apiFetch(`/api/products/${target.slug}`);
    assert.equal(afterCancelProd.data.product.stock, initialStock);

    // Second cancel attempt blocked
    const cancel2 = await apiFetch(`/api/orders/${created1.data.order.orderNumber}/status`, {
      method: 'PATCH',
      token: adminLogin.data.token,
      body: { status: 'Cancelled' },
    });
    assert.equal(cancel2.status, 400);

    const finalProd = await apiFetch(`/api/products/${target.slug}`);
    assert.equal(finalProd.data.product.stock, initialStock);
  });

  it('runs Smart Product Finder for authenticated users against live catalog and returns empty reason when over budget', async () => {
    const customerLogin = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'demo@kansogoods.com', password: 'demo1234' },
    });
    assert.equal(customerLogin.status, 200);

    const matchesRes = await apiFetch('/api/finder', {
      method: 'POST',
      token: customerLogin.data.token,
      body: {
        category: 'Laptops',
        budgetRupees: 165000,
        usage: 'programming',
        importantSpecs: ['Performance', 'Battery'],
        preferences: 'OLED 14',
      },
    });
    assert.equal(matchesRes.status, 200);
    assert.ok(Array.isArray(matchesRes.data.matches));
    assert.ok(matchesRes.data.matches.length >= 1 && matchesRes.data.matches.length <= 3);
    for (const m of matchesRes.data.matches) {
      assert.equal(m.product.category, 'Laptops');
      assert.ok(m.product.priceCents <= 16500000);
    }

    const emptyRes = await apiFetch('/api/finder', {
      method: 'POST',
      token: customerLogin.data.token,
      body: {
        category: 'Laptops',
        budgetRupees: 5000,
        usage: 'programming',
      },
    });
    assert.equal(emptyRes.status, 200);
    assert.equal(emptyRes.data.matches.length, 0);
    assert.ok(emptyRes.data.emptyReason);
  });

  it('isolates private order WebSocket events from unauthorized customers', async () => {
    const owner = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: { name: 'WS Owner', email: 'ws-owner@example.com', password: 'password123' },
    });
    const stranger = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: { name: 'WS Stranger', email: 'ws-stranger@example.com', password: 'password123' },
    });

    const ownerEvents = [];
    const strangerEvents = [];

    const wsOwner = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(owner.data.token)}`);
    const wsStranger = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(stranger.data.token)}`);

    await Promise.all([
      new Promise((resolve) => wsOwner.on('open', resolve)),
      new Promise((resolve) => wsStranger.on('open', resolve)),
    ]);

    wsOwner.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'order:created') ownerEvents.push(msg.payload.orderNumber);
    });
    wsStranger.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'order:created') strangerEvents.push(msg.payload.orderNumber);
    });

    const catalog = await apiFetch('/api/products');
    const item = catalog.data.products.find((p) => p.stock > 3);
    await apiFetch('/api/cart', {
      method: 'POST',
      token: owner.data.token,
      body: { productId: item.id, quantity: 1 },
    });

    const created = await apiFetch('/api/orders', {
      method: 'POST',
      token: owner.data.token,
      body: {
        customerName: 'WS Owner',
        customerEmail: 'ws-owner@example.com',
        phone: '+91 98480 22222',
        shippingAddress: '10 Jubilee Hills',
        city: 'Hyderabad',
        postalCode: '500033',
        paymentMethod: 'cod',
      },
    });
    assert.equal(created.status, 201);

    await new Promise((resolve) => setTimeout(resolve, 250));

    wsOwner.close();
    wsStranger.close();

    assert.ok(ownerEvents.includes(created.data.order.orderNumber));
    assert.equal(strangerEvents.includes(created.data.order.orderNumber), false);
  });
});
