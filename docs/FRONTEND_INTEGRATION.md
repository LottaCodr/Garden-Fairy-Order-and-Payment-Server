# Frontend Integration Guide — The Garden Fairy

Everything the backend now exposes, and exactly what the frontend must build to
consume it. This is the definitive contract between the Express/Mongoose API
(`Garden-Fairy-Order-and-Payment-Server`) and the storefront + admin panel.

**The one-sentence version:** the server is now the source of truth for
identity, catalog, cart, stock, prices, orders, payments and settings. The
frontend keeps Zustand stores as *server caches* — every persisted
`localStorage` store and hardcoded constant (demo users, `CITIES`,
`FREE_SHIPPING_THRESHOLD`, seed products/orders, `delivery: 3500`) gets replaced
by API calls.

---

## 1. Architecture contract

| Concern | Before (client-only) | Now (must implement) |
|---|---|---|
| Auth | 2 hardcoded demo users in `auth.store.ts` | Real accounts, httpOnly cookies, rotating refresh tokens, password reset |
| Products | Seed array in `admin.store.ts` | `GET /api/products` (search/filter/sort/paginate) + admin CRUD |
| Cart / Wishlist | Zustand + localStorage | Server cart (works for **guests** via cookie, merges on sign-in), server wishlist |
| Orders | In-memory admin store, fake stock | Durable orders, atomic stock reservation, status timeline |
| Payments | Simulated latency | Flutterwave hosted checkout + verify + webhook |
| Delivery estimate | `CITIES` constant in `product.detail.tsx` | `POST /api/checkout/estimate` (rate table + settings) |
| Admin analytics | Derived from localStorage | Aggregated dashboard/analytics endpoints |
| Contact/Newsletter | Fake toast | Persisted messages + subscription API |
| Images | Static assets | Admin uploads → Cloudinary CDN URLs |
| Store rules | Hardcoded constants | `GET /api/settings` (public) editable via admin |

### Sessions & cookies (all httpOnly, set by the server)

| Cookie | Purpose | Path |
|---|---|---|
| `gf_access` | Short-lived JWT access token | `/` |
| `gf_refresh` | 30-day rotating refresh token | `/api/auth` |
| `gf_session` | Guest session id for cart/checkout (30 days) | `/` |

Rules:

1. **Every request must send cookies** — `fetch(url, { credentials: 'include' })`
   (or `axios.create({ withCredentials: true })`). Without this, guest carts and
   auth silently break.
2. Frontend JS **cannot read** the cookies (httpOnly) — and must not try.
   Session state comes from API responses, not cookies.
3. Auth responses also return `{ token, refreshToken }` in the body. Cookies are
   the primary transport for browsers; only store the tokens in memory/Zustand
   if you need a `Bearer` fallback (e.g. React Native). **Never persist tokens
   to localStorage.**
4. CORS: the backend allowlists `CORS_ORIGIN`. Add every frontend origin
   (dev `http://localhost:3000`/`:5173`, preview, production domain),
   comma-separated, server-side.

### Environment variables (frontend)

```
NEXT_PUBLIC_API_URL=http://localhost:5000   # or VITE_API_URL
```

All calls go to `${API_URL}/api/...`. In production deploy frontend and API on
the same eTLD+1 if possible — `sameSite: 'lax'` cookies are first-party there.
Cross-site deployments work (CORS + `credentials`), but Safari/ITP may block
third-party cookies; a same-site reverse proxy `/api → api-host` is the robust
option, and lets the client use plain relative `/api/...` URLs.

---

## 2. The API client (build this first)

One wrapper used by every store. It must: prefix the base URL, send cookies,
normalize errors, and silently refresh + retry once on `401`.

```ts
// lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  }).then((r) => r.ok).finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown; _retried?: boolean } = {},
): Promise<T> {
  const { json, _retried, headers, ...init } = options;
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });

  if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
    // Access token expired — rotate and retry exactly once.
    if (await tryRefresh()) return api<T>(path, { ...options, _retried: true });
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    // ⚠️ The API uses three different keys depending on the layer:
    // route handlers → `message`, cart routes → `msg`, global handler → `error`.
    const message =
      body?.message ?? body?.msg ?? body?.error ?? `Request failed (${res.status})`;
    throw new ApiError(
      res.status,
      message,
      res.status === 429 ? Number(res.headers.get('Retry-After')) : undefined,
    );
  }
  return body as T;
}
```

### Response envelopes (three families — your client sees these as-is)

| Shape | Used by | Example |
|---|---|---|
| `{ success: true, data, total?, page?, pages? }` | catalog + categories | products list, category list |
| `{ data, ... }` (no `success`) | cart, checkout, admin, reviews, wishlist, settings | `{ data: { items, subtotal } }` |
| `{ message }` / action payloads | auth, contact, newsletter, simple mutations | `{ message: 'Subscribed successfully' }` |

Errors: `{ message }` (most routes), `{ msg }` (cart item errors),
`{ error }` (404 catch-all & unhandled). The client above already merges them.

### Status-code handling matrix (global UX policy)

| Code | Meaning | Frontend behavior |
|---|---|---|
| 400 | Validation failed (server message is human-readable, sometimes `;`-joined) | Inline form error / toast the message verbatim |
| 401 | Not authenticated (or refresh failed) | Silent refresh+retry (auto); if that fails → clear user, redirect to sign-in with `?next=` |
| 403 | Wrong role / not owner | Hide admin UI; toast "no access" |
| 404 | Not found | Product/order missing states |
| 409 | Business conflict: out of stock, duplicate email, already paid, cancel not allowed | Toast message; **refetch cart/product** to re-clamp quantities |
| 429 | Rate limited (`Retry-After` seconds header) | Disable the button that caused it, show countdown, no auto-retry |
| 500 | Server error | Generic error toast + console |

### Idempotency

Mutations that cost money or stock accept an `Idempotency-Key` UUID header:
`POST /api/checkout`, `POST /api/orders`, `POST /api/payments/webhook/*` (server-side), and
`POST /api/payments/initialize`. **Generate one UUID per checkout attempt**
(`crypto.randomUUID()`), send it on every retry of that attempt, and regenerate
it only when the cart contents change. The server replays the first successful
response for a repeated key — so double-clicks, network retries and page
refreshes mid-payment can never create two orders.

### Rate limits to design around

| Route | Limit |
|---|---|
| `POST /auth/signin` | 5 / min / IP |
| `POST /auth/signup` | 10 / min |
| `forgot|reset-password` | 5 / 5 min |
| `POST /contact` | 5 / min |
| `POST /newsletter/*` | 10 / min |
| `POST /checkout` | 20 / min |

Debounce search inputs (~300 ms) and disable submit buttons while in flight —
a form that fires on every keystroke will trip these.

---

## 3. Shared TypeScript types (mirror these in `types/api.ts`)

```ts
// ---------- Users ----------
export interface Address {
  _id?: string;
  label?: string;
  street: string; city: string; state: string;
  isDefault: boolean;
}
export interface User {
  id: string; name: string; email: string;
  role: 'customer' | 'admin';
  phone?: string; avatarUrl?: string;
  addresses: Address[];        // present on auth/refresh/PATCH-me payloads
}
export interface AuthPayload { token: string; refreshToken: string; user: User }

// ---------- Catalog ----------
export interface Category { _id: string; name: string; slug: string; description?: string; icon?: string }
export interface Product {
  _id: string; name: string; slug: string; sku?: string;
  description: string; price: number; compareAtPrice?: number;
  category: Category | string;
  imageUrl: { url: string; publicId: string }[];   // raw
  images: string[];                                 // flat convenience array — prefer this
  care: { sunlight: string; watering: string; temperature: string };
  stock: number; sold: number;
  rating: number; ratingCount: number;
  isPremium: boolean; tags: string[];
  status: 'active' | 'archived';
  createdAt: string;
}
export interface Paged<T> { data: T[]; total: number; page: number; pages: number }

// ---------- Reviews ----------
export interface Review {
  _id: string; product: string;
  user: { _id: string; name: string; avatarUrl?: string };
  rating: 1|2|3|4|5; comment?: string; createdAt: string;
}

// ---------- Cart ----------
export interface CartItem {
  id: string;            // item id (also addressable by product id)
  product: string;
  name: string; price: number; stock: number; image: string;
  qty: number; size?: string; lineTotal: number;
}
export interface Cart { id: string; items: CartItem[]; subtotal: number }

// ---------- Wishlist ----------
export interface WishlistEntry {
  _id: string; user: string;
  product: Pick<Product,'_id'|'name'|'slug'|'price'|'compareAtPrice'|'imageUrl'|'stock'|'rating'|'sold'|'status'>;
  createdAt: string;
}

// ---------- Checkout / orders ----------
export interface DeliveryQuote {
  deliveryFee: number; etaDays: number | null;
  freeShippingApplied: boolean; matchedArea: string | null; currency: 'NGN';
}
export type OrderStatus = 'pending_payment'|'paid'|'processing'|'shipped'|'delivered'|'cancelled';
export interface Order {
  _id: string; user?: string;
  customerName?: string; customerEmail?: string; phone?: string; notes?: string;
  items: { product: string; name: string; price: number; qty: number; size?: string; image?: string }[];
  shippingAddress: { state: string; city: string; street?: string; phone: string; name?: string };
  payment: { provider: string; status: 'unpaid'|'paid'|'failed'|'refunded'; reference?: string; amount: number };
  delivery: { provider?: string; trackingId?: string; status?: 'pending'|'in_transit'|'delivered'|'returned'; etaDays?: number; fee?: number };
  status: OrderStatus; total: number;
  paidAt?: string; deliveredAt?: string; cancelledAt?: string; createdAt: string;
}
export interface CheckoutResult {
  order: Order; txRef: string; paymentLink?: string;
  deliveryFee: number; subtotal: number; total: number;
}
export interface TimelineEntry { status: string; at: string | null }

// ---------- Settings ----------
export interface PublicSettings {
  storeName: string; supportEmail: string; phone: string;
  deliveryFee: number; freeShippingThreshold: number;
  paymentProvider: 'flutterwave' | 'paystack';
}
export interface AdminSettings extends PublicSettings {
  lowStockThreshold: number; vipThreshold: number;
  notifyOnNewOrder: boolean; notifyOnLowStock: boolean;
}

// ---------- Admin ----------
export interface AdminCustomer {
  id: string | null; name: string; email: string; joinedAt: string | null;
  totalSpend: number; ordersCount: number; lastOrderAt: string; vip: boolean;
}
export interface DashboardData {
  metrics: { revenue: number; monthOverMonthPct: number; orders: number;
             products: number; customers: number; lowStockCount: number };
  recentOrders: Order[]; topProducts: Product[];
}
export interface AnalyticsData {
  monthlySales: { year: number; month: number; revenue: number; orders: number }[]; // zero-filled, chronological
  statusDistribution: { status: OrderStatus; count: number }[];
  bestSellersBySales: Product[]; bestSellersByRating: Product[];
}
export interface AdminNotification {
  _id: string; type: 'NEW_ORDER' | 'LOW_STOCK' | 'ORDER_STATUS';
  title: string; payload: Record<string, unknown>;
  readAt?: string; createdAt: string;
}
export interface ContactMessage {
  _id: string; name: string; email: string; subject: string; message: string;
  status: 'NEW' | 'REPLIED' | 'CLOSED'; createdAt: string;
}
```

---

## 4. Feature-by-feature: what to build

### 4.1 Authentication & session — *replaces all of `store/auth.store.ts`*

| # | Endpoint | Auth | Body → Response |
|---|---|---|---|
| 1 | `POST /api/auth/signup` | public | `{name, email, password (≥6), phone?}` → `201 AuthPayload` |
| 2 | `POST /api/auth/signin` | public | `{email, password}` → `AuthPayload` · 401 invalid · 429 after 5/min |
| 3 | `POST /api/auth/refresh` | cookie | *(empty body)* → `AuthPayload` (rotates refresh cookie) · 401 → guest |
| 4 | `POST /api/auth/signout` | cookie | → `{message}` (revokes session family, clears cookies) |
| 5 | `POST /api/auth/demo-login` | **dev only** (404 in prod) | `{role: 'admin' \| 'customer'}` → `AuthPayload` |
| 6 | `GET /api/auth/me` | required | → `{user}` — **slim shape** `{id,name,email,role,phone}` (no addresses!) |
| 7 | `PUT \| PATCH /api/auth/me` | required | any of `{name, phone, avatarUrl, addresses[]}` → `{user}` full |
| 8 | `POST /api/auth/forgot-password` | public | `{email}` → `{message, devResetToken?}` (dev echoes token; prod emails link) |
| 9 | `POST /api/auth/reset-password` | public | `{token, password}` → `{message}` (revokes ALL sessions) · 401 bad/expired token |

Aliases `POST /register` and `POST /login` exist — do **not** build new code on them.

**Build:**

- **App bootstrap** (root layout mount): `POST /api/auth/refresh` →
  - `200` → populate `authStore.user` (full shape incl. addresses), then fire
    `cartStore.fetch()` + `wishlistStore.fetch()` — **the server already merged
    the guest cart into the user cart**; just refetch.
  - `401` → guest mode; still call `cartStore.fetch()` (creates/reads the guest
    cart via `gf_session`).
- **Sign-in/up pages** → on success same as above. Show server message on
  401/409/429. **After sign-in/up, refetch cart + wishlist** (merge happened
  server-side).
- **Demo buttons** ("Continue as demo user/admin") → only render when
  `import.meta.env.DEV` / `NODE_ENV === 'development'`; call `demo-login`.
- **Sign out** → call API, clear stores, reset cart badge, land on `/`.
- **Forgot password page** → email form → success screen ("check your inbox");
  in dev the response contains `devResetToken` so you can deep-link straight to
  the reset page while no SMTP is configured.
- **Reset password page** (`/reset-password?token=...`) → new-password form →
  on success redirect to sign-in (all sessions were revoked server-side).
- **Route guards**: `user` from store; admin area requires
  `user.role === 'admin'` — but treat every `/api/admin/*` 401/403 as ground
  truth and bounce to sign-in.

### 4.2 Profile & address book

| Endpoint | Body → Response |
|---|---|
| `GET /api/auth/me` | slim user |
| `PATCH /api/auth/me` | `{name?, phone?, avatarUrl?}` → full user |
| `POST /api/auth/me/addresses` | `{label?, street, city, state, isDefault?}` → `201 {addresses}` |
| `PUT /api/auth/me/addresses/:addrId` | partial address → `{addresses}` |
| `DELETE /api/auth/me/addresses/:addrId` | → `{addresses}` |

Rules enforced server-side (mirror in UI): max 10 addresses; `street/city/state`
required; exactly one `isDefault` (first address auto-defaults; setting a new
default clears the others; deleting the default promotes the first remaining).

**Build:** account page (profile form + avatar URL field — see note), address
list with add/edit/delete/set-default. Checkout address form should offer
"saved addresses" picker prefilling from the default.

> **Avatar note:** there is no public image-upload endpoint — `/api/admin/uploads`
> is admin-only. `avatarUrl` is a plain URL string; ship an URL input now, or ask
> for a user-upload endpoint before building file drag-drop for avatars.

### 4.3 Public store settings — *replaces `FREE_SHIPPING_THRESHOLD` & footer constants*

`GET /api/settings` → `{data: PublicSettings}` (60 s server cache; safe to fetch
per session, cache it in a `settingsStore`).

Use it for:

- **Free-shipping progress bar** on cart/checkout: `freeShippingThreshold`
  (default ₦50,000) and `deliveryFee` (default ₦3,500 fallback).
- Footer/contact page: `storeName`, `supportEmail`, `phone`.
- Payment button label/behaviour: `paymentProvider`.

Delete the hardcoded `FREE_SHIPPING_THRESHOLD` constant and the `delivery: 3500`
seed value — both now come from settings/rate table.

### 4.4 Categories & catalog — *replaces seed arrays + `CITIES`-style constants*

| Endpoint | Notes |
|---|---|
| `GET /api/categories` | → `{success, data: Category[]}` — `icon` is a **lucide-react icon name** (`leaf`, `tree-pine`, `flower-2`, `flower`); keep a `Record<string, LucideIcon>` map with a fallback |
| `GET /api/categories/:slug` | category detail |
| `GET /api/products` | query: `q, category (ObjectId), minPrice, maxPrice, sunlight, petFriendly=true, premium=1, sort, page, limit (≤100)` → `{success, data: Product[], total, page, pages}` |
| `GET /api/products/:idOrSlug` | product detail (slug preferred for URLs) → `{success, data: Product}`; archived → 404 for non-admins |
| `GET /api/products/:id/reviews?page=&limit=` | → `Paged<Review>` |
| `POST /api/products/:id/reviews` | auth. `{rating 1–5, comment?}` → `201 {data: Review}` — **upsert**: one review per user, re-posting edits |

`sort` values: `price_asc · price_desc · popular · rating · name_asc` (default:
newest). `category` filter takes the category **`_id`**, not the slug — fetch
categories first and filter by selected chip id.

**Build:**

- **Shop/grid page**: search box (debounced), category chips from API, price
  range, premium toggle (`premium=1`), sort select, pagination from
  `{page, pages}`. Sync state to the query string for shareable URLs.
- **Product page** (`/product/[slug]`, replacing `product.detail.tsx`):
  - gallery from `product.images` (flat string array);
  - price + strikethrough `compareAtPrice`; rating stars from
    `rating`/`ratingCount`;
  - stock states: `stock === 0` → "Out of stock" disabled button;
    `stock < lowStockThreshold` (from settings, default 5) → "Only X left";
  - care section from `product.care`; tags incl. `pet-friendly`;
  - **reviews section**: paginated list (`user.name`, `user.avatarUrl`, stars,
    comment, date), submit form for signed-in users (edits own review), delete
    button on own reviews via `DELETE /api/reviews/:reviewId` (admins see it on
    all). After submit/delete, refetch the product to refresh the aggregate.
  - **Delete the `CITIES` delivery constant** — the product-page delivery hint
    comes from `POST /api/checkout/estimate` once a state/city is known.

### 4.5 Cart — *replaces the localStorage cart store*

All cart routes work **logged-in or guest**. Identity = user if authenticated,
else the `gf_session` cookie (created automatically on first cart call).

| Endpoint | Body/Params → Response |
|---|---|
| `GET /api/cart` | → `{data: Cart}` (lazily creates) |
| `POST /api/cart/items` | `{product: productId, qty, size?}` — **adds/increments** → `201 {data: Cart}` |
| `PUT /api/cart/items` | `{product, qty, size?}` — **sets absolute qty** → `{data: Cart}` |
| `PUT /api/cart/items/:id` | `{qty? , size?}` — id = item id **or** product id → `{data: Cart}` |
| `DELETE /api/cart/items/:id` | same id rule → `{data: Cart}` |
| `DELETE /api/cart` | clear all → `{data: Cart}` |

Server guarantees (expose in UI, don't re-implement):

- Line `price`, `stock`, `image`, `name` are **live** from the catalog on every
  response — render what the server returns, not your cached product.
- Over-stock attempts → `409 {msg: 'Only N unit(s) of "…" in stock'}` → toast +
  keep server cart as truth.
- `subtotal` is server-computed. Totals never come from client math.
- **Guest→user merge is automatic** on signup/signin/demo-login/refresh —
  frontend just refetches the cart after any auth change.

**Store shape** (`cart.store.ts` becomes): `{ cart: Cart | null, loading,
fetch(), add(productId, qty, size?), setQty(id, qty), remove(id), clear() }` —
every mutator awaits the API and replaces `cart` with the response. Header badge
= `cart.items.reduce((n,i) => n + i.qty, 0)`.

### 4.6 Wishlist (auth only)

| Endpoint | → Response |
|---|---|
| `GET /api/wishlist` | `{data: WishlistEntry[]}` (populated product; archived entries filtered out) |
| `POST /api/wishlist/:productId` | idempotent add → `201 {data}` or `200 {message: 'Already in wishlist'}` |
| `DELETE /api/wishlist/:productId` | idempotent remove → `{message}` |

Heart buttons call toggle based on local state; 401 → open sign-in prompt
("Sign in to save items"). Wishlist page renders `entry.product`
(image: `product.imageUrl[0]?.url`), with move-to-cart action. Optimistic
toggle + rollback on error is fine (adds/removes are idempotent server-side).

### 4.7 Delivery estimate — *replaces the `CITIES` constant*

`POST /api/checkout/estimate` — public, no session needed.

```json
→ { "state": "Lagos", "city": "Ikeja", "subtotal": 52000 }
← { "data": { "deliveryFee": 0, "etaDays": 2, "freeShippingApplied": true,
              "matchedArea": null, "currency": "NGN" } }
```

Server rules: area-level rate beats state-level; unknown destinations fall back
to flat `settings.deliveryFee`; subtotal ≥ `freeShippingThreshold` → fee 0 and
`freeShippingApplied: true`.

**Build:** call it (debounced) whenever the checkout address `state`/`city`
changes or the cart subtotal crosses the threshold; render fee + `etaDays`
("Arrives in ~2 days") + free-shipping banner. Seeded rates: **Lagos ₦3,500 /
~2d · FCT (Abuja) ₦4,000 / ~3d · Port Harcourt ₦4,500 / ~4d · Ibadan ₦4,000 /
~3d** — everything else falls back to the flat fee (`etaDays: null` → hide the
ETA line). The editable rate table is currently seed/admin-db only; if the
product needs an admin UI for rates, that's a follow-up endpoint request.

### 4.8 Checkout & payment — the money flow

```
Cart page → Checkout page (address + estimate) → POST /api/checkout
   → redirect browser to paymentLink (Flutterwave hosted)
   → Flutterwave redirects back to app /payment/callback?tx_ref=…&status=…
   → poll GET /api/payments/verify/:txRef until successful|failed
   → confirmation page (order is 'paid' by then, via verify or webhook)
```

**Step 1 — Place the order.** `POST /api/checkout` (guests allowed; rate limit
20/min; **requires `Idempotency-Key` header**):

```json
{
  "items": [{ "productId": "…", "qty": 2, "size": "M" }],
  "shippingAddress": { "name": "Ada", "email": "ada@x.com", "phone": "080…",
                       "street": "12 Garden Rd", "city": "Ikeja", "state": "Lagos" },
  "notes": "Leave at the gate"
}
← 201 { order, txRef, paymentLink, deliveryFee, subtotal, total }
```

- Items should come from the **server cart** (`cart.items`), not localStorage.
  On success the server clears the cart — refetch to reset the badge.
- Validation errors: 400 with a precise `message`; out-of-stock at commit time →
  409 (or 404 if the product vanished) → toast + refetch cart.
- `{name,email,phone}` in `shippingAddress` fall back to the signed-in profile,
  but guests must send all three — keep the fields always visible.
- Stock is **reserved atomically** at this point; status `pending_payment`.

**Step 2 — Pay.** `window.location.assign(paymentLink)` (hosted Flutterwave
page; `paymentLink` may be `undefined` if the PSP call is skipped in dev — in
that case route straight to the callback/verify screen with the `txRef`).

**Step 3 — Callback page.** Configure `FLUTTERWAVE_REDIRECT_URL` (server env)
to `https://your-app/payment/callback`. The page:

1. Reads `tx_ref` (and ignores `status` — never trust the query param).
2. Calls `GET /api/payments/verify/:txRef` → `{status, payment}` where status ∈
   `successful | failed | pending`.
3. Polls every ~3 s (max ~30 s) while `pending` — the server-side webhook may
   win the race.
   - Guest payments: verify is open to whoever holds the `tx_ref` ✓
   - Registered payments: requires the signed-in owner (401 otherwise) → if 401,
     nudge to sign in.
4. `successful` → show confirmation (order id, items, ETA, total); **cart is
   already empty**; order confirmation email is sent server-side.
   `failed` → show retry affordance (below). Pending past timeout → "we'll email
   you" copy; the webhook will still settle it.

**Retry / pay-later for unpaid orders** (account → orders → "Pay now"):
`POST /api/payments/initialize { orderId }` (auth, owner only) →
`{txRef, paymentLink}` → redirect again. 409 if already paid/cancelled. Send an
`Idempotency-Key` here too.

**Webhook — nothing to build in the frontend.** Server-side:
`POST /api/payments/webhook/flutterwave` (signature-verified, idempotent,
amount-checked) flips `payment.status: unpaid → paid` and `order.status →
paid`, stamps `paidAt`, emails the customer. Configure this URL + the
`FLW_WEBHOOK_SECRET` hash in the Flutterwave dashboard.

### 4.9 Customer orders

| Endpoint | Auth | → Response |
|---|---|---|
| `GET /api/orders/my?page=&limit=` | user | `Paged<Order>` (newest first) |
| `GET /api/orders/:id` | owner/admin | `{data: Order, timeline: TimelineEntry[]}` |
| `POST /api/orders/:id/cancel` | owner/admin | restocks + voids payment · 409 unless `pending_payment` |
| `POST /api/orders` | user | **legacy**: like checkout but `{deliveryMethod: 'standard'|'express'}` forces ₦1,200/₦2,500 flat fees — prefer `/api/checkout` |

**Build:** orders page (cards: id, date, items count, total, status pill);
order detail with the **timeline** rendered as a stepper
(`pending_payment → paid → shipped → delivered`, or `cancelled`) — entries with
`at: null` happened but have no timestamp (shipped). Show "Pay now" when
`status === 'pending_payment'`, "Cancel order" in the same state, tracking
info from `delivery.{provider,trackingId}`, ETA `delivery.etaDays`.

### 4.10 Newsletter & contact (public forms)

| Endpoint | Body → Response | Limit |
|---|---|---|
| `POST /api/newsletter/subscribe` | `{email}` → `201 {message}` (`200` "already subscribed" — treat both as success) | 10/min |
| `POST /api/newsletter/unsubscribe` | `{email}` → `200` · 404 `That email is not subscribed` | 10/min |
| `POST /api/contact` | `{name, email, subject, message}` → `201 {message, id}` | 5/min |

Footer newsletter form + unsubscribe/undo flow + contact page form. All are
persisted; contact messages surface in the admin inbox (4.12).

---

## 5. Admin panel — *replaces `store/admin.store.ts`*

Every route below requires an admin session (`protect` + `authorize('admin')`);
everything returns 401/403 otherwise — guard client-side by role, but handle
bounces. Pagination params everywhere: `page`, `limit`.

### 5.1 Dashboard — `GET /api/admin/dashboard`

```json
{ "data": {
    "metrics": { "revenue": 812500, "monthOverMonthPct": 12.4,
                 "orders": 143, "products": 57, "customers": 88, "lowStockCount": 4 },
    "recentOrders": [ /* last 5 orders (customerName, items, total, status, createdAt) */ ],
    "topProducts":  [ /* top 5 by sold: name, slug, price, sold, stock, imageUrl, rating */ ]
} }
```

Build: 6 stat cards (revenue excludes cancelled; `monthOverMonthPct` is the MoM
delta — 100 when last month was 0 but this month isn't), recent-orders table,
top-products list, and a low-stock alert card linking to the products page
filtered `stock < lowStockThreshold`.

### 5.2 Analytics — `GET /api/admin/analytics`

`monthlySales` (last 6 calendar months, zero-filled, chronological — feed
straight into a bar/line chart), `statusDistribution` (donut), and two best
-seller tables (by `sold`, by `rating`/`ratingCount`). All revenue excludes
cancelled orders. Replace every localStorage-derived chart.

### 5.3 Orders management — `/api/admin/orders`

| Endpoint | Notes |
|---|---|
| `GET /api/admin/orders?status=&q=&page=&limit=` | `q` matches name/email/phone (and order id if 24-hex) · `status` must be one of the 6 enum values (400 otherwise) → `Paged<Order>` |
| `GET /api/admin/orders/:id` | order detail |
| `PUT` or `PATCH /api/admin/orders/:id/status` | `{status, deliveryProvider?, trackingId?}` — `shipped` auto-sets `delivery.status=in_transit`; `delivered` stamps `deliveredAt` + `delivery.status`; `cancelled` **restocks**; cancelled orders can't be reopened (409). Emits an admin notification on change |
| `DELETE /api/admin/orders/:id` | only `pending_payment` + unpaid (409 otherwise); restocks first |

Build: filter bar (search + status chips), paginated table, detail drawer/page
(items with snapshot prices, customer block, address, payment ref), status
select with a confirm modal — plus tracking fields shown when moving to
`shipped`, and a guarded delete for unpaid pending orders.

### 5.4 Customers — `GET /api/admin/customers?page=&limit=`

Each row: `{id, name, email, joinedAt, totalSpend, ordersCount, lastOrderAt,
vip}`. Registered users group by user id; guests group by email (`id: null`,
`joinedAt: null` — render "Guest"). **VIP badge when `totalSpend >
vipThreshold`** (settings, default ₦20,000). Sorted by spend desc. Note: the
response is `{data, page}` — no total/pages (simple next/prev paging).

### 5.5 Products admin — `/api/admin/products` (same handlers as `/api/plants`)

| Endpoint | Notes |
|---|---|
| `GET /api/admin/products?include_archived=true&q=&page=…` | full list incl. archived (admin context auto-detected) |
| `POST /api/admin/products` | `multipart/form-data` — fields + `images` file[] (max 6). **slug + sku auto-generated**; don't send them |
| `PUT /api/admin/products/:id` | multipart; new `images` **replace** the set (send none to keep). `stock` changes write an InventoryLog automatically. `slug` is immutable — ignored if sent |
| `DELETE /api/admin/products/:id` | soft-delete → `status: archived` (order history keeps snapshots). `?permanent=true` hard-deletes |
| `POST /api/products/:plantId/images` | append images to an existing product (max 5) |
| `POST /api/admin/uploads` | standalone upload (max 5) → `201 {data: {url, publicId} \| [{…}]}` — feed the URL into any URL field |
| `POST /api/admin/uploads/single` | `image` file field, single-URL variant |

Form fields (Mongoose casts string→number/bool from FormData):
`name*`, `description*`, `price* (>0)`, `compareAtPrice`, `category*`
(ObjectId from the categories endpoint), `stock (≥0)`, `care.sunlight*`,
`care.watering*`, `care.temperature*`, `isPremium ("true"/"false")`,
`tags` (repeat the field), `status`. Validation to mirror client-side: name
required, price > 0, stock ≥ 0, ≥1 image. Upload limits: image mime only,
5 MB each — validate before POST and surface 400s.

Build: products table (thumbnail, name, price, stock badge, sold, rating,
status toggle), create/edit drawer with image uploader (preview + progress),
archive vs. permanent-delete confirm, archived filter tab.

### 5.6 Categories admin — `/api/categories` (note: not under `/admin`)

`POST /api/categories` `{name, slug?, description?, icon?}` (slug auto-slugifies;
409 on name/slug clash), `PUT /api/categories/:id`,
`DELETE /api/categories/:id`. Small management table + picker used by the
product form. `icon` expects a lucide icon name.

### 5.7 Store settings — `GET` / `PUT /api/admin/settings` — *wires the `handleSave` button that only toasts today*

Full `AdminSettings` shape (§3). PUT accepts any subset (unknown keys ignored);
type rules enforced: numbers `deliveryFee, freeShippingThreshold,
lowStockThreshold, vipThreshold` (non-negative), booleans `notifyOnNewOrder,
notifyOnLowStock`, strings `storeName, supportEmail, phone`, enum
`paymentProvider ∈ {flutterwave, paystack}` → `{data, message: 'Settings saved'}`.

Build the settings form grouped: Store (name/email/phone), Shipping (fee,
free-shipping threshold), Inventory (low-stock threshold), Customers (VIP
threshold), Payments (provider select), Notifications (two switches). Numbers
arrive as strings from inputs — convert before PUT (422-style message echoed on
400). Changes take effect immediately (cache invalidated) — including the
storefront's own `GET /api/settings` reads.

### 5.8 Notifications bell — `/api/admin/notifications`

`GET` → `{data: AdminNotification[], unreadCount, total, page, pages}`;
`PATCH /:id/read` → `{data}`; `PATCH /read-all` → `{message}`.
Types: `NEW_ORDER` (payload `{orderId, total}`), `LOW_STOCK`
(`{productId, stock}`), `ORDER_STATUS` (`{orderId, status}`).

Build: bell icon with `unreadCount` badge, dropdown list (icon per type, title,
relative time, unread dot), click → mark read + deep-link (`/admin/orders/:id`
or products page). Poll every 30–60 s (cheap) or refetch on route change. Only
new orders/low-stock create notifications when the corresponding settings
switches are on.

### 5.9 Contact inbox — `/api/admin/contact-messages`

`GET ?status=NEW|REPLIED|CLOSED&page=&limit=` → `Paged<ContactMessage>`;
`PATCH /:id` `{status}` → `{data}`. Build: inbox table (from, subject, excerpt,
date, status select), expandable message body.

---

## 6. Zustand store migration map

| Store | Keep | Delete | New internals |
|---|---|---|---|
| `auth.store.ts` | `user`, `isAuthenticated`, loading flags | hardcoded demo users, `persist` of tokens/users to localStorage | `bootstrap()` → refresh; `signin/signup/signout/demoLogin` → API; after any auth success: `cartStore.fetch()` + `wishlistStore.fetch()` |
| `cart.store.ts` | item-count selector, UI drawer state | `persist(localStorage)`, client subtotal math, local merge logic | every action awaits API and **adopts the returned cart**; guest mode is free (cookie) |
| `wishlist.store.ts` | `has(productId)` selector for hearts | localStorage persistence, guest wishlist | fetch/toggle via API; require auth |
| `admin.store.ts` | UI state (filters, modals, active tab) | **all seed data**: products, orders, customers, derived metrics | per-page fetch hooks hitting §5 endpoints; mutations refetch or patch from responses |
| *(new)* `settings.store.ts` | — | `FREE_SHIPPING_THRESHOLD`, `CITIES`, footer constants, `delivery: 3500` | `fetchPublic()` on app boot; expose to cart/checkout/footer |
| *(new)* `catalog.store.ts` or server components | filters ↔ URL sync | seed product array | products/categories/reviews queries |

**Persistence rule going forward:** only persist *UI preferences* (theme, drawer
open, last filters). Never persist tokens, user objects, carts, wishlists,
orders or products — rehydrate those from the API on boot.

---

## 7. Hardcoded things to remove (spec §7 leftovers)

1. `store/auth.store.ts` — the 2 demo users (`demo-login` endpoint replaces them, dev only).
2. `product.detail.tsx` — the `CITIES` delivery constant (use `/checkout/estimate`).
3. `FREE_SHIPPING_THRESHOLD` constant (settings).
4. Seed `delivery: 3500` in order fixtures (server computes fees).
5. `admin.store.ts` seed products/orders/analytics derivations.
6. Settings page `handleSave` that only shows a toast (wire to `PUT /api/admin/settings`).
7. Any client-side price total computation rendered to users (server `subtotal`/`total`).
8. Simulated-latency wrappers around store actions.

---

## 8. Reference data & flow sanity checks

- **Seeded category slugs/icons**: `garden (leaf)`, `interior (tree-pine)`,
  `workspace (flower-2)`, `fashion (flower)` — keep the site's navigation by
  slug, filter by `_id`.
- **Delivery matrix** (§4.7) — verify by POSTing estimates for each state.
- **Order status flow**: `pending_payment → paid → processing → shipped →
  delivered` | `cancelled`. `payment.status` moves `unpaid → paid` **only** via
  verified webhook/verify — never optimistically set it client-side.
- **Demo credentials**: `demo-login` creates `demo-user@gardenfairy.dev` /
  `demo-admin@gardenfairy.dev` on demand (dev env only).
- **Health probe** for your deploy smoke test: `GET /api/health` → `{status:'ok'}`.
- Emails (order confirmation, password reset) send via Resend when
  `RESEND_API_KEY` is set on the server, else log to the server console — don't
  block UI on them.

---

## 9. Suggested implementation order

1. **Foundation** — env var, `lib/api.ts` client, types, error/429 policy, settings store.
2. **Auth spine** — bootstrap/refresh, signin/signup/signout pages, guards, demo buttons (dev).
3. **Catalog read path** — categories chips, products grid (filters/sort/pagination), product page + reviews read.
4. **Cart spine** — server cart store, header badge, guest flow, post-auth refetch.
5. **Checkout spine** — address form + estimate, idempotent place-order, Flutterwave redirect, callback/verify page, confirmation.
6. **Accounts** — profile + addresses + orders/timeline/cancel + wishlist + review submit + password reset pages.
7. **Admin shell** — guard, dashboard, products CRUD + uploads, orders management.
8. **Admin depth** — analytics charts, customers, settings form, notifications bell, contact inbox, categories admin.
9. **Production pass** — CORS origins, `FLUTTERWAVE_REDIRECT_URL` → real callback URL, webhook URL + `FLW_WEBHOOK_SECRET` in the Flutterwave dashboard, `FRONTEND_URL` for reset emails, `RESEND_API_KEY`, HTTPS (secure cookies activate automatically in production).
