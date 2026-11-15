# Kanso Tech — Premium Electronics Storefront

**Tagline:** *Premium Technology. Thoughtfully Designed.*

Kanso Tech is a full-stack electronics e-commerce platform built with React 19, Vite, Tailwind CSS 4, Express.js, SQLite (`better-sqlite3`), and WebSockets (`ws`) using pure JavaScript ESM. All product pricing, discounts, monthly EMI estimates, and invoices are presented in Indian Rupees (`₹`).

---

## Core Architecture & Features

- **Preserved 72-Product Electronics Catalog**: 12 curated Kanso hardware models across each of 6 categories (`Laptops`, `Phones`, `Tablets`, `Audio`, `Wearables`, `Displays`) with finishes, memory/storage tiers, complimentary laser engraving, and `KansoCare+` protection plans.
- **Smart Product Finder (`/finder`)**: Deterministic live-catalog matching by category, INR budget, primary usage, important specs, and free-text preferences—optionally enriched with `@google/genai` (`GEMINI_API_KEY`) when configured, with automatic fallback to deterministic spec ranking.
- **Advanced Storefront Discovery**: Instant search suggestions dropdown, category pills, INR price range filter, hardware specification filter, in-stock toggle, rating/price sorting, recently viewed history, and pagination.
- **Database-Backed Wishlist (`/api/wishlist`)**: Persistent saved hardware synced across sessions and automatically merged from guest sessions into customer accounts on login/registration.
- **Interactive Model Comparison (`/compare`)**: Side-by-side matrix comparing up to 4 devices across applicable specifications with difference highlighting and quick add-to-bag actions.
- **Shopping Bag, Coupons & Checkout**: Server-authoritative variant/storage pricing, promo code validation (`KANSO10` for 10% off ₹25,000+ up to ₹15,000; `TECH5000` for ₹5,000 off ₹75,000+), idempotency-guarded duplicate submission protection, atomic warehouse stock deduction, Cash on Delivery fulfillment, and transparent Online Card/UPI gateway status when payment keys are unconfigured.
- **Real-Time Order Tracking & Printable Tax Invoices (`/orders`)**: Live 4-step fulfillment progress, customer cancellation on `Confirmed` orders (with once-only atomic inventory restoration), and printable/downloadable HTML tax invoices.
- **Secured Admin Fulfillment Portal (`/dispatch`)**: Strict server-side RBAC (`role === 'admin'`), order KPI analytics, warehouse stock controls, order search/status filtering, and expandable item details.
- **Targeted WebSocket Events (`/ws`)**: Public inventory/shopper presence updates plus user/admin-isolated private order notifications.

---

## Security & Role-Based Access Control (RBAC)

- **Authenticated-Only Shopping & Recommendations**: Visitors can browse the 72-product catalog, hardware detail specs, and compare matrix publicly, while adding to bag, applying promo coupons, placing orders, viewing/saving wishlist items, tracking orders/invoices, and running Smart Product Finder require customer/admin authentication (`401` when signed out).
- **Customer vs. Admin Roles**: User accounts carry a `role` column (`'customer'` | `'admin'`). Self-registration (`POST /api/auth/register`) strictly enforces `'customer'`.
- **Admin Route Protection**: `PATCH /api/products/:slug/stock`, `GET /api/orders/dispatch/all`, and shipping status progression (`PATCH /api/orders/:orderNumber/status`) require a verified `admin` role (`401`/`403` otherwise).
- **Order Privacy**: `GET /api/orders/:orderNumber` and `GET /api/orders/:orderNumber/invoice` require sign-in and verify ownership (`user_id`) or `admin` privileges.
- **Rate Limiting & Session Signing**: In-memory rate limiting protects `/api/auth/*` endpoints, and HMAC-SHA256 session tokens sign with `SESSION_SECRET` (or a cryptographic ephemeral secret when unset).

---

## Environment Variables (`.env`)

Copy `.env.example` to `.env` and configure values as needed:

| Variable | Purpose |
| --- | --- |
| `PORT` | Server port (defaults to `3000`) |
| `SESSION_SECRET` | Secret used to sign HMAC auth tokens and HTTP-only cookies |
| `GEMINI_API_KEY` | Optional Gemini API key for Smart Product Finder summary enrichment |
| `ADMIN_EMAIL` | Optional bootstrap administrator email (used when zero admins exist) |
| `ADMIN_PASSWORD` | Optional bootstrap administrator password (8+ chars) |
| `ADMIN_SETUP_SECRET` | Optional secret required for one-time admin claiming via `/account` or `POST /api/auth/setup-admin` |

> **Demo Customer Profile:** `demo@kansogoods.com` / `demo1234` (**Jahnavi Chaganti**, includes sample order `#KG-1042`).

---

## Windows PowerShell Setup, Run, Test & Build Commands

1. **Install dependencies:**
   ```powershell
   npm install
   ```

2. **Create `.env` from `.env.example` and edit values:**
   ```powershell
   Copy-Item .env.example .env
   ```

3. **Start the development server (Express + WebSockets + Vite):**
   ```powershell
   npm run dev
   ```
   Open `http://localhost:3000`.

4. **Run the automated test suite:**
   ```powershell
   npm test
   ```

5. **Run syntax checks & production build:**
   ```powershell
   npm run lint
   npm run build
   ```

6. **Run in production mode (serves built `dist/`):**
   ```powershell
   $env:NODE_ENV="production"
   npm start
   ```

---

## Key API Endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Server & payment gateway capability status |
| `GET` | `/api/products` | Public | Catalog listing with category, price, spec, stock, & sort filters |
| `PATCH` | `/api/products/:slug/stock` | Admin | Adjust warehouse inventory & broadcast WebSocket update |
| `POST` | `/api/finder` | Authenticated | Smart Product Finder recommendation engine |
| `GET` / `POST` / `DELETE` | `/api/wishlist` | Authenticated | Persistent database-backed wishlist |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/cart` | Authenticated | Server-authoritative cart management |
| `POST` | `/api/cart/coupon` | Authenticated | Validate promo codes (`KANSO10`, `TECH5000`) |
| `POST` | `/api/orders` | Authenticated | Atomic, idempotent order placement |
| `GET` | `/api/orders/:orderNumber` | Owner / Admin | Authorized order tracking |
| `GET` | `/api/orders/:orderNumber/invoice` | Owner / Admin | Printable HTML tax invoice |
| `PATCH` | `/api/orders/:orderNumber/status` | Owner (cancel) / Admin | Status updates & once-only stock restoration |
| `GET` | `/api/orders/dispatch/all` | Admin | Full operations order queue |
| `POST` | `/api/auth/setup-admin` | Zero-Admin Setup | Claim initial admin account with setup secret |
