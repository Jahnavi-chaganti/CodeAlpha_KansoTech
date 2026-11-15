import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'node:path';
import { hashPassword } from './auth.js';

const DB_PATH = process.env.KANSO_DB_PATH
  ? path.resolve(process.env.KANSO_DB_PATH)
  : path.resolve(process.cwd(), 'store.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const FREE_SHIPPING_THRESHOLD_CENTS = 0;
export const STANDARD_SHIPPING_CENTS = 0;

let runtimeAdminSetupToken = null;

function ensureColumn(tableName, columnName, columnDef) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  }
}

function recordMigration(version, description) {
  db.prepare(
    'INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)'
  ).run(version, description);
}

export function getAdminCount() {
  const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
  return Number(row?.count || 0);
}

export function getRuntimeAdminSetupToken() {
  return runtimeAdminSetupToken;
}

export function clearRuntimeAdminSetupToken() {
  runtimeAdminSetupToken = null;
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_key TEXT NOT NULL,
      tag TEXT,
      short_description TEXT NOT NULL,
      description TEXT NOT NULL,
      dimensions TEXT NOT NULL,
      materials TEXT NOT NULL,
      variants_json TEXT NOT NULL,
      swatches_json TEXT NOT NULL DEFAULT '[]',
      storage_options_json TEXT NOT NULL DEFAULT '[]',
      specs_json TEXT NOT NULL DEFAULT '{}',
      care_name TEXT NOT NULL DEFAULT 'KansoCare+',
      care_price_cents INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT,
      product_id INTEGER NOT NULL,
      variant TEXT NOT NULL,
      storage_label TEXT NOT NULL DEFAULT '',
      care_included INTEGER NOT NULL DEFAULT 0,
      engraving TEXT NOT NULL DEFAULT '',
      unit_price_cents INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      session_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      phone TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      city TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Confirmed',
      subtotal_cents INTEGER NOT NULL,
      shipping_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      product_sku TEXT NOT NULL,
      image_key TEXT NOT NULL,
      variant TEXT NOT NULL,
      engraving TEXT NOT NULL DEFAULT '',
      care_included INTEGER NOT NULL DEFAULT 0,
      unit_price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wishlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT,
      product_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlist_user_product
      ON wishlist_items(user_id, product_id)
      WHERE user_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlist_session_product
      ON wishlist_items(session_id, product_id)
      WHERE session_id IS NOT NULL AND user_id IS NULL;

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  ensureColumn('users', 'role', "TEXT NOT NULL DEFAULT 'customer'");

  ensureColumn('products', 'swatches_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('products', 'storage_options_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('products', 'specs_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('products', 'care_name', "TEXT NOT NULL DEFAULT 'KansoCare+'");
  ensureColumn('products', 'care_price_cents', 'INTEGER NOT NULL DEFAULT 0');

  ensureColumn('cart_items', 'storage_label', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('cart_items', 'care_included', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('cart_items', 'engraving', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('cart_items', 'unit_price_cents', 'INTEGER NOT NULL DEFAULT 0');

  ensureColumn('orders', 'payment_status', "TEXT NOT NULL DEFAULT 'Pending'");
  ensureColumn('orders', 'shipping_status', "TEXT NOT NULL DEFAULT 'Confirmed'");
  ensureColumn('orders', 'discount_cents', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('orders', 'coupon_code', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('orders', 'stock_restored', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('orders', 'idempotency_key', 'TEXT');

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
      ON orders(idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);

  ensureColumn('order_items', 'engraving', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('order_items', 'care_included', 'INTEGER NOT NULL DEFAULT 0');

  recordMigration('001_roles_rbac', 'Add role column to users defaulting to customer');
  recordMigration('002_order_payment_coupon_idempotency', 'Add payment_status, shipping_status, coupon/discount, idempotency_key, stock_restored to orders');
  recordMigration('003_wishlist_items', 'Add persistent wishlist_items table for user and guest sessions');

  seedHardwareCatalog();
  bootstrapAdminFromEnv();
}

function buildCatalogItems() {
  // 12 precision hardware models per category (72 total items), prices in INR paise
  const laptops = [
    {
      slug: 'kanso-book-pro-14',
      sku: 'KN-MBP-14',
      name: 'Kanso Book Pro 14"',
      price_cents: 15990000,
      originalPriceCents: 17490000,
      stock: 14,
      tag: 'New',
      rating: 4.9,
      reviewCount: 428,
      short_description: 'K4 Pro silicon. Liquid XDR display. Up to 22 hours of battery life.',
      description: 'Milled from 100% recycled aerospace aluminum, Kanso Book Pro 14" delivers workstation-grade CPU and neural performance with a 120Hz Liquid XDR display.',
      dimensions: '31.26 cm W x 22.12 cm D x 1.55 cm H',
      materials: '100% recycled aluminum enclosure, sapphire trackpad glass',
      variants: ['Silver', 'Space Black', 'Royal Blue'],
      swatches: [
        { name: 'Silver', hex: '#E3E4E6' },
        { name: 'Space Black', hex: '#1D1D1F' },
        { name: 'Royal Blue', hex: '#2455D6' },
      ],
      storage: [
        { label: '512GB SSD · 16GB Unified', deltaCents: 0 },
        { label: '1TB SSD · 24GB Unified', deltaCents: 2000000 },
        { label: '2TB SSD · 36GB Unified', deltaCents: 6000000 },
      ],
      specs: { display: '14.2" Liquid XDR (120Hz)', chip: 'K4 Pro 12-Core Silicon', battery: 'Up to 22 hours', weight: '1.55 kg', connectivity: '3x Thunderbolt 5, HDMI, SDXC' },
      care_price_cents: 1990000,
    },
    {
      slug: 'kanso-book-pro-16',
      sku: 'KN-MBP-16',
      name: 'Kanso Book Pro 16"',
      price_cents: 24990000,
      originalPriceCents: 26990000,
      stock: 10,
      tag: 'Best Seller',
      rating: 4.9,
      reviewCount: 312,
      short_description: 'K4 Max architecture. 16.2" XDR reference panel. Six-speaker studio array.',
      description: 'Engineered for 8K color grading, large-scale builds, and 3D rendering on an expansive 16.2-inch Liquid XDR display with sustained thermal headroom.',
      dimensions: '35.57 cm W x 24.81 cm D x 1.68 cm H',
      materials: 'Anodized aluminum unibody, anti-reflective glass',
      variants: ['Space Black', 'Silver'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: '1TB SSD · 36GB Unified', deltaCents: 0 },
        { label: '2TB SSD · 48GB Unified', deltaCents: 4000000 },
      ],
      specs: { display: '16.2" Liquid XDR (120Hz)', chip: 'K4 Max 16-Core Silicon', battery: 'Up to 24 hours', weight: '2.14 kg', connectivity: '3x Thunderbolt 5, HDMI 2.1' },
      care_price_cents: 2490000,
    },
    {
      slug: 'kanso-book-air-13',
      sku: 'KN-MBA-13',
      name: 'Kanso Book Air 13"',
      price_cents: 11490000,
      originalPriceCents: 12490000,
      stock: 22,
      tag: '8% Off',
      rating: 4.8,
      reviewCount: 519,
      short_description: '11.3mm ultra-thin fanless design. K4 silicon. 18-hour all-day battery.',
      description: 'Remarkably light yet rigid, Kanso Book Air 13" runs completely silent without fans while powering effortless multitasking and studio video calls.',
      dimensions: '30.41 cm W x 21.5 cm D x 1.13 cm H',
      materials: 'Recycled aluminum shell, force-touch glass trackpad',
      variants: ['Midnight Navy', 'Starlight', 'Silver', 'Royal Blue'],
      swatches: [{ name: 'Midnight Navy', hex: '#101D45' }, { name: 'Starlight', hex: '#E7E0D3' }, { name: 'Silver', hex: '#E3E4E6' }, { name: 'Royal Blue', hex: '#2455D6' }],
      storage: [
        { label: '256GB SSD · 16GB Unified', deltaCents: 0 },
        { label: '512GB SSD · 16GB Unified', deltaCents: 2000000 },
      ],
      specs: { display: '13.6" Liquid IPS', chip: 'K4 10-Core Silicon', battery: 'Up to 18 hours', weight: '1.24 kg', connectivity: '2x Thunderbolt 4, MagCharge' },
      care_price_cents: 1490000,
    },
    {
      slug: 'kanso-book-air-15',
      sku: 'KN-MBA-15',
      name: 'Kanso Book Air 15"',
      price_cents: 13490000,
      originalPriceCents: 14490000,
      stock: 16,
      tag: 'Popular',
      rating: 4.8,
      reviewCount: 284,
      short_description: 'Expansive 15.3" canvas in an impossibly thin 11.5mm profile.',
      description: 'Designed for spreadsheets, side-by-side coding, and travel productivity without the bulk of a traditional large-screen notebook.',
      dimensions: '34.04 cm W x 23.76 cm D x 1.15 cm H',
      materials: 'Brushed aluminum alloy, six-speaker acoustic cavity',
      variants: ['Midnight Navy', 'Silver', 'Sky Blue'],
      swatches: [{ name: 'Midnight Navy', hex: '#101D45' }, { name: 'Silver', hex: '#E3E4E6' }, { name: 'Sky Blue', hex: '#8EACFF' }],
      storage: [
        { label: '512GB SSD · 16GB Unified', deltaCents: 0 },
        { label: '1TB SSD · 24GB Unified', deltaCents: 2000000 },
      ],
      specs: { display: '15.3" Liquid IPS', chip: 'K4 10-Core Silicon', battery: 'Up to 18 hours', weight: '1.51 kg', connectivity: '2x Thunderbolt 4, Wi-Fi 6E' },
      care_price_cents: 1590000,
    },
    {
      slug: 'kanso-book-studio-max',
      sku: 'KN-MBS-16',
      name: 'Kanso Book Studio Max',
      price_cents: 31990000,
      originalPriceCents: 33990000,
      stock: 6,
      tag: 'Limited Run',
      rating: 5.0,
      reviewCount: 94,
      short_description: '40-core GPU workstation laptop with 64GB unified high-bandwidth memory.',
      description: 'Built for AI researchers, Unreal Engine artists, and cinema DIT carts needing desktop-grade GPU bandwidth in a portable aluminum shell.',
      dimensions: '35.57 cm W x 24.81 cm D x 1.68 cm H',
      materials: 'Space-grade dark anodized aluminum, vapor chamber',
      variants: ['Space Black', 'Royal Titanium'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Royal Titanium', hex: '#2455D6' }],
      storage: [
        { label: '2TB SSD · 64GB Unified', deltaCents: 0 },
        { label: '4TB SSD · 128GB Unified', deltaCents: 8000000 },
      ],
      specs: { display: '16.2" Nano-Texture XDR', chip: 'K4 Ultra 40-Core GPU', battery: 'Up to 20 hours', weight: '2.16 kg', connectivity: '3x Thunderbolt 5, 10Gb Ethernet' },
      care_price_cents: 2990000,
    },
    {
      slug: 'kanso-book-ultra-oled',
      sku: 'KN-MBU-14',
      name: 'Kanso Book Ultra 14" OLED',
      price_cents: 18490000,
      originalPriceCents: 19990000,
      stock: 11,
      tag: 'New',
      rating: 4.9,
      reviewCount: 147,
      short_description: 'Tandem OLED 120Hz panel with ultra-deep blacks and 1600-nit HDR peaks.',
      description: 'Combines featherlight portability with dual-layer Tandem OLED contrast precision for designers and HDR cinematographers.',
      dimensions: '31.10 cm W x 22.00 cm D x 1.42 cm H',
      materials: 'CNC magnesium-aluminum alloy, oleophobic glass',
      variants: ['Ice Silver', 'Midnight Navy'],
      swatches: [{ name: 'Ice Silver', hex: '#C9D8FF' }, { name: 'Midnight Navy', hex: '#101D45' }],
      storage: [
        { label: '1TB SSD · 24GB Unified', deltaCents: 0 },
        { label: '2TB SSD · 32GB Unified', deltaCents: 3000000 },
      ],
      specs: { display: '14.0" Tandem OLED (120Hz)', chip: 'K4 Pro 14-Core', battery: 'Up to 21 hours', weight: '1.38 kg', connectivity: '3x Thunderbolt 5, Wi-Fi 7' },
      care_price_cents: 1990000,
    },
    {
      slug: 'kanso-book-se-13',
      sku: 'KN-MBSE-13',
      name: 'Kanso Book SE 13"',
      price_cents: 8990000,
      originalPriceCents: 9990000,
      stock: 28,
      tag: '10% Off',
      rating: 4.7,
      reviewCount: 615,
      short_description: 'Essential K3 silicon performance, crisp Retina screen, and all-day battery.',
      description: 'Everyday speed and iconic unibody durability crafted for students, writers, and hybrid teams across India.',
      dimensions: '30.41 cm W x 21.24 cm D x 1.38 cm H',
      materials: 'Recycled aluminum shell, backlit scissor keyboard',
      variants: ['Silver', 'Space Gray'],
      swatches: [{ name: 'Silver', hex: '#E3E4E6' }, { name: 'Space Gray', hex: '#64748B' }],
      storage: [
        { label: '256GB SSD · 16GB', deltaCents: 0 },
        { label: '512GB SSD · 16GB', deltaCents: 1500000 },
      ],
      specs: { display: '13.3" TrueTone IPS', chip: 'K3 8-Core Silicon', battery: 'Up to 17 hours', weight: '1.29 kg', connectivity: '2x USB-C 40Gb/s, MagCharge' },
      care_price_cents: 1190000,
    },
    {
      slug: 'kanso-book-workstation-16',
      sku: 'KN-MBW-16',
      name: 'Kanso Book Workstation 16"',
      price_cents: 28990000,
      originalPriceCents: null,
      stock: 8,
      tag: 'Pro',
      rating: 4.9,
      reviewCount: 78,
      short_description: 'ECC-grade reliability with dual hardware media engines and anti-glare XDR.',
      description: 'Calibrated out of the box to P3 and Rec.2020 color standards for architectural visualization and broadcast mastering.',
      dimensions: '35.57 cm W x 24.81 cm D x 1.68 cm H',
      materials: 'Anodized slate aluminum, acoustic copper heatpipes',
      variants: ['Space Black', 'Slate Blue'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Slate Blue', hex: '#33415C' }],
      storage: [
        { label: '2TB NVMe · 48GB Unified', deltaCents: 0 },
        { label: '4TB NVMe · 64GB Unified', deltaCents: 5000000 },
      ],
      specs: { display: '16.2" Calibrated XDR', chip: 'K4 Max Pro', battery: 'Up to 22 hours', weight: '2.15 kg', connectivity: '3x Thunderbolt 5, SD UHS-II' },
      care_price_cents: 2490000,
    },
    {
      slug: 'kanso-book-creator-15',
      sku: 'KN-MBC-15',
      name: 'Kanso Book Creator 15"',
      price_cents: 17490000,
      originalPriceCents: 18990000,
      stock: 15,
      tag: 'In Stock',
      rating: 4.8,
      reviewCount: 204,
      short_description: 'Color-accurate 15.6" 3K panel with hardware ProRes & AV1 acceleration.',
      description: 'Balanced power and screen real estate tailored for illustrators, photographers, and independent filmmakers.',
      dimensions: '34.5 cm W x 24.0 cm D x 1.48 cm H',
      materials: 'CNC brushed aluminum, ceramic-coated hinge',
      variants: ['Silver', 'Cobalt Blue'],
      swatches: [{ name: 'Silver', hex: '#E3E4E6' }, { name: 'Cobalt Blue', hex: '#2455D6' }],
      storage: [
        { label: '1TB SSD · 24GB Unified', deltaCents: 0 },
        { label: '2TB SSD · 32GB Unified', deltaCents: 2500000 },
      ],
      specs: { display: '15.6" 3K 120Hz Panel', chip: 'K4 Pro 12-Core', battery: 'Up to 19 hours', weight: '1.68 kg', connectivity: '2x Thunderbolt 5, HDMI, USB-A' },
      care_price_cents: 1790000,
    },
    {
      slug: 'kanso-book-developer-14',
      sku: 'KN-MBD-14',
      name: 'Kanso Book Developer Edition 14"',
      price_cents: 16990000,
      originalPriceCents: null,
      stock: 19,
      tag: 'In Stock',
      rating: 4.9,
      reviewCount: 263,
      short_description: '32GB unified memory standard. Instant Docker, Xcode & local LLM builds.',
      description: 'Pre-configured with extra unified RAM and a crisp matte screen option so engineers can compile cleanly outdoors or in bright studios.',
      dimensions: '31.26 cm W x 22.12 cm D x 1.55 cm H',
      materials: 'Matte anodized aluminum, tactile mechanical scissor keys',
      variants: ['Space Black', 'Midnight Navy'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Midnight Navy', hex: '#101D45' }],
      storage: [
        { label: '1TB SSD · 32GB Unified', deltaCents: 0 },
        { label: '2TB SSD · 48GB Unified', deltaCents: 3500000 },
      ],
      specs: { display: '14.2" Matte Liquid XDR', chip: 'K4 Pro 14-Core', battery: 'Up to 21 hours', weight: '1.56 kg', connectivity: '3x Thunderbolt 5, Wi-Fi 7' },
      care_price_cents: 1990000,
    },
    {
      slug: 'kanso-book-carbon-13',
      sku: 'KN-MBF-13',
      name: 'Kanso Book Carbon 13" Feather',
      price_cents: 14490000,
      originalPriceCents: 15990000,
      stock: 7,
      tag: 'Limited Run',
      rating: 4.8,
      reviewCount: 112,
      short_description: '960-gram aerospace carbon-weave chassis built for frequent flyers.',
      description: 'Sub-kilogram engineering without flex, offering full-day standby and instant 65W USB-C fast charging.',
      dimensions: '29.8 cm W x 20.9 cm D x 1.09 cm H',
      materials: 'Woven carbon fiber lid, magnesium-lithium deck',
      variants: ['Carbon Black', 'Royal Slate'],
      swatches: [{ name: 'Carbon Black', hex: '#1D1D1F' }, { name: 'Royal Slate', hex: '#173B9B' }],
      storage: [
        { label: '512GB SSD · 16GB', deltaCents: 0 },
        { label: '1TB SSD · 24GB', deltaCents: 2000000 },
      ],
      specs: { display: '13.3" 2.8K OLED', chip: 'K4 10-Core', battery: 'Up to 17 hours', weight: '0.96 kg', connectivity: '2x Thunderbolt 4, 5G eSIM' },
      care_price_cents: 1590000,
    },
    {
      slug: 'kanso-book-classroom-13',
      sku: 'KN-MBC-13',
      name: 'Kanso Book Classroom 13"',
      price_cents: 7490000,
      originalPriceCents: 8490000,
      stock: 34,
      tag: '12% Off',
      rating: 4.7,
      reviewCount: 388,
      short_description: 'Reinforced corner bumper alloy, spill-resistant keyboard, quiet K3 power.',
      description: 'Designed for universities, coding bootcamps, and everyday learning with reliable all-day endurance.',
      dimensions: '30.5 cm W x 21.5 cm D x 1.45 cm H',
      materials: 'Reinforced aluminum frame, Gorilla glass trackpad',
      variants: ['Ice Blue', 'Silver'],
      swatches: [{ name: 'Ice Blue', hex: '#C9D8FF' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: '256GB SSD · 16GB', deltaCents: 0 },
        { label: '512GB SSD · 16GB', deltaCents: 1200000 },
      ],
      specs: { display: '13.3" Anti-Glare IPS', chip: 'K3 8-Core', battery: 'Up to 16 hours', weight: '1.31 kg', connectivity: '2x USB-C, 3.5mm Studio Jack' },
      care_price_cents: 990000,
    },
  ].map((item) => ({ ...item, category: 'Laptops', image_key: 'pro-laptop', care_name: 'KansoCare+ for Book' }));

  const phones = [
    {
      slug: 'kanso-phone-16-pro',
      sku: 'KN-PHN-16',
      name: 'Kanso Phone 16 Pro',
      price_cents: 11990000,
      originalPriceCents: 12990000,
      stock: 24,
      tag: 'New',
      rating: 4.9,
      reviewCount: 682,
      short_description: 'Grade 5 titanium design. 48MP Fusion camera system. A18 Pro chip.',
      description: 'Forged in micro-blasted Grade 5 titanium with the thinnest borders ever engineered on Kanso Phone. Capture 4K 120fps Dolby Vision video.',
      dimensions: '14.96 cm H x 7.15 cm W x 0.82 cm D',
      materials: 'Grade 5 brushed titanium, Ceramic Shield front glass',
      variants: ['Natural Titanium', 'Black Titanium', 'Desert Titanium', 'Royal Blue'],
      swatches: [{ name: 'Natural Titanium', hex: '#BEB8AE' }, { name: 'Black Titanium', hex: '#232325' }, { name: 'Desert Titanium', hex: '#D4C0AE' }, { name: 'Royal Blue', hex: '#2455D6' }],
      storage: [
        { label: '256GB', deltaCents: 0 },
        { label: '512GB', deltaCents: 2000000 },
        { label: '1TB', deltaCents: 4000000 },
      ],
      specs: { display: '6.3" OLED ProMotion', chip: 'A18 Pro 6-Core Neural', battery: 'Up to 27 hours video', weight: '199 g', connectivity: 'USB-C 10Gb/s, Wi-Fi 7, 5G' },
      care_price_cents: 1490000,
    },
    {
      slug: 'kanso-phone-16-pro-max',
      sku: 'KN-PHN-16M',
      name: 'Kanso Phone 16 Pro Max',
      price_cents: 14490000,
      originalPriceCents: 15490000,
      stock: 15,
      tag: 'Best Seller',
      rating: 4.9,
      reviewCount: 540,
      short_description: '6.9" edge-to-edge ProMotion OLED, 5x tetraprism telephoto, 33h battery.',
      description: 'The largest, longest-lasting Kanso Phone ever created, pairing pro cinema optics with effortless single-cable ProRes capture.',
      dimensions: '16.3 cm H x 7.76 cm W x 0.82 cm D',
      materials: 'Grade 5 titanium frame, textured matte glass back',
      variants: ['Black Titanium', 'Natural Titanium', 'Deep Navy'],
      swatches: [{ name: 'Black Titanium', hex: '#232325' }, { name: 'Natural Titanium', hex: '#BEB8AE' }, { name: 'Deep Navy', hex: '#101D45' }],
      storage: [
        { label: '256GB', deltaCents: 0 },
        { label: '512GB', deltaCents: 2000000 },
        { label: '1TB', deltaCents: 4000000 },
      ],
      specs: { display: '6.9" OLED ProMotion', chip: 'A18 Pro 6-Core', battery: 'Up to 33 hours video', weight: '227 g', connectivity: 'USB-C 10Gb/s, Wi-Fi 7, 5G' },
      care_price_cents: 1690000,
    },
    {
      slug: 'kanso-phone-16',
      sku: 'KN-PHN-16S',
      name: 'Kanso Phone 16',
      price_cents: 7990000,
      originalPriceCents: 8490000,
      stock: 30,
      tag: 'Popular',
      rating: 4.8,
      reviewCount: 810,
      short_description: 'A18 silicon, Camera Control button, and aerospace color-infused glass.',
      description: 'Vibrant Super Retina XDR clarity, spatial macro photography, and Action button versatility in five refined finishes.',
      dimensions: '14.76 cm H x 7.16 cm W x 0.78 cm D',
      materials: 'Aerospace aluminum, color-infused matte glass',
      variants: ['Ultramarine Blue', 'White', 'Black', 'Teal'],
      swatches: [{ name: 'Ultramarine Blue', hex: '#4169E1' }, { name: 'White', hex: '#F8FAFF' }, { name: 'Black', hex: '#1D1D1F' }, { name: 'Teal', hex: '#16A36A' }],
      storage: [
        { label: '128GB', deltaCents: 0 },
        { label: '256GB', deltaCents: 1000000 },
      ],
      specs: { display: '6.1" Super Retina OLED', chip: 'A18 5-Core GPU', battery: 'Up to 22 hours video', weight: '170 g', connectivity: 'USB-C, Wi-Fi 7, Dual 5G' },
      care_price_cents: 1190000,
    },
    {
      slug: 'kanso-phone-16-plus',
      sku: 'KN-PHN-16P',
      name: 'Kanso Phone 16 Plus',
      price_cents: 8990000,
      originalPriceCents: null,
      stock: 19,
      tag: 'In Stock',
      rating: 4.8,
      reviewCount: 318,
      short_description: '6.7" immersive OLED screen with multi-day endurance and dual 48MP optics.',
      description: 'Built for streaming, mobile navigation, and photography without reaching for a power bank before bedtime.',
      dimensions: '16.09 cm H x 7.78 cm W x 0.78 cm D',
      materials: 'Aerospace aluminum, Ceramic Shield',
      variants: ['Ultramarine Blue', 'White', 'Black'],
      swatches: [{ name: 'Ultramarine Blue', hex: '#4169E1' }, { name: 'White', hex: '#F8FAFF' }, { name: 'Black', hex: '#1D1D1F' }],
      storage: [
        { label: '128GB', deltaCents: 0 },
        { label: '256GB', deltaCents: 1000000 },
      ],
      specs: { display: '6.7" Super Retina OLED', chip: 'A18 5-Core GPU', battery: 'Up to 27 hours video', weight: '199 g', connectivity: 'USB-C, Wi-Fi 7, 5G' },
      care_price_cents: 1290000,
    },
    {
      slug: 'kanso-phone-15-pro',
      sku: 'KN-PHN-15P',
      name: 'Kanso Phone 15 Pro',
      price_cents: 10490000,
      originalPriceCents: 11990000,
      stock: 14,
      tag: '12% Off',
      rating: 4.8,
      reviewCount: 920,
      short_description: 'Brushed titanium flagship value with A17 Pro console gaming performance.',
      description: 'Still a powerhouse for ProRAW photography, hardware ray tracing, and USB 3 high-speed SSD offloading.',
      dimensions: '14.66 cm H x 7.06 cm W x 0.82 cm D',
      materials: 'Grade 5 titanium, Ceramic Shield',
      variants: ['Blue Titanium', 'Natural Titanium', 'Black Titanium'],
      swatches: [{ name: 'Blue Titanium', hex: '#173B9B' }, { name: 'Natural Titanium', hex: '#BEB8AE' }, { name: 'Black Titanium', hex: '#1D1D1F' }],
      storage: [
        { label: '128GB', deltaCents: 0 },
        { label: '256GB', deltaCents: 1000000 },
      ],
      specs: { display: '6.1" OLED 120Hz', chip: 'A17 Pro', battery: 'Up to 23 hours video', weight: '187 g', connectivity: 'USB-C 10Gb/s, 5G' },
      care_price_cents: 1390000,
    },
    {
      slug: 'kanso-phone-air',
      sku: 'KN-PHN-AIR',
      name: 'Kanso Phone Air 5.6mm',
      price_cents: 9990000,
      originalPriceCents: null,
      stock: 12,
      tag: 'New',
      rating: 4.9,
      reviewCount: 164,
      short_description: 'Sculpted 5.6mm ultra-slim titanium profile at just 148 grams.',
      description: 'Engineered from high-density stacked silicon batteries and an ultra-thin titanium chassis that disappears in any pocket.',
      dimensions: '15.2 cm H x 7.2 cm W x 0.56 cm D',
      materials: 'Forged titanium frame, micro-etched sapphire lens',
      variants: ['Ice Blue', 'Silver', 'Midnight'],
      swatches: [{ name: 'Ice Blue', hex: '#C9D8FF' }, { name: 'Silver', hex: '#E3E4E6' }, { name: 'Midnight', hex: '#101D45' }],
      storage: [
        { label: '256GB', deltaCents: 0 },
        { label: '512GB', deltaCents: 1800000 },
      ],
      specs: { display: '6.4" Slim OLED 120Hz', chip: 'A18 Efficient', battery: 'Up to 21 hours video', weight: '148 g', connectivity: 'USB-C, Wi-Fi 7, eSIM 5G' },
      care_price_cents: 1390000,
    },
    {
      slug: 'kanso-phone-fold',
      sku: 'KN-PHN-FLD',
      name: 'Kanso Phone Fold Studio',
      price_cents: 16490000,
      originalPriceCents: 17990000,
      stock: 6,
      tag: 'Limited Run',
      rating: 4.9,
      reviewCount: 89,
      short_description: 'Seamless 7.8" unfolded LTPO OLED workspace with zero-gap titanium hinge.',
      description: 'Pocket-sized outside, studio tablet inside. Run split-screen workflows and sketch notes natively on a crease-free glass canvas.',
      dimensions: '15.4 cm H x 13.6 cm W (open) x 0.48 cm',
      materials: 'Liquidmetal hinge, aerospace titanium, UTG glass',
      variants: ['Obsidian', 'Royal Cobalt'],
      swatches: [{ name: 'Obsidian', hex: '#1D1D1F' }, { name: 'Royal Cobalt', hex: '#2455D6' }],
      storage: [
        { label: '512GB', deltaCents: 0 },
        { label: '1TB', deltaCents: 2500000 },
      ],
      specs: { display: '7.8" Inner + 6.2" Cover OLED', chip: 'A18 Pro Fold', battery: 'Up to 26 hours', weight: '234 g', connectivity: 'USB-C 10Gb/s, Wi-Fi 7, 5G' },
      care_price_cents: 2190000,
    },
    {
      slug: 'kanso-phone-se-5g',
      sku: 'KN-PHN-SE',
      name: 'Kanso Phone SE 5G',
      price_cents: 4990000,
      originalPriceCents: 5490000,
      stock: 38,
      tag: '10% Off',
      rating: 4.7,
      reviewCount: 742,
      short_description: 'Edge-to-edge 6.1" OLED, flagship A18 speed, and 48MP computational camera.',
      description: 'Our most accessible modern phone bringing flagship silicon, Face ID security, and multi-year software support.',
      dimensions: '14.67 cm H x 7.15 cm W x 0.78 cm D',
      materials: 'Recycled aluminum frame, toughened glass',
      variants: ['White', 'Midnight', 'Royal Blue'],
      swatches: [{ name: 'White', hex: '#FFFFFF' }, { name: 'Midnight', hex: '#101D45' }, { name: 'Royal Blue', hex: '#2455D6' }],
      storage: [
        { label: '128GB', deltaCents: 0 },
        { label: '256GB', deltaCents: 800000 },
      ],
      specs: { display: '6.1" Super Retina OLED', chip: 'A18 4-Core GPU', battery: 'Up to 20 hours', weight: '167 g', connectivity: 'USB-C, 5G, Wi-Fi 6E' },
      care_price_cents: 790000,
    },
    {
      slug: 'kanso-phone-mini',
      sku: 'KN-PHN-MNI',
      name: 'Kanso Phone Mini 5.8"',
      price_cents: 6490000,
      originalPriceCents: null,
      stock: 16,
      tag: 'Compact',
      rating: 4.8,
      reviewCount: 256,
      short_description: 'True one-handed ergonomics with flagship 120Hz OLED and dual cameras.',
      description: 'Crafted for those who love compact phones without sacrificing OLED brightness or telephoto clarity.',
      dimensions: '13.45 cm H x 6.42 cm W x 0.77 cm D',
      materials: 'Anodized aluminum, ceramic glass',
      variants: ['Silver', 'Royal Blue', 'Graphite'],
      swatches: [{ name: 'Silver', hex: '#E3E4E6' }, { name: 'Royal Blue', hex: '#2455D6' }, { name: 'Graphite', hex: '#33415C' }],
      storage: [
        { label: '128GB', deltaCents: 0 },
        { label: '256GB', deltaCents: 900000 },
      ],
      specs: { display: '5.8" ProMotion OLED', chip: 'A18 Silicon', battery: 'Up to 18 hours', weight: '142 g', connectivity: 'USB-C, 5G, MagCharge' },
      care_price_cents: 890000,
    },
    {
      slug: 'kanso-phone-cinema',
      sku: 'KN-PHN-CIN',
      name: 'Kanso Phone Cinema Edition',
      price_cents: 13490000,
      originalPriceCents: 14490000,
      stock: 9,
      tag: 'Pro',
      rating: 4.9,
      reviewCount: 118,
      short_description: '1-inch main sensor, physical aperture blades, and built-in ND filter control.',
      description: 'Co-developed with independent DOPs for authentic optical depth of field, Log color profiles, and dual XLR adapter support.',
      dimensions: '15.8 cm H x 7.5 cm W x 0.89 cm D',
      materials: 'Matte titanium, sapphire camera housing',
      variants: ['Cinema Black', 'Titanium'],
      swatches: [{ name: 'Cinema Black', hex: '#1D1D1F' }, { name: 'Titanium', hex: '#BEB8AE' }],
      storage: [
        { label: '512GB', deltaCents: 0 },
        { label: '1TB', deltaCents: 2000000 },
      ],
      specs: { display: '6.7" 10-Bit Reference OLED', chip: 'A18 Pro Cinema', battery: 'Up to 29 hours', weight: '221 g', connectivity: 'USB-C 20Gb/s, Timecode Sync' },
      care_price_cents: 1690000,
    },
    {
      slug: 'kanso-phone-titanium-ultra',
      sku: 'KN-PHN-ULT',
      name: 'Kanso Phone Titanium Ultra',
      price_cents: 15490000,
      originalPriceCents: null,
      stock: 5,
      tag: 'Limited Run',
      rating: 5.0,
      reviewCount: 73,
      short_description: 'IP69K ruggedized titanium armor, satellite SOS, and 6000mAh silicon-anode cell.',
      description: 'Built for Himalayan expeditions and harsh field environments without losing flagship slimness.',
      dimensions: '16.4 cm H x 7.8 cm W x 0.88 cm D',
      materials: 'Grade 5 Ti-6Al-4V titanium, sapphire display',
      variants: ['Raw Titanium', 'Stealth Black'],
      swatches: [{ name: 'Raw Titanium', hex: '#BEB8AE' }, { name: 'Stealth Black', hex: '#1D1D1F' }],
      storage: [
        { label: '512GB', deltaCents: 0 },
        { label: '1TB', deltaCents: 2500000 },
      ],
      specs: { display: '6.8" 3200-nit OLED', chip: 'A18 Pro', battery: 'Up to 42 hours video', weight: '239 g', connectivity: 'Dual 5G, Satellite SOS' },
      care_price_cents: 1890000,
    },
    {
      slug: 'kanso-phone-core',
      sku: 'KN-PHN-CRE',
      name: 'Kanso Phone Core 128',
      price_cents: 5490000,
      originalPriceCents: 5990000,
      stock: 29,
      tag: '8% Off',
      rating: 4.7,
      reviewCount: 410,
      short_description: 'Clean pure software, crisp 90Hz OLED, and rapid 45W charging.',
      description: 'Zero bloatware, 6 years of security updates, and balanced daily speed at an honest price.',
      dimensions: '15.1 cm H x 7.2 cm W x 0.79 cm D',
      materials: 'Frosted glass back, aluminum rails',
      variants: ['Glacier White', 'Royal Blue'],
      swatches: [{ name: 'Glacier White', hex: '#F8FAFF' }, { name: 'Royal Blue', hex: '#2455D6' }],
      storage: [
        { label: '128GB', deltaCents: 0 },
        { label: '256GB', deltaCents: 700000 },
      ],
      specs: { display: '6.2" 90Hz OLED', chip: 'K16 Core', battery: 'Up to 24 hours', weight: '174 g', connectivity: 'USB-C, Dual 5G, NFC' },
      care_price_cents: 690000,
    },
  ].map((item) => ({ ...item, category: 'Phones', image_key: 'titanium-phone', care_name: 'KansoCare+ for Phone' }));

  const tablets = [
    {
      slug: 'kanso-pad-pro-13',
      sku: 'KN-PAD-13',
      name: 'Kanso Pad Pro 13"',
      price_cents: 12990000,
      originalPriceCents: 13990000,
      stock: 18,
      tag: 'In Stock',
      rating: 4.9,
      reviewCount: 382,
      short_description: 'Impossibly thin 5.1mm profile. Tandem OLED. Compatible with Studio Pencil.',
      description: 'Our thinnest computing instrument pairs a dual-layer Tandem OLED canvas with desktop-class K4 silicon for illustration and CAD review.',
      dimensions: '28.16 cm H x 21.55 cm W x 0.51 cm D',
      materials: '5.1mm anodized aluminum, nano-etched glass option',
      variants: ['Space Gray', 'Silver', 'Royal Blue'],
      swatches: [{ name: 'Space Gray', hex: '#5D5E63' }, { name: 'Silver', hex: '#E3E4E6' }, { name: 'Royal Blue', hex: '#2455D6' }],
      storage: [
        { label: '256GB · Wi-Fi', deltaCents: 0 },
        { label: '512GB · Wi-Fi', deltaCents: 2000000 },
        { label: '1TB · Wi-Fi + 5G', deltaCents: 5000000 },
      ],
      specs: { display: '13.0" Ultra Retina Tandem OLED', chip: 'K4 10-Core Silicon', battery: 'Up to 10 hours', weight: '579 g', connectivity: 'Thunderbolt / USB 4, Wi-Fi 6E' },
      care_price_cents: 1290000,
    },
    {
      slug: 'kanso-pad-pro-11',
      sku: 'KN-PAD-11',
      name: 'Kanso Pad Pro 11"',
      price_cents: 9990000,
      originalPriceCents: 10990000,
      stock: 21,
      tag: 'Best Seller',
      rating: 4.9,
      reviewCount: 445,
      short_description: 'Portable 11" Tandem OLED powerhouse at just 444 grams.',
      description: 'Everything designers love about Kanso Pad Pro in an ultra-agile 11-inch form factor for field sketching and travel.',
      dimensions: '24.97 cm H x 17.75 cm W x 0.53 cm D',
      materials: 'Recycled aluminum unibody',
      variants: ['Space Black', 'Silver'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: '256GB · Wi-Fi', deltaCents: 0 },
        { label: '512GB · Wi-Fi + 5G', deltaCents: 2500000 },
      ],
      specs: { display: '11.0" Tandem OLED (120Hz)', chip: 'K4 10-Core', battery: 'Up to 10 hours', weight: '444 g', connectivity: 'Thunderbolt / USB 4, Wi-Fi 6E' },
      care_price_cents: 1190000,
    },
    {
      slug: 'kanso-pad-air-11',
      sku: 'KN-PDA-11',
      name: 'Kanso Pad Air 11"',
      price_cents: 5990000,
      originalPriceCents: 6490000,
      stock: 26,
      tag: 'Popular',
      rating: 4.8,
      reviewCount: 512,
      short_description: 'K3 speed, landscape Center Stage camera, and full Studio Pencil hover.',
      description: 'Ideal for students, digital note-takers, and creative workflows without stepping up to Pro pricing.',
      dimensions: '24.76 cm H x 17.85 cm W x 0.61 cm D',
      materials: 'Anodized aluminum alloy',
      variants: ['Ice Blue', 'Starlight', 'Space Gray'],
      swatches: [{ name: 'Ice Blue', hex: '#8EACFF' }, { name: 'Starlight', hex: '#E7E0D3' }, { name: 'Space Gray', hex: '#64748B' }],
      storage: [
        { label: '128GB · Wi-Fi', deltaCents: 0 },
        { label: '256GB · Wi-Fi', deltaCents: 1000000 },
      ],
      specs: { display: '11.0" Liquid Retina', chip: 'K3 8-Core', battery: 'Up to 10 hours', weight: '462 g', connectivity: 'USB-C, Wi-Fi 6E' },
      care_price_cents: 890000,
    },
    {
      slug: 'kanso-pad-air-13',
      sku: 'KN-PDA-13',
      name: 'Kanso Pad Air 13"',
      price_cents: 7990000,
      originalPriceCents: null,
      stock: 15,
      tag: 'In Stock',
      rating: 4.8,
      reviewCount: 230,
      short_description: 'Massive 13-inch Liquid Retina workspace at an Air price point.',
      description: '30% more screen area than the 11-inch model for sheet music, architectural blueprints, and Split View.',
      dimensions: '28.06 cm H x 21.49 cm W x 0.61 cm D',
      materials: 'Recycled aluminum shell',
      variants: ['Blue', 'Starlight', 'Space Gray'],
      swatches: [{ name: 'Blue', hex: '#4169E1' }, { name: 'Starlight', hex: '#E7E0D3' }, { name: 'Space Gray', hex: '#64748B' }],
      storage: [
        { label: '128GB · Wi-Fi', deltaCents: 0 },
        { label: '256GB · Wi-Fi', deltaCents: 1000000 },
      ],
      specs: { display: '13.0" Liquid Retina', chip: 'K3 8-Core', battery: 'Up to 10 hours', weight: '617 g', connectivity: 'USB-C, Wi-Fi 6E' },
      care_price_cents: 990000,
    },
    {
      slug: 'kanso-pad-mini-8',
      sku: 'KN-PDM-08',
      name: 'Kanso Pad Mini 8.3"',
      price_cents: 4990000,
      originalPriceCents: 5490000,
      stock: 20,
      tag: 'Compact',
      rating: 4.9,
      reviewCount: 389,
      short_description: 'Fits in a lab coat pocket with A17 Pro intelligence and Pencil support.',
      description: 'Loved by pilots, physicians, and avid readers who want serious tablet speed in one hand.',
      dimensions: '19.54 cm H x 13.48 cm W x 0.63 cm D',
      materials: 'Anodized aluminum',
      variants: ['Royal Blue', 'Starlight', 'Space Gray'],
      swatches: [{ name: 'Royal Blue', hex: '#4169E1' }, { name: 'Starlight', hex: '#E7E0D3' }, { name: 'Space Gray', hex: '#64748B' }],
      storage: [
        { label: '128GB · Wi-Fi', deltaCents: 0 },
        { label: '256GB · Wi-Fi + 5G', deltaCents: 1500000 },
      ],
      specs: { display: '8.3" Liquid Retina', chip: 'A17 Pro', battery: 'Up to 10 hours', weight: '293 g', connectivity: 'USB-C 10Gb/s, Wi-Fi 6E' },
      care_price_cents: 790000,
    },
    {
      slug: 'kanso-pad-studio-14',
      sku: 'KN-PDS-14',
      name: 'Kanso Pad Studio Canvas 14"',
      price_cents: 14990000,
      originalPriceCents: null,
      stock: 8,
      tag: 'Limited Run',
      rating: 4.9,
      reviewCount: 64,
      short_description: 'Drawing tablet meets desktop OS with dual USB-C ports and tactile paper glass.',
      description: 'Built exclusively for concept artists and animators needing zero-parallax pen accuracy.',
      dimensions: '31.0 cm H x 22.8 cm W x 0.58 cm D',
      materials: 'CNC matte aluminum, micro-etched paper-feel glass',
      variants: ['Studio Silver', 'Graphite'],
      swatches: [{ name: 'Studio Silver', hex: '#DFE1E4' }, { name: 'Graphite', hex: '#33415C' }],
      storage: [
        { label: '512GB · 24GB RAM', deltaCents: 0 },
        { label: '1TB · 32GB RAM', deltaCents: 2500000 },
      ],
      specs: { display: '14.2" Matte Tandem OLED', chip: 'K4 Pro', battery: 'Up to 11 hours', weight: '690 g', connectivity: 'Dual Thunderbolt 4' },
      care_price_cents: 1490000,
    },
    {
      slug: 'kanso-pad-sketch',
      sku: 'KN-PDK-11',
      name: 'Kanso Pad Sketch Edition',
      price_cents: 6990000,
      originalPriceCents: 7790000,
      stock: 17,
      tag: '10% Off',
      rating: 4.8,
      reviewCount: 194,
      short_description: 'Includes Kanso Studio Pencil & matte magnetic folio inside the box.',
      description: 'Unbox and sketch immediately with pressure-sensitive tilt control and zero-latency ink.',
      dimensions: '24.8 cm H x 17.8 cm W x 0.59 cm D',
      materials: 'Anodized aluminum, included paper-texture protector',
      variants: ['White', 'Royal Blue'],
      swatches: [{ name: 'White', hex: '#FFFFFF' }, { name: 'Royal Blue', hex: '#2455D6' }],
      storage: [
        { label: '256GB · Bundle', deltaCents: 0 },
        { label: '512GB · Bundle', deltaCents: 1500000 },
      ],
      specs: { display: '11.2" 120Hz IPS', chip: 'K3 8-Core', battery: 'Up to 10 hours', weight: '468 g', connectivity: 'USB-C, Magnetic Dock' },
      care_price_cents: 890000,
    },
    {
      slug: 'kanso-pad-10gen',
      sku: 'KN-PD10-10',
      name: 'Kanso Pad 10th Gen',
      price_cents: 3490000,
      originalPriceCents: 3990000,
      stock: 40,
      tag: '12% Off',
      rating: 4.7,
      reviewCount: 890,
      short_description: '10.9" vibrant all-screen canvas for reading, video calls, and study.',
      description: 'Our most popular family and classroom tablet with landscape stereo speakers and quick USB-C charging.',
      dimensions: '24.86 cm H x 17.95 cm W x 0.70 cm D',
      materials: 'Recycled aluminum shell',
      variants: ['Royal Blue', 'Silver', 'Yellow'],
      swatches: [{ name: 'Royal Blue', hex: '#2455D6' }, { name: 'Silver', hex: '#E3E4E6' }, { name: 'Yellow', hex: '#E9A23B' }],
      storage: [
        { label: '64GB · Wi-Fi', deltaCents: 0 },
        { label: '256GB · Wi-Fi', deltaCents: 1200000 },
      ],
      specs: { display: '10.9" Liquid Retina', chip: 'A15 Bionic', battery: 'Up to 10 hours', weight: '477 g', connectivity: 'USB-C, Wi-Fi 6' },
      care_price_cents: 590000,
    },
    {
      slug: 'kanso-pad-cellular-pro',
      sku: 'KN-PDC-11',
      name: 'Kanso Pad Cellular Pro 11"',
      price_cents: 11490000,
      originalPriceCents: null,
      stock: 12,
      tag: '5G Ready',
      rating: 4.8,
      reviewCount: 156,
      short_description: 'Unlocked global mmWave + Sub-6 5G with dual eSIM and ProMotion OLED.',
      description: 'Stay connected on construction sites, shoots, and trains without hunting for public Wi-Fi.',
      dimensions: '24.97 cm H x 17.75 cm W x 0.53 cm D',
      materials: 'Space gray aluminum, GPS + 5G antenna band',
      variants: ['Space Black', 'Silver'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: '256GB · 5G', deltaCents: 0 },
        { label: '512GB · 5G', deltaCents: 2000000 },
      ],
      specs: { display: '11.0" Tandem OLED', chip: 'K4 10-Core', battery: 'Up to 10 hours 5G', weight: '446 g', connectivity: '5G eSIM, Thunderbolt 4' },
      care_price_cents: 1290000,
    },
    {
      slug: 'kanso-pad-nano-13',
      sku: 'KN-PDN-13',
      name: 'Kanso Pad Nano-Texture 13"',
      price_cents: 13990000,
      originalPriceCents: null,
      stock: 9,
      tag: 'Pro',
      rating: 5.0,
      reviewCount: 82,
      short_description: 'Precision nanometer-etched glass scatters ambient glare cleanly.',
      description: 'Maintains rich Tandem OLED blacks even under harsh overhead studio lights or direct Indian sunlight.',
      dimensions: '28.16 cm H x 21.55 cm W x 0.51 cm D',
      materials: 'Nano-textured optical glass, anodized aluminum',
      variants: ['Space Black', 'Silver'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: '1TB · Nano-Texture', deltaCents: 0 },
        { label: '2TB · Nano-Texture', deltaCents: 3500000 },
      ],
      specs: { display: '13.0" Nano Tandem OLED', chip: 'K4 10-Core', battery: 'Up to 10 hours', weight: '579 g', connectivity: 'Thunderbolt 4, Wi-Fi 6E' },
      care_price_cents: 1490000,
    },
    {
      slug: 'kanso-pad-lite',
      sku: 'KN-PDL-10',
      name: 'Kanso Pad Lite 10.5"',
      price_cents: 2990000,
      originalPriceCents: 3390000,
      stock: 35,
      tag: '12% Off',
      rating: 4.6,
      reviewCount: 412,
      short_description: 'Featherweight e-reading and streaming slate with quad speakers.',
      description: 'Simple, sturdy, and colorful for students, travel entertainment, and smart home dashboards.',
      dimensions: '24.6 cm H x 16.5 cm W x 0.72 cm D',
      materials: 'Brushed metal chassis',
      variants: ['Sky Blue', 'Silver'],
      swatches: [{ name: 'Sky Blue', hex: '#8EACFF' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: '128GB', deltaCents: 0 },
        { label: '256GB', deltaCents: 600000 },
      ],
      specs: { display: '10.5" FHD+ IPS', chip: 'K2 Efficient', battery: 'Up to 12 hours', weight: '450 g', connectivity: 'USB-C, Wi-Fi 6' },
      care_price_cents: 490000,
    },
    {
      slug: 'kanso-pad-architect-bundle',
      sku: 'KN-PDA-BND',
      name: 'Kanso Pad Architect Folio Bundle',
      price_cents: 11990000,
      originalPriceCents: 13290000,
      stock: 11,
      tag: 'Bundle',
      rating: 4.9,
      reviewCount: 109,
      short_description: 'Pad Pro 11" paired with Floating Magic Keyboard and Studio Pencil.',
      description: 'Complete mobile workstation ready for CAD markups, keynote decks, and coffee-shop coding.',
      dimensions: '25.1 cm H x 18.0 cm W x 1.3 cm (closed)',
      materials: 'Machined aluminum hinge keyboard + OLED tablet',
      variants: ['Royal Navy Folio', 'White Folio'],
      swatches: [{ name: 'Royal Navy Folio', hex: '#101D45' }, { name: 'White Folio', hex: '#F8FAFF' }],
      storage: [
        { label: '256GB Complete Kit', deltaCents: 0 },
        { label: '512GB Complete Kit', deltaCents: 2000000 },
      ],
      specs: { display: '11.0" Tandem OLED', chip: 'K4 10-Core', battery: 'Up to 10 hours', weight: '890 g (with keyboard)', connectivity: 'Pass-through USB-C Charging' },
      care_price_cents: 1290000,
    },
  ].map((item) => ({ ...item, category: 'Tablets', image_key: 'studio-tablet', care_name: 'KansoCare+ for Pad' }));

  const audio = [
    {
      slug: 'kanso-studio-max',
      sku: 'KN-AUD-01',
      name: 'Kanso Studio Max',
      price_cents: 5990000,
      originalPriceCents: 6490000,
      stock: 16,
      tag: 'Best Seller',
      rating: 4.9,
      reviewCount: 645,
      short_description: 'Lossless USB-C audio. Pro-level Active Noise Cancellation. Spatial sound.',
      description: 'Custom 40mm dynamic transducers mounted inside anodized aluminum earcups deliver reference-grade clarity and breathable knit mesh comfort.',
      dimensions: '18.7 cm H x 16.8 cm W x 8.3 cm D',
      materials: 'Anodized aluminum cups, stainless steel frame, knit mesh',
      variants: ['Silver', 'Midnight', 'Royal Blue', 'Starlight'],
      swatches: [{ name: 'Silver', hex: '#D8DADC' }, { name: 'Midnight', hex: '#23262E' }, { name: 'Royal Blue', hex: '#2455D6' }, { name: 'Starlight', hex: '#E7E0D3' }],
      storage: [
        { label: 'Standard USB-C Edition', deltaCents: 0 },
        { label: 'With Hardshell Travel Case', deltaCents: 550000 },
      ],
      specs: { display: 'Acoustic Knit Canopy', chip: 'Dual H2 Spatial Audio', battery: 'Up to 20 hours ANC', weight: '384 g', connectivity: 'Bluetooth 5.3 & USB-C Lossless' },
      care_price_cents: 590000,
    },
    {
      slug: 'kanso-buds-pro-3',
      sku: 'KN-AUD-02',
      name: 'Kanso Buds Pro 3',
      price_cents: 2490000,
      originalPriceCents: 2790000,
      stock: 42,
      tag: 'New',
      rating: 4.9,
      reviewCount: 1120,
      short_description: '2x Active Noise Cancellation, Adaptive Transparency, and USB-C MagCase.',
      description: 'Pocket-sized acoustic engineering with clinical hearing protection, conversation awareness, and effortless multi-device switching.',
      dimensions: '4.5 cm H x 6.0 cm W x 2.1 cm D',
      materials: 'Recycled rare-earth drivers, IP54 sweat-resistant shell',
      variants: ['Ceramic White', 'Midnight Navy'],
      swatches: [{ name: 'Ceramic White', hex: '#FFFFFF' }, { name: 'Midnight Navy', hex: '#101D45' }],
      storage: [
        { label: 'USB-C MagCase', deltaCents: 0 },
        { label: 'With Braided Lanyard + Foam Tips', deltaCents: 250000 },
      ],
      specs: { display: 'Precision LED Status Case', chip: 'H2 Acoustic Silicon', battery: '6h Buds / 30h Total', weight: '50.8 g', connectivity: 'Bluetooth 5.3, UWB Find' },
      care_price_cents: 350000,
    },
    {
      slug: 'kanso-buds-air',
      sku: 'KN-AUD-03',
      name: 'Kanso Buds Air',
      price_cents: 1490000,
      originalPriceCents: 1690000,
      stock: 36,
      tag: '12% Off',
      rating: 4.7,
      reviewCount: 734,
      short_description: 'Open-fit ergonomic comfort with Personalized Spatial Audio and 30h battery.',
      description: 'Weightless open-ear contour designed for hours of clear voice calls and studio music without ear-tip pressure.',
      dimensions: '4.6 cm H x 5.0 cm W x 2.1 cm D',
      materials: 'Polished polycarbonate, stainless acoustic mesh',
      variants: ['White', 'Ice Blue'],
      swatches: [{ name: 'White', hex: '#FFFFFF' }, { name: 'Ice Blue', hex: '#C9D8FF' }],
      storage: [
        { label: 'Standard USB-C Case', deltaCents: 0 },
        { label: 'ANC Wireless Case Edition', deltaCents: 400000 },
      ],
      specs: { display: 'Compact Pocket Case', chip: 'H2 Audio', battery: 'Up to 30 hours total', weight: '36.6 g', connectivity: 'Bluetooth 5.3' },
      care_price_cents: 250000,
    },
    {
      slug: 'kanso-studio-reference',
      sku: 'KN-AUD-04',
      name: 'Kanso Studio Over-Ear Reference',
      price_cents: 6990000,
      originalPriceCents: null,
      stock: 9,
      tag: 'Pro',
      rating: 5.0,
      reviewCount: 128,
      short_description: 'Planar-magnetic open-back mastering headphones for mixing & mastering.',
      description: 'Zero coloration and ultra-fast transient response engineered with acoustic labs for mixing engineers.',
      dimensions: '20.5 cm H x 18.0 cm W x 9.5 cm D',
      materials: 'Machined magnesium yokes, lambskin acoustic pads',
      variants: ['Anodized Slate', 'Silver'],
      swatches: [{ name: 'Anodized Slate', hex: '#33415C' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: '4.4mm Balanced + 6.3mm Cable', deltaCents: 0 },
        { label: 'With Flight Case', deltaCents: 650000 },
      ],
      specs: { display: '100mm Planar Transducer', chip: 'Passive Reference (32 Ohm)', battery: 'Wired Studio Passive', weight: '410 g', connectivity: 'Dual Mini-XLR Detachable' },
      care_price_cents: 690000,
    },
    {
      slug: 'kanso-soundbar-spatial',
      sku: 'KN-AUD-05',
      name: 'Kanso Soundbar Spatial 5.1',
      price_cents: 7490000,
      originalPriceCents: 8290000,
      stock: 11,
      tag: '10% Off',
      rating: 4.8,
      reviewCount: 205,
      short_description: '11-driver Dolby Atmos cinema soundbar with automatic room calibration.',
      description: 'Fills living rooms with height-channel acoustics and crisp dialogue clarity through eARC or lossless AirPlay.',
      dimensions: '108 cm W x 11.4 cm D x 7.5 cm H',
      materials: 'Acoustic weave fabric, brushed aluminum top plate',
      variants: ['Midnight', 'Chalk White'],
      swatches: [{ name: 'Midnight', hex: '#101D45' }, { name: 'Chalk White', hex: '#F8FAFF' }],
      storage: [
        { label: 'Soundbar Only', deltaCents: 0 },
        { label: 'With Wireless Sub', deltaCents: 3500000 },
      ],
      specs: { display: '11-Driver Array', chip: '4x Quad-Core DSP', battery: 'AC Powered', weight: '6.2 kg', connectivity: 'HDMI eARC, Optical, Wi-Fi 6' },
      care_price_cents: 790000,
    },
    {
      slug: 'kanso-home-mini',
      sku: 'KN-AUD-06',
      name: 'Kanso Home Speaker Mini',
      price_cents: 990000,
      originalPriceCents: null,
      stock: 48,
      tag: 'Popular',
      rating: 4.8,
      reviewCount: 950,
      short_description: '360-degree computational room audio with built-in Thread smart hub.',
      description: 'Compact sphere of room-filling bass and crystal-clear vocals that pairs seamlessly in stereo.',
      dimensions: '8.43 cm H x 9.79 cm W',
      materials: 'Seamless acoustic mesh, backlit touch top',
      variants: ['Royal Blue', 'White', 'Midnight'],
      swatches: [{ name: 'Royal Blue', hex: '#2455D6' }, { name: 'White', hex: '#FFFFFF' }, { name: 'Midnight', hex: '#101D45' }],
      storage: [
        { label: 'Single Speaker', deltaCents: 0 },
        { label: 'Stereo Pair (2-Pack)', deltaCents: 900000 },
      ],
      specs: { display: 'Touch Glass Surface', chip: 'S7 Audio Silicon', battery: 'USB-C 20W Adapter', weight: '345 g', connectivity: 'Wi-Fi, Thread, UWB' },
      care_price_cents: 150000,
    },
    {
      slug: 'kanso-home-studio',
      sku: 'KN-AUD-07',
      name: 'Kanso Home Speaker Studio',
      price_cents: 2990000,
      originalPriceCents: 3290000,
      stock: 15,
      tag: 'In Stock',
      rating: 4.9,
      reviewCount: 280,
      short_description: 'High-excursion woofer + 5 beam-forming tweeters with room sensing.',
      description: 'Automatically adapts soundstage to walls and furniture for warm studio fidelity anywhere in the home.',
      dimensions: '16.8 cm H x 14.2 cm W',
      materials: 'Acoustically transparent knit mesh',
      variants: ['Midnight', 'White'],
      swatches: [{ name: 'Midnight', hex: '#101D45' }, { name: 'White', hex: '#F8FAFF' }],
      storage: [{ label: 'Standard Unit', deltaCents: 0 }],
      specs: { display: 'Ambient Light Ring', chip: 'S9 Spatial Audio', battery: 'AC Powered', weight: '2.3 kg', connectivity: 'Wi-Fi 6, Spatial Stereo Pair' },
      care_price_cents: 390000,
    },
    {
      slug: 'kanso-anc-travel',
      sku: 'KN-AUD-08',
      name: 'Kanso ANC Travel Edition',
      price_cents: 4490000,
      originalPriceCents: 4990000,
      stock: 22,
      tag: '10% Off',
      rating: 4.8,
      reviewCount: 344,
      short_description: 'Foldable 40-hour travel headphones with airplane 3.5mm + USB-C adapter.',
      description: 'Designed to silence jet cabins completely while folding flat into a compact ballistic nylon travel shell.',
      dimensions: '18.2 cm H x 16.0 cm W (folded flat)',
      materials: 'Memory-foam vegan leather, brushed aluminum hinge',
      variants: ['Royal Navy', 'Silver'],
      swatches: [{ name: 'Royal Navy', hex: '#173B9B' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [{ label: 'With Flight Kit', deltaCents: 0 }],
      specs: { display: 'Fold-Flat Hinge', chip: 'Adaptive ANC v3', battery: 'Up to 40 hours', weight: '254 g', connectivity: 'Bluetooth 5.3, Multipoint' },
      care_price_cents: 490000,
    },
    {
      slug: 'kanso-dac-desktop',
      sku: 'KN-AUD-09',
      name: 'Kanso DAC Amp Desktop',
      price_cents: 3490000,
      originalPriceCents: null,
      stock: 13,
      tag: 'Audiophile',
      rating: 4.9,
      reviewCount: 98,
      short_description: '32-bit/768kHz R2R ladder DAC & balanced Class-A headphone amplifier.',
      description: 'CNC aluminum desk centerpiece with a weighted analog volume wheel for demanding studio headphones.',
      dimensions: '14.5 cm W x 14.5 cm D x 3.8 cm H',
      materials: 'Bead-blasted aluminum chassis, knurled steel dial',
      variants: ['Silver', 'Space Black'],
      swatches: [{ name: 'Silver', hex: '#E3E4E6' }, { name: 'Space Black', hex: '#1D1D1F' }],
      storage: [{ label: 'Desktop DAC/Amp', deltaCents: 0 }],
      specs: { display: 'OLED Sample Rate Meter', chip: 'Dual AKM Reference DAC', battery: 'USB-C / Linear Power', weight: '780 g', connectivity: 'USB-C, Optical, 4.4mm Bal' },
      care_price_cents: 390000,
    },
    {
      slug: 'kanso-studio-mic',
      sku: 'KN-AUD-10',
      name: 'Kanso Studio Mic Condenser',
      price_cents: 1990000,
      originalPriceCents: 2290000,
      stock: 25,
      tag: 'Creator',
      rating: 4.8,
      reviewCount: 276,
      short_description: 'Large-diaphragm USB-C & XLR broadcast microphone with zero-latency monitor.',
      description: 'Warm vocal presence for podcasts, instrument recording, and crisp engineering standups.',
      dimensions: '17.4 cm H x 5.4 cm Diameter',
      materials: 'Brass capsule grille, anodized aluminum body',
      variants: ['Space Black', 'Silver'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: 'Mic + Desk Stand', deltaCents: 0 },
        { label: 'With Boom Arm + Shock Mount', deltaCents: 650000 },
      ],
      specs: { display: 'Gain Ring Indicator', chip: '24-Bit/192kHz Preamp', battery: 'USB Bus / 48V Phantom', weight: '510 g', connectivity: 'USB-C & Balanced XLR' },
      care_price_cents: 250000,
    },
    {
      slug: 'kanso-sport-neckband',
      sku: 'KN-AUD-11',
      name: 'Kanso Sport Endurance Earphones',
      price_cents: 1190000,
      originalPriceCents: 1390000,
      stock: 30,
      tag: 'Active',
      rating: 4.7,
      reviewCount: 412,
      short_description: 'IP68 waterproof earhooks, heart-rate sensor, and 15-hour run battery.',
      description: 'Locked-in acoustic seal built for marathon training, rain runs, and gym intervals.',
      dimensions: 'Compact pocket pouch',
      materials: 'Medical silicone earhooks, titanium wire core',
      variants: ['Royal Blue', 'Black'],
      swatches: [{ name: 'Royal Blue', hex: '#2455D6' }, { name: 'Black', hex: '#1D1D1F' }],
      storage: [{ label: 'Standard Fit Pack', deltaCents: 0 }],
      specs: { display: 'Heart-Rate Optical Pod', chip: 'H2 Sport', battery: 'Up to 15 hours', weight: '26 g', connectivity: 'Bluetooth 5.3, IP68' },
      care_price_cents: 190000,
    },
    {
      slug: 'kanso-iem-lossless',
      sku: 'KN-AUD-12',
      name: 'Kanso Lossless Monitor IEM',
      price_cents: 3990000,
      originalPriceCents: null,
      stock: 8,
      tag: 'Limited Run',
      rating: 5.0,
      reviewCount: 61,
      short_description: 'Quad-driver hybrid in-ear monitors machined from medical stainless steel.',
      description: 'Tuned for acoustic neutrality with detachable silver-plated OFC cables for live stage and studio precision.',
      dimensions: 'Universal custom-shell profile',
      materials: '316L stainless steel acoustic chambers',
      variants: ['Mirror Steel', 'Cobalt Ti'],
      swatches: [{ name: 'Mirror Steel', hex: '#DFE1E4' }, { name: 'Cobalt Ti', hex: '#2455D6' }],
      storage: [{ label: '3.5mm + 4.4mm + USB-C DAC', deltaCents: 0 }],
      specs: { display: '1DD + 3BA Hybrid', chip: '3-Way Acoustic Crossover', battery: 'Passive Wired', weight: '18 g', connectivity: 'MMCX Detachable' },
      care_price_cents: 450000,
    },
  ].map((item) => ({ ...item, category: 'Audio', image_key: 'studio-headphones', care_name: 'KansoCare+ for Audio' }));

  const wearables = [
    {
      slug: 'kanso-watch-ultra',
      sku: 'KN-WTC-02',
      name: 'Kanso Watch Ultra',
      price_cents: 8990000,
      originalPriceCents: 9490000,
      stock: 9,
      tag: 'Limited Run',
      rating: 4.9,
      reviewCount: 384,
      short_description: '49mm aerospace titanium case. Dual-frequency GPS. 36-hour battery.',
      description: 'Built for endurance athletes, divers, and backcountry navigation with a flat sapphire crystal and precision dual-frequency GPS.',
      dimensions: '49 mm Case x 44 mm W x 14.4 mm D',
      materials: 'Aerospace-grade titanium, flat sapphire crystal',
      variants: ['Natural Titanium', 'Black Titanium', 'Royal Ocean Band'],
      swatches: [{ name: 'Natural Titanium', hex: '#BEB8AE' }, { name: 'Black Titanium', hex: '#1D1D1F' }, { name: 'Royal Ocean Band', hex: '#2455D6' }],
      storage: [
        { label: '49mm · Ocean Band', deltaCents: 0 },
        { label: '49mm · Titanium Milanese Loop', deltaCents: 1000000 },
      ],
      specs: { display: '49mm 3000-nit LTPO OLED', chip: 'S10 Dual-Core SiP', battery: 'Up to 36 hours (72h Low Power)', weight: '61.4 g', connectivity: 'LTE Cellular, Dual-Freq GPS' },
      care_price_cents: 990000,
    },
    {
      slug: 'kanso-watch-s10-alu',
      sku: 'KN-WTC-10A',
      name: 'Kanso Watch Series 10 Aluminum',
      price_cents: 4690000,
      originalPriceCents: 4990000,
      stock: 28,
      tag: 'New',
      rating: 4.9,
      reviewCount: 540,
      short_description: 'Our thinnest wide-angle OLED watch with ECG, sleep tracking, and fast charge.',
      description: '46mm or 42mm polished jet-black or silver aluminum case with 80% battery charge in just 30 minutes.',
      dimensions: '46 mm Case x 39 mm W x 9.7 mm D',
      materials: 'Recycled aluminum, Ion-X glass',
      variants: ['Jet Black', 'Silver', 'Royal Sport Loop'],
      swatches: [{ name: 'Jet Black', hex: '#1D1D1F' }, { name: 'Silver', hex: '#E3E4E6' }, { name: 'Royal Sport Loop', hex: '#2455D6' }],
      storage: [
        { label: '42mm · GPS', deltaCents: 0 },
        { label: '46mm · GPS + Cellular', deltaCents: 1000000 },
      ],
      specs: { display: '46mm Wide-Angle OLED', chip: 'S10 SiP', battery: 'Up to 18 hours', weight: '36.4 g', connectivity: 'GPS, Wi-Fi, Optional LTE' },
      care_price_cents: 590000,
    },
    {
      slug: 'kanso-watch-s10-ti',
      sku: 'KN-WTC-10T',
      name: 'Kanso Watch Series 10 Titanium',
      price_cents: 7490000,
      originalPriceCents: null,
      stock: 14,
      tag: 'Best Seller',
      rating: 4.9,
      reviewCount: 215,
      short_description: 'Mirror-polished Grade 5 titanium with sapphire crystal and standard LTE.',
      description: 'Jeweler-grade finish paired with depth-gauge swim metrics and whisper-thin 9.7mm ergonomics.',
      dimensions: '46 mm Case x 39 mm W x 9.7 mm D',
      materials: 'Mirror titanium, sapphire front crystal',
      variants: ['Natural Titanium', 'Slate Titanium'],
      swatches: [{ name: 'Natural Titanium', hex: '#BEB8AE' }, { name: 'Slate Titanium', hex: '#33415C' }],
      storage: [
        { label: '46mm · Sport Band', deltaCents: 0 },
        { label: '46mm · Link Bracelet', deltaCents: 1500000 },
      ],
      specs: { display: '46mm Sapphire OLED', chip: 'S10 SiP', battery: 'Up to 18 hours', weight: '41.7 g', connectivity: 'LTE Cellular, UWB 2' },
      care_price_cents: 890000,
    },
    {
      slug: 'kanso-watch-se',
      sku: 'KN-WTC-SE',
      name: 'Kanso Watch SE GPS',
      price_cents: 2990000,
      originalPriceCents: 3290000,
      stock: 34,
      tag: '10% Off',
      rating: 4.7,
      reviewCount: 790,
      short_description: 'Essential fitness rings, Crash Detection, heart-rate alerts, and swimproof.',
      description: 'A light, joyful daily companion bringing all core wellness tracking and notifications to your wrist.',
      dimensions: '44 mm Case x 38 mm W x 10.7 mm D',
      materials: 'Aluminum case, nylon composite back',
      variants: ['Midnight', 'Starlight', 'Silver'],
      swatches: [{ name: 'Midnight', hex: '#101D45' }, { name: 'Starlight', hex: '#E7E0D3' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [
        { label: '40mm · GPS', deltaCents: 0 },
        { label: '44mm · GPS', deltaCents: 300000 },
      ],
      specs: { display: '44mm Retina OLED', chip: 'S8 Dual-Core', battery: 'Up to 18 hours', weight: '32.9 g', connectivity: 'GPS, Bluetooth 5.3' },
      care_price_cents: 390000,
    },
    {
      slug: 'kanso-watch-endurance',
      sku: 'KN-WTC-END',
      name: 'Kanso Watch Endurance 47mm',
      price_cents: 6490000,
      originalPriceCents: null,
      stock: 13,
      tag: 'In Stock',
      rating: 4.8,
      reviewCount: 162,
      short_description: '14-day marathon battery, offline topo maps, and solar-boosted sapphire.',
      description: 'Built specifically for ultra-runners and cyclists needing multi-day GPS logging without nightly charging.',
      dimensions: '47 mm Case x 12.2 mm D',
      materials: 'DLC titanium bezel, fiber-reinforced case',
      variants: ['Slate Navy', 'Titanium'],
      swatches: [{ name: 'Slate Navy', hex: '#173B9B' }, { name: 'Titanium', hex: '#BEB8AE' }],
      storage: [{ label: '47mm · Trail Nylon Loop', deltaCents: 0 }],
      specs: { display: '1.4" Memory-in-Pixel + OLED', chip: 'Multi-Band GNSS', battery: 'Up to 14 days', weight: '54 g', connectivity: 'Dual-Freq GPS, ANT+, BLE' },
      care_price_cents: 690000,
    },
    {
      slug: 'kanso-health-ring',
      sku: 'KN-WTC-RNG',
      name: 'Kanso Health Ring Titanium',
      price_cents: 3290000,
      originalPriceCents: 3590000,
      stock: 25,
      tag: 'New',
      rating: 4.8,
      reviewCount: 318,
      short_description: '2.5mm slim titanium ring tracking HRV, sleep stages, and recovery.',
      description: 'Screen-free sleep and readiness insights packaged inside a scratch-resistant PVD titanium band.',
      dimensions: '7.9 mm Width x 2.55 mm Thick',
      materials: 'Grade 5 Titanium, medical epoxy inner molding',
      variants: ['Brushed Titanium', 'Stealth Black', 'Royal Gold'],
      swatches: [{ name: 'Brushed Titanium', hex: '#BEB8AE' }, { name: 'Stealth Black', hex: '#1D1D1F' }, { name: 'Royal Gold', hex: '#D4AF37' }],
      storage: [
        { label: 'Standard Sizing Kit Included', deltaCents: 0 },
      ],
      specs: { display: 'Screen-Free Minimalist', chip: 'Low-Power Biometric', battery: 'Up to 7 days', weight: '3.2 g', connectivity: 'Bluetooth LE, 100m Water Res' },
      care_price_cents: 390000,
    },
    {
      slug: 'kanso-fitness-pulse',
      sku: 'KN-WTC-PLS',
      name: 'Kanso Fitness Band Pulse',
      price_cents: 1490000,
      originalPriceCents: 1690000,
      stock: 44,
      tag: '12% Off',
      rating: 4.7,
      reviewCount: 620,
      short_description: '1.6" AMOLED edge display, SpO2, 120 workout modes, and 14-day battery.',
      description: 'Ultra-light daily step, heart-rate, and sleep tracker with vibrant AMOLED clarity.',
      dimensions: '46 mm H x 22 mm W x 9.8 mm D',
      materials: 'Aluminum frame, fluoroelastomer strap',
      variants: ['Royal Blue', 'Black', 'Ice Silver'],
      swatches: [{ name: 'Royal Blue', hex: '#2455D6' }, { name: 'Black', hex: '#1D1D1F' }, { name: 'Ice Silver', hex: '#C9D8FF' }],
      storage: [{ label: 'One Size Strap Included', deltaCents: 0 }],
      specs: { display: '1.62" 60Hz AMOLED', chip: 'Ultra-Low Power', battery: 'Up to 14 days', weight: '21 g', connectivity: 'BLE 5.3, 5ATM Waterproof' },
      care_price_cents: 190000,
    },
    {
      slug: 'kanso-watch-milanese',
      sku: 'KN-WTC-MIL',
      name: 'Kanso Watch Milanese Edition',
      price_cents: 5490000,
      originalPriceCents: null,
      stock: 15,
      tag: 'Luxury',
      rating: 4.9,
      reviewCount: 144,
      short_description: 'Woven stainless mesh band paired with sapphire watch face for evening wear.',
      description: 'Transitions effortlessly from morning studio runs to formal dinners with an infinitely adjustable magnetic clasp.',
      dimensions: '42 mm Case x 9.7 mm D',
      materials: 'Stainless steel woven mesh, sapphire crystal',
      variants: ['Silver Mesh', 'Midnight Mesh'],
      swatches: [{ name: 'Silver Mesh', hex: '#DFE1E4' }, { name: 'Midnight Mesh', hex: '#101D45' }],
      storage: [{ label: '42mm · Milanese Loop', deltaCents: 0 }],
      specs: { display: '42mm Sapphire OLED', chip: 'S10 SiP', battery: 'Up to 18 hours', weight: '48 g', connectivity: 'GPS + Cellular' },
      care_price_cents: 650000,
    },
    {
      slug: 'kanso-watch-dive',
      sku: 'KN-WTC-DIV',
      name: 'Kanso Watch Dive Pro 100m',
      price_cents: 9490000,
      originalPriceCents: null,
      stock: 6,
      tag: 'Pro',
      rating: 5.0,
      reviewCount: 58,
      short_description: 'EN13319 certified dive computer with decompression planner and compass.',
      description: 'Rated to 100 meters with water temperature sensing, ascent-rate alarms, and gloved physical tactile buttons.',
      dimensions: '49 mm Case x 14.8 mm D',
      materials: 'Grade 5 Titanium, triple-gasket crown',
      variants: ['Ocean Blue Band', 'Black Band'],
      swatches: [{ name: 'Ocean Blue Band', hex: '#2455D6' }, { name: 'Black Band', hex: '#1D1D1F' }],
      storage: [{ label: '49mm · Dive Kit + Ext Strap', deltaCents: 0 }],
      specs: { display: '49mm High-Contrast OLED', chip: 'S10 Dive Telemetry', battery: 'Up to 40 hours', weight: '65 g', connectivity: 'Depth Sensor 100m, LTE' },
      care_price_cents: 1090000,
    },
    {
      slug: 'kanso-watch-trail',
      sku: 'KN-WTC-TRL',
      name: 'Kanso Watch Trail Cellular',
      price_cents: 5990000,
      originalPriceCents: 6490000,
      stock: 18,
      tag: 'In Stock',
      rating: 4.8,
      reviewCount: 190,
      short_description: 'Leave your phone at home with cellular calls, music, and breadcrumb GPS.',
      description: 'Lightweight runner-focused frame with dual-band GPS accuracy under dense forest canopy.',
      dimensions: '45 mm Case x 10.4 mm D',
      materials: 'Matte aluminum, reflective woven loop',
      variants: ['Trail Blue', 'Forest Black'],
      swatches: [{ name: 'Trail Blue', hex: '#4169E1' }, { name: 'Forest Black', hex: '#1D1D1F' }],
      storage: [{ label: '45mm · GPS + LTE', deltaCents: 0 }],
      specs: { display: '45mm 2000-nit OLED', chip: 'S10 SiP', battery: 'Up to 24 hours', weight: '38 g', connectivity: 'LTE eSIM, Dual GPS' },
      care_price_cents: 690000,
    },
    {
      slug: 'kanso-watch-ceramic',
      sku: 'KN-WTC-CER',
      name: 'Kanso Watch Studio Ceramic',
      price_cents: 8490000,
      originalPriceCents: null,
      stock: 7,
      tag: 'Limited Run',
      rating: 4.9,
      reviewCount: 74,
      short_description: 'Zirconia-toughened white ceramic housing resistant to every everyday scratch.',
      description: 'Kiln-fired over 48 hours and diamond-lapped to a serene glossy sheen paired with sapphire glass.',
      dimensions: '44 mm Case x 10.2 mm D',
      materials: 'White zirconia ceramic, sapphire crystal',
      variants: ['Pure Ceramic White'],
      swatches: [{ name: 'Pure Ceramic White', hex: '#FFFFFF' }],
      storage: [{ label: '44mm · White Fluoroelastomer', deltaCents: 0 }],
      specs: { display: '44mm Sapphire OLED', chip: 'S10 SiP', battery: 'Up to 18 hours', weight: '46 g', connectivity: 'GPS + Cellular' },
      care_price_cents: 950000,
    },
    {
      slug: 'kanso-watch-lite',
      sku: 'KN-WTC-LTE',
      name: 'Kanso Watch Lite 41mm',
      price_cents: 2490000,
      originalPriceCents: 2790000,
      stock: 32,
      tag: '11% Off',
      rating: 4.7,
      reviewCount: 482,
      short_description: 'Featherweight 41mm everyday smart timepiece with 4-day battery.',
      description: 'Clean minimal watch faces, notification replies, and reliable workout tracking at an entry price.',
      dimensions: '41 mm Case x 9.5 mm D',
      materials: 'Recycled aluminum, silicone strap',
      variants: ['Ice Blue', 'Silver', 'Midnight'],
      swatches: [{ name: 'Ice Blue', hex: '#C9D8FF' }, { name: 'Silver', hex: '#E3E4E6' }, { name: 'Midnight', hex: '#101D45' }],
      storage: [{ label: '41mm · Wi-Fi + GPS', deltaCents: 0 }],
      specs: { display: '41mm AMOLED', chip: 'K-Watch Core', battery: 'Up to 4 days', weight: '27 g', connectivity: 'GPS, BLE 5.3' },
      care_price_cents: 290000,
    },
  ].map((item) => ({ ...item, category: 'Wearables', image_key: 'titanium-watch', care_name: 'KansoCare+ for Watch' }));

  const displays = [
    {
      slug: 'kanso-studio-display-6k',
      sku: 'KN-DSP-27',
      name: 'Kanso Studio Display 6K',
      price_cents: 15990000,
      originalPriceCents: 16990000,
      stock: 7,
      tag: 'Limited Run',
      rating: 4.9,
      reviewCount: 234,
      short_description: '27-inch 6K Retina canvas. 12MP Center Stage camera. Six-speaker array.',
      description: 'A sweeping 27-inch 6K Retina panel engineered for colorists, engineers, and architects—with a precision aluminum stand and 96W host charging.',
      dimensions: '62.3 cm W x 47.8 cm H x 16.8 cm D',
      materials: 'Machined solid aluminum chassis, reference glass',
      variants: ['Silver Aluminum', 'Space Gray'],
      swatches: [{ name: 'Silver Aluminum', hex: '#DFE1E4' }, { name: 'Space Gray', hex: '#64748B' }],
      storage: [
        { label: 'Standard Glass · Tilt Stand', deltaCents: 0 },
        { label: 'Nano-Texture Glass · Tilt Stand', deltaCents: 3000000 },
        { label: 'Nano-Texture · Height Stand', deltaCents: 5500000 },
      ],
      specs: { display: '27" 6K Retina (6016 x 3384)', chip: 'A16 Studio Image Engine', battery: 'AC Powered · 96W Host Charge', weight: '6.3 kg', connectivity: '1x Thunderbolt 4, 3x USB-C' },
      care_price_cents: 1490000,
    },
    {
      slug: 'kanso-pro-xdr-32',
      sku: 'KN-DSP-32',
      name: 'Kanso Pro Display XDR 32"',
      price_cents: 44990000,
      originalPriceCents: null,
      stock: 4,
      tag: 'Pro',
      rating: 5.0,
      reviewCount: 52,
      short_description: '32-inch 6K Extreme Dynamic Range reference monitor with 1600-nit HDR.',
      description: 'True 10-bit reference color with 576 full-array local dimming zones built for mastering suites.',
      dimensions: '71.8 cm W x 41.2 cm H x 2.7 cm D',
      materials: 'Lattice-milled aluminum enclosure',
      variants: ['Silver Aluminum'],
      swatches: [{ name: 'Silver Aluminum', hex: '#DFE1E4' }],
      storage: [
        { label: 'Standard Glass · Pro Stand', deltaCents: 0 },
        { label: 'Nano-Texture · Pro Stand', deltaCents: 7500000 },
      ],
      specs: { display: '32" 6K XDR (1600 nits peak)', chip: 'Dual TCON Calibration', battery: 'AC Powered · 100W Host Charge', weight: '7.48 kg', connectivity: '1x Thunderbolt 4, 3x USB-C' },
      care_price_cents: 3490000,
    },
    {
      slug: 'kanso-studio-5k',
      sku: 'KN-DSP-5K',
      name: 'Kanso Studio Display 5K Standard',
      price_cents: 12990000,
      originalPriceCents: 13990000,
      stock: 14,
      tag: 'Best Seller',
      rating: 4.9,
      reviewCount: 492,
      short_description: '27" 5K (218 PPI) crystal-sharp text rendering with 600 nits brightness.',
      description: 'The quintessential desk companion for Kanso Book users seeking razor-sharp typography over a single Thunderbolt cable.',
      dimensions: '62.3 cm W x 47.8 cm H x 16.8 cm D',
      materials: 'Anodized aluminum, optical glass',
      variants: ['Silver Aluminum'],
      swatches: [{ name: 'Silver Aluminum', hex: '#DFE1E4' }],
      storage: [
        { label: 'Tilt-Adjustable Stand', deltaCents: 0 },
        { label: 'VESA Mount Adapter', deltaCents: 0 },
      ],
      specs: { display: '27" 5K IPS (5120 x 2880)', chip: 'A15 Camera & Audio', battery: 'AC Powered · 96W Charge', weight: '6.1 kg', connectivity: 'Thunderbolt 4 + 3x USB-C' },
      care_price_cents: 1290000,
    },
    {
      slug: 'kanso-studio-nano',
      sku: 'KN-DSP-NAN',
      name: 'Kanso Studio Display Nano-Glass',
      price_cents: 17990000,
      originalPriceCents: null,
      stock: 8,
      tag: 'New',
      rating: 4.9,
      reviewCount: 118,
      short_description: 'Sunlit studio anti-glare 6K canvas with height & tilt counterbalanced arm.',
      description: 'Zero distracting reflections even beside floor-to-ceiling windows, complete with a buttery counterbalanced stand.',
      dimensions: '62.3 cm W x 47.8 cm H x 16.8 cm D',
      materials: 'Nano-etched glass, machined aluminum stand',
      variants: ['Silver Aluminum'],
      swatches: [{ name: 'Silver Aluminum', hex: '#DFE1E4' }],
      storage: [{ label: 'Nano-Texture + Height Stand', deltaCents: 0 }],
      specs: { display: '27" 6K Nano-Texture', chip: 'A16 Studio Engine', battery: 'AC Powered · 96W Charge', weight: '7.5 kg', connectivity: 'Thunderbolt 4, 3x USB-C' },
      care_price_cents: 1590000,
    },
    {
      slug: 'kanso-ultrawide-38',
      sku: 'KN-DSP-38U',
      name: 'Kanso Ultrawide 38" Curved 5K2K',
      price_cents: 13990000,
      originalPriceCents: 14990000,
      stock: 11,
      tag: 'Popular',
      rating: 4.8,
      reviewCount: 274,
      short_description: '21:9 panoramic 38" 5K2K IPS Black curve with built-in KVM switch.',
      description: 'Replaces dual monitors with one clean curved workspace, picture-by-picture switching, and 100W USB-C power.',
      dimensions: '89.5 cm W x 51.0 cm H x 23.0 cm D',
      materials: 'Brushed silver alloy stand, ultra-slim bezels',
      variants: ['Silver', 'Space Black'],
      swatches: [{ name: 'Silver', hex: '#DFE1E4' }, { name: 'Space Black', hex: '#1D1D1F' }],
      storage: [{ label: 'Standard Height Stand', deltaCents: 0 }],
      specs: { display: '38" 5120x2160 120Hz', chip: 'Integrated KVM Hub', battery: 'AC Powered · 100W Charge', weight: '9.1 kg', connectivity: 'Thunderbolt 4, HDMI 2.1, RJ45' },
      care_price_cents: 1390000,
    },
    {
      slug: 'kanso-creator-27-4k',
      sku: 'KN-DSP-27C',
      name: 'Kanso Creator Monitor 27" 4K',
      price_cents: 6490000,
      originalPriceCents: 7190000,
      stock: 20,
      tag: '10% Off',
      rating: 4.8,
      reviewCount: 412,
      short_description: 'Factory Calman-verified 99% DCI-P3 4K monitor with pivot ergonomic stand.',
      description: 'Accessible color-critical desktop canvas for freelance designers, editors, and software engineers.',
      dimensions: '61.3 cm W x 53.0 cm H x 18.5 cm D',
      materials: 'Matte polycarbonate & aluminum spine',
      variants: ['Slate Silver', 'Midnight'],
      swatches: [{ name: 'Slate Silver', hex: '#DFE1E4' }, { name: 'Midnight', hex: '#101D45' }],
      storage: [{ label: '27" 4K + Ergonomic Stand', deltaCents: 0 }],
      specs: { display: '27" 4K IPS (99% P3)', chip: 'Hardware LUT Calibrated', battery: 'AC Powered · 90W USB-C', weight: '5.8 kg', connectivity: 'USB-C, DisplayPort 1.4, HDMI' },
      care_price_cents: 790000,
    },
    {
      slug: 'kanso-office-24',
      sku: 'KN-DSP-24O',
      name: 'Kanso Dual-Link 24" Office',
      price_cents: 4490000,
      originalPriceCents: 5090000,
      stock: 26,
      tag: '12% Off',
      rating: 4.7,
      reviewCount: 338,
      short_description: '23.8" 4K crisp office monitor with daisy-chain DisplayPort & USB-C hub.',
      description: 'Clean minimal desktop footprint that chains cleanly into dual-monitor studio setups with one laptop cable.',
      dimensions: '53.8 cm W x 48.0 cm H x 17.5 cm D',
      materials: 'Matte anodized stand, anti-glare coat',
      variants: ['Silver'],
      swatches: [{ name: 'Silver', hex: '#DFE1E4' }],
      storage: [{ label: 'Single Monitor', deltaCents: 0 }, { label: 'Dual Studio Pair', deltaCents: 4200000 }],
      specs: { display: '23.8" 4K IPS (60Hz)', chip: 'MST Daisy-Chain Hub', battery: 'AC Powered · 65W Charge', weight: '4.6 kg', connectivity: 'USB-C In/Out, HDMI, USB-A' },
      care_price_cents: 590000,
    },
    {
      slug: 'kanso-portable-oled',
      sku: 'KN-DSP-16P',
      name: 'Kanso Portable OLED 16" Display',
      price_cents: 3890000,
      originalPriceCents: 4290000,
      stock: 19,
      tag: 'Portable',
      rating: 4.9,
      reviewCount: 284,
      short_description: '4mm slim 16" 3K OLED travel monitor powered by a single USB-C cable.',
      description: 'Slips into your laptop sleeve alongside a magnetic kickstand for dual-screen coding from anywhere.',
      dimensions: '35.5 cm W x 22.8 cm H x 0.45 cm D',
      materials: 'CNC brushed aluminum, magnetic folio cover',
      variants: ['Space Black', 'Silver'],
      swatches: [{ name: 'Space Black', hex: '#1D1D1F' }, { name: 'Silver', hex: '#E3E4E6' }],
      storage: [{ label: 'Standard Non-Touch OLED', deltaCents: 0 }, { label: 'Touch + Stylus Edition', deltaCents: 800000 }],
      specs: { display: '16.0" 3K 120Hz OLED', chip: 'Zero-Power Single Cable', battery: 'USB-C Bus Powered', weight: '620 g', connectivity: '2x USB-C, Mini HDMI' },
      care_price_cents: 450000,
    },
    {
      slug: 'kanso-colorist-oled-32',
      sku: 'KN-DSP-32O',
      name: 'Kanso Colorist Reference 32" OLED',
      price_cents: 29990000,
      originalPriceCents: null,
      stock: 5,
      tag: 'Studio',
      rating: 5.0,
      reviewCount: 41,
      short_description: 'Dual-layer Tandem OLED 4K 120Hz mastering monitor with SDI + shading hood.',
      description: 'Zero blooming, 1,000,000:1 contrast ratio, and built-in colorimeter wand for post-production suites.',
      dimensions: '72.0 cm W x 43.0 cm H x 4.2 cm D',
      materials: 'Anodized studio housing, magnetic flocking hood',
      variants: ['Studio Black'],
      swatches: [{ name: 'Studio Black', hex: '#1D1D1F' }],
      storage: [{ label: 'With Calibration Hood', deltaCents: 0 }],
      specs: { display: '32" 4K Tandem OLED 120Hz', chip: '3D LUT Hardware Engine', battery: 'AC Powered', weight: '8.9 kg', connectivity: '12G-SDI, Thunderbolt 4, HDMI 2.1' },
      care_price_cents: 2490000,
    },
    {
      slug: 'kanso-gaming-240hz',
      sku: 'KN-DSP-240',
      name: 'Kanso Gaming 27" 240Hz OLED',
      price_cents: 9490000,
      originalPriceCents: 10490000,
      stock: 15,
      tag: 'New',
      rating: 4.9,
      reviewCount: 215,
      short_description: '0.03ms response time, 240Hz WOLED QHD panel, and VRR adaptive sync.',
      description: 'Razor-sharp motion clarity with custom graphene heatsink cooling and subtle ambient rear bias light.',
      dimensions: '61.0 cm W x 49.5 cm H x 19.0 cm D',
      materials: 'Matte anodized chassis, compact hexagon base',
      variants: ['Midnight Navy', 'Black'],
      swatches: [{ name: 'Midnight Navy', hex: '#101D45' }, { name: 'Black', hex: '#1D1D1F' }],
      storage: [{ label: '27" QHD 240Hz', deltaCents: 0 }],
      specs: { display: '27" 240Hz OLED (0.03ms)', chip: 'Adaptive Sync + HDMI 2.1', battery: 'AC Powered · 65W USB-C', weight: '6.4 kg', connectivity: '2x HDMI 2.1, DP 1.4, USB-C' },
      care_price_cents: 990000,
    },
    {
      slug: 'kanso-vertical-code-28',
      sku: 'KN-DSP-28V',
      name: 'Kanso Vertical Code Display 28"',
      price_cents: 5490000,
      originalPriceCents: null,
      stock: 16,
      tag: 'Developer',
      rating: 4.9,
      reviewCount: 304,
      short_description: '16:18 tall aspect ratio (2560x2880) showing twice as many lines of code.',
      description: 'Engineered specifically for software developers, writers, and traders who live inside terminals and documents.',
      dimensions: '48.2 cm W x 55.0 cm H x 15.5 cm D',
      materials: 'Aluminum desk clamp arm included',
      variants: ['Space Gray', 'Silver'],
      swatches: [{ name: 'Space Gray', hex: '#33415C' }, { name: 'Silver', hex: '#DFE1E4' }],
      storage: [{ label: 'With Ergonomic Clamp Arm', deltaCents: 0 }],
      specs: { display: '27.6" 16:18 SDQHD IPS', chip: 'Low-Blue-Light Hardware', battery: 'AC Powered · 90W USB-C', weight: '5.5 kg', connectivity: 'USB-C, 2x HDMI, DisplayPort' },
      care_price_cents: 690000,
    },
    {
      slug: 'kanso-studio-stand-bundle',
      sku: 'KN-DSP-BND',
      name: 'Kanso Studio Stand Pro Bundle',
      price_cents: 19990000,
      originalPriceCents: 21490000,
      stock: 6,
      tag: 'Bundle',
      rating: 4.9,
      reviewCount: 87,
      short_description: 'Studio Display 6K paired with Pro Counterbalanced Stand & Thunderbolt 4 Pro cable.',
      description: 'Complete studio monitor package offering effortless one-finger height, tilt, and 90-degree portrait rotation.',
      dimensions: '62.3 cm W x 52.0 cm H x 18.0 cm D',
      materials: 'Solid aluminum display + steel gimbal stand',
      variants: ['Silver Aluminum'],
      swatches: [{ name: 'Silver Aluminum', hex: '#DFE1E4' }],
      storage: [{ label: '6K + Height/Portrait Pro Stand', deltaCents: 0 }],
      specs: { display: '27" 6K Retina (6016 x 3384)', chip: 'A16 Studio Engine', battery: 'AC Powered · 96W Charge', weight: '7.9 kg', connectivity: 'Thunderbolt 4 Pro Cable Incl.' },
      care_price_cents: 1690000,
    },
  ].map((item) => ({ ...item, category: 'Displays', image_key: 'desktop-display', care_name: 'KansoCare+ for Display' }));

  const allItems = [...laptops, ...phones, ...tablets, ...audio, ...wearables, ...displays];

  return allItems.map((item, idx) => ({
    slug: item.slug,
    sku: item.sku,
    name: item.name,
    category: item.category,
    price_cents: item.price_cents,
    stock: item.stock,
    image_key: item.image_key,
    tag: item.tag,
    short_description: item.short_description,
    description: item.description,
    dimensions: item.dimensions,
    materials: item.materials,
    variants_json: JSON.stringify(item.variants),
    swatches_json: JSON.stringify(item.swatches),
    storage_options_json: JSON.stringify(item.storage),
    specs_json: JSON.stringify({
      ...item.specs,
      rating: item.rating,
      reviewCount: item.reviewCount,
      originalPriceCents: item.originalPriceCents,
    }),
    care_name: item.care_name,
    care_price_cents: item.care_price_cents,
    featured: idx % 6 === 0 ? 1 : 0,
  }));
}

function seedHardwareCatalog() {
  // Migrate from old USD pricing or legacy catalog if detected
  const usdPriceRow = db
    .prepare("SELECT id, price_cents FROM products WHERE slug = 'kanso-book-pro-14'")
    .get();
  const legacyProduct = db
    .prepare("SELECT id FROM products WHERE slug = 'atelier-dome-task-lamp'")
    .get();

  if (legacyProduct || (usdPriceRow && usdPriceRow.price_cents < 1000000)) {
    db.exec('DELETE FROM cart_items; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products;');
  }

  const hardwareLineup = buildCatalogItems();

  const insertOrIgnoreProduct = db.prepare(`
    INSERT OR IGNORE INTO products (
      slug, sku, name, category, price_cents, stock, image_key, tag,
      short_description, description, dimensions, materials, variants_json,
      swatches_json, storage_options_json, specs_json, care_name, care_price_cents, featured
    ) VALUES (
      @slug, @sku, @name, @category, @price_cents, @stock, @image_key, @tag,
      @short_description, @description, @dimensions, @materials, @variants_json,
      @swatches_json, @storage_options_json, @specs_json, @care_name, @care_price_cents, @featured
    )
  `);

  const updateProductMeta = db.prepare(`
    UPDATE products
    SET tag = @tag,
        specs_json = @specs_json
    WHERE slug = @slug
  `);

  const syncTx = db.transaction((items) => {
    for (const item of items) {
      insertOrIgnoreProduct.run(item);
      updateProductMeta.run({
        slug: item.slug,
        tag: item.tag,
        specs_json: item.specs_json,
      });
    }
  });
  syncTx(hardwareLineup);

  let demoUser = db.prepare("SELECT id, name FROM users WHERE email = 'demo@kansogoods.com'").get();
  if (!demoUser) {
    const { hash, salt } = hashPassword('demo1234');
    const userRes = db
      .prepare('INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)')
      .run('Jahnavi Chaganti', 'demo@kansogoods.com', hash, salt);
    demoUser = { id: Number(userRes.lastInsertRowid), name: 'Jahnavi Chaganti' };
  } else if (demoUser.name !== 'Jahnavi Chaganti') {
    db.prepare("UPDATE users SET name = 'Jahnavi Chaganti' WHERE id = ?").run(demoUser.id);
  }

  const orderCountRow = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  if (orderCountRow.count === 0) {
    const sampleProduct = db
      .prepare("SELECT * FROM products WHERE slug = 'kanso-studio-max'")
      .get();

    if (sampleProduct) {
      const orderRes = db
        .prepare(`
          INSERT INTO orders (
            order_number, user_id, session_id, customer_name, customer_email, phone,
            shipping_address, city, postal_code, payment_method, payment_status,
            shipping_status, status, subtotal_cents, discount_cents, coupon_code,
            shipping_cents, total_cents, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, datetime('now', '-2 days'))
        `)
        .run(
          'KG-1042',
          demoUser.id,
          null,
          'Jahnavi Chaganti',
          'demo@kansogoods.com',
          '+91 98480 12345',
          'Road No. 12, Banjara Hills',
          'Hyderabad',
          '500034',
          'cod',
          'Pending COD',
          'Preparing Shipment',
          'Preparing Shipment',
          5990000,
          0,
          5990000
        );

      db.prepare(`
        INSERT INTO order_items (
          order_id, product_id, product_name, product_sku, image_key, variant, engraving, care_included, unit_price_cents, quantity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(orderRes.lastInsertRowid),
        Number(sampleProduct.id),
        String(sampleProduct.name),
        String(sampleProduct.sku),
        String(sampleProduct.image_key),
        'Silver · Standard USB-C Edition',
        'J. CHAGANTI',
        0,
        Number(sampleProduct.price_cents),
        1
      );
    }
  }

  // Safely backfill shipping_status & payment_status for pre-migration existing orders
  db.exec(`
    UPDATE orders SET shipping_status = status WHERE shipping_status IS NULL OR shipping_status = '';
    UPDATE orders SET payment_status = CASE
      WHEN payment_method = 'cod' THEN 'Pending COD'
      WHEN status = 'Cancelled' THEN 'Refunded'
      ELSE 'Authorized'
    END
    WHERE payment_status = 'Pending' OR payment_status IS NULL OR payment_status = '';
  `);
}

function bootstrapAdminFromEnv() {
  if (getAdminCount() > 0) {
    runtimeAdminSetupToken = null;
    return;
  }

  const adminEmail = typeof process.env.ADMIN_EMAIL === 'string' ? process.env.ADMIN_EMAIL.trim().toLowerCase() : '';
  const adminPassword = typeof process.env.ADMIN_PASSWORD === 'string' ? process.env.ADMIN_PASSWORD : '';
  const adminName =
    typeof process.env.ADMIN_NAME === 'string' && process.env.ADMIN_NAME.trim().length >= 2
      ? process.env.ADMIN_NAME.trim()
      : 'Kanso Operations Admin';

  if (adminEmail && adminEmail.includes('@') && adminPassword.length >= 8) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (existing) {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
    } else {
      const { hash, salt } = hashPassword(adminPassword);
      db.prepare(
        "INSERT INTO users (name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, 'admin')"
      ).run(adminName, adminEmail, hash, salt);
    }
    runtimeAdminSetupToken = null;
    console.log(`[Kanso Tech] Initial admin provisioned for ${adminEmail}.`);
    return;
  }

  if (!process.env.ADMIN_SETUP_SECRET) {
    runtimeAdminSetupToken = crypto.randomBytes(16).toString('hex');
    console.log(
      `[Kanso Tech] No admin user configured yet. Set ADMIN_EMAIL & ADMIN_PASSWORD or claim first admin at /account or /dispatch with setup token: ${runtimeAdminSetupToken}`
    );
  }
}

export function mapProductRow(row) {
  const specs = JSON.parse(row.specs_json || '{}');
  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    category: row.category,
    priceCents: row.price_cents,
    originalPriceCents: specs.originalPriceCents ? Number(specs.originalPriceCents) : null,
    rating: specs.rating ? Number(specs.rating) : 4.8,
    reviewCount: specs.reviewCount ? Number(specs.reviewCount) : 120,
    stock: row.stock,
    imageKey: row.image_key,
    tag: row.tag,
    shortDescription: row.short_description,
    description: row.description,
    dimensions: row.dimensions,
    materials: row.materials,
    variants: JSON.parse(row.variants_json || '[]'),
    swatches: JSON.parse(row.swatches_json || '[]'),
    storageOptions: JSON.parse(row.storage_options_json || '[]'),
    specs,
    careName: row.care_name || 'KansoCare+',
    carePriceCents: Number(row.care_price_cents || 0),
    featured: row.featured === 1,
  };
}

export function mapUserRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role || 'customer',
    createdAt: row.created_at,
  };
}

export function hydrateOrder(orderRow) {
  const itemRows = db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC')
    .all(orderRow.id);

  const items = itemRows.map((item) => ({
    id: item.id,
    productId: item.product_id,
    productName: item.product_name,
    productSku: item.product_sku,
    imageKey: item.image_key,
    variant: item.variant,
    engraving: item.engraving || '',
    careIncluded: item.care_included === 1,
    unitPriceCents: item.unit_price_cents,
    quantity: item.quantity,
  }));

  return {
    id: orderRow.id,
    orderNumber: orderRow.order_number,
    userId: orderRow.user_id,
    sessionId: orderRow.session_id,
    customerName: orderRow.customer_name,
    customerEmail: orderRow.customer_email,
    phone: orderRow.phone,
    shippingAddress: orderRow.shipping_address,
    city: orderRow.city,
    postalCode: orderRow.postal_code,
    paymentMethod: orderRow.payment_method,
    paymentStatus: orderRow.payment_status || 'Pending',
    shippingStatus: orderRow.shipping_status || orderRow.status,
    status: orderRow.status,
    subtotalCents: orderRow.subtotal_cents,
    discountCents: Number(orderRow.discount_cents || 0),
    couponCode: orderRow.coupon_code || '',
    shippingCents: orderRow.shipping_cents,
    totalCents: orderRow.total_cents,
    createdAt: orderRow.created_at,
    items,
  };
}
