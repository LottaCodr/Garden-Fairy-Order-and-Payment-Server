# Garden Fairy — Order & Payment Server

Production REST API for **The Garden Fairy** storefront: real accounts with
session cookies, a DB catalogue, multi-device carts (incl. guest carts),
atomic checkout with stock reservation, Flutterwave payments, delivery-rate
estimates, reviews & wishlist, contact/newsletter, and a complete admin
operations surface (dashboard, analytics, customers, notifications, settings).

Built with Express 5 + Mongoose + TypeScript (scaffolded with
[express-generator-typescript](https://github.com/seanpmaxwell/express-generator-typescript)).

> **IMPORTANT** for demo purposes I had to disable `helmet` in production. In any real world app you should change these 3 lines of code in `src/server.ts`:
> ```ts
> // eslint-disable-next-line n/no-process-env
> if (!process.env.DISABLE_HELMET) {
>   app.use(helmet());
> }
> ```
>
> To just this:
> ```ts
> app.use(helmet());
> ```

## Quick start

```bash
npm install
# configure config/.env.development (MONGO_URI, JWT_SECRET, Flutterwave, Cloudinary…)
npm run dev        # development server
npm run seed       # admin user, categories, plants, delivery rates, store settings
```

The server requires a MongoDB connection (`MONGO_URI`) — it exits on boot if
the database is unreachable.

## Available Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` / `dev:hot` | Run in development mode (`dev` uses swc and **does not** type-check — run `npm run type-check`) |
| `npm test` / `test:hot` | Run all unit tests (add `-- "name"` to run one file) |
| `npm run lint` | Check linting |
| `npm run build` | Production build (lint + tsc, output in `dist/`) |
| `npm start` | Run the production build (build first) |
| `npm run type-check` | Check TypeScript errors |
| `npm run clean-install` | Wipe `node_modules`/`package-lock.json` and reinstall |
| `npm run seed` | Seed the database |

## Environment variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret used to sign access tokens (falls back to `dev_secret`) |
| `JWT_EXPIRES_IN` | | Access-token lifetime (default `7d`; use e.g. `15m` in production with refresh cookies) |
| `FLUTTERWAVE_SECRET_KEY` | ✅ (payments) | Flutterwave secret key |
| `FLUTTERWAVE_REDIRECT_URL` | | URL Flutterwave redirects to after hosted payment |
| `FLW_BASE_URL` | | Flutterwave API base URL (default `https://api.flutterwave.com/v3`) |
| `FLW_WEBHOOK_SECRET` | ✅ (webhook) | Secret hash from the Flutterwave dashboard |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | ✅ (uploads) | Cloudinary credentials for product images |
| `CORS_ORIGIN` | | Comma-separated allowed frontend origins |
| `FRONTEND_URL` | | Used to build password-reset links |
| `RESEND_API_KEY` / `EMAIL_FROM` | | Transactional email via Resend (without a key, mail is logged — dev default) |
| `PORT` / `HOST` | | Server bind settings |

## Auth model

- Sign-up/sign-in issue a short-lived **access token** (JWT) and a long-lived
  **refresh token** (opaque, stored hashed).
- Both are returned in the body **and** set as httpOnly cookies
  (`gf_access`, `gf_refresh`) — the API accepts `Authorization: Bearer …`
  or the cookies.
- `POST /api/auth/refresh` rotates the refresh token (sliding expiration,
  reuse-revokes the whole session family); `POST /api/auth/signout` revokes
  this session and clears cookies.
- Guests get a `gf_session` cookie; their cart merges into the user cart on
  sign-in/sign-up.

## API overview

All routes are under `/api`. 🔒 = Bearer token or session cookie required,
👑 = admin role required.

### Health & meta

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/health` | — | Liveness probe |
| GET | `/api/settings` | — | Public storefront settings (name, support email, delivery fee, free-shipping threshold, payment provider) |

### Auth — `/api/auth`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/auth/signup` (alias `/register`) | — | Create account; sets session cookies; merges guest cart |
| POST | `/api/auth/signin` (alias `/login`) | — | Sign in (rate-limited 5/min); sets cookies; merges guest cart |
| POST | `/api/auth/refresh` | cookie/body | Rotate refresh token → new access + refresh pair |
| POST | `/api/auth/signout` | — | Revoke session, clear cookies |
| POST | `/api/auth/demo-login` | — | **Dev-only** one-click demo login (`{ role: "admin" \| "customer" }`) — 404 elsewhere |
| POST | `/api/auth/forgot-password` | — | Send reset link (rate-limited; never leaks existence; dev returns `devResetToken`) |
| POST | `/api/auth/reset-password` | — | `{ token, password }` — revokes every session |
| GET / PUT / PATCH | `/api/auth/me` | 🔒 | Profile read / update (name, phone, avatarUrl, addresses replace) |
| POST | `/api/auth/me/addresses` | 🔒 | Add address |
| PUT / DELETE | `/api/auth/me/addresses/:addrId` | 🔒 | Update / delete address (default handling automatic) |

### Catalog — `/api/products` (alias `/api/plants`)

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/categories` | — | Categories (sorted by name, includes `icon`) |
| GET | `/api/categories/:slug` | — | One category |
| GET | `/api/products` | — | Search/filter pagination: `q`, `category`, `minPrice`, `maxPrice`, `sunlight`, `petFriendly`, `premium=1`, `sort` (`price_asc`/`price_desc`/`popular`/`name_asc`/`rating`), `page`, `limit`. Archived items hidden (admins: `include_archived=true`) |
| GET | `/api/products/:id` | — | By id **or slug**; includes `images[]`, rating, stock |
| GET | `/api/products/:id/reviews` | — | Review list (paginated) |
| POST | `/api/products/:id/reviews` | 🔒 | Create/update own review (`rating` 1–5, one per user; product rating recomputed) |
| DELETE | `/api/reviews/:id` | 🔒 | Delete review (owner or admin) |

### Cart — `/api/cart` (guests & users; live price/stock in responses)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/cart` | Get or lazily create cart (+ computed `subtotal`) |
| POST | `/api/cart/items` | Add/increment `{ product, qty, size? }` (stock-checked) |
| PUT | `/api/cart/items` | Set absolute quantity `{ product, qty, size? }` |
| PUT | `/api/cart/items/:id` | Update item (by item `_id` **or** product id) |
| DELETE | `/api/cart/items/:id` | Remove item (by item `_id` **or** product id) |
| DELETE | `/api/cart` | Clear cart |

### Wishlist — `/api/wishlist` (🔒)

`GET /` · `POST /:productId` (idempotent add) · `DELETE /:productId`

### Checkout & orders

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/checkout/estimate` | — | `{ state, city?, subtotal? }` → fee + ETA from `DeliveryRate` + free-shipping rule |
| POST | `/api/checkout` | guests OK | Place order: `{ items, shippingAddress { name,email,phone,street?,city,state }, notes? }` — validates stock, reserves atomically, snapshots items, writes `InventoryLog`s, creates `Payment`, initializes Flutterwave, notifies admins, clears cart. `404` unknown product, `409` insufficient stock |
| POST | `/api/orders` | 🔒 | Same pipeline for logged-in users (+ legacy `deliveryMethod: express/standard` flat-fee option) |
| GET | `/api/orders/my` | 🔒 | Own orders (paginated) |
| GET | `/api/orders/:id` | 🔒 owner/👑 | Order detail + status `timeline` |
| POST | `/api/orders/:id/cancel` | 🔒 owner/👑 | Cancel while `pending_payment` — restocks |

### Payments — `/api/payments`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/payments/initialize` | 🔒 | Initialize/repay for an order (`{ orderId }`) — amount from the order, never the client |
| GET | `/api/payments/verify/:txRef` | — | Redirect verification (owner/admin; guests verify via the tx_ref itself). Server-side amount/currency checks |
| POST | `/api/payments/webhook/flutterwave` | signature | Webhook: `verif-hash` (or legacy HMAC `verify-hash`), server-side re-verification, idempotent, marks success/failure, sends confirmation email |

### Admin — `/api/admin/*` (👑 all routes)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET/POST/PUT/DELETE | `/api/admin/products[/:id]` | Catalog CRUD (spec aliases); create auto-generates `slug`+`sku`; DELETE archives (`?permanent=true` hard-deletes); stock changes write `InventoryLog` |
| POST | `/api/admin/uploads` | Multipart image upload → Cloudinary (field `images`, or `image` via `/uploads/single`) |
| GET | `/api/admin/orders` | Search (`q` = id/customer/email/phone), `status` filter, pagination |
| GET | `/api/admin/orders/:id` | One order |
| PUT/PATCH | `/api/admin/orders/:id/status` | Status transition (+ optional `deliveryProvider`, `trackingId`); cancel restocks; emits notification |
| DELETE | `/api/admin/orders/:id` | Guarded delete (unpaid `pending_payment` only) |
| GET | `/api/admin/dashboard` | Revenue (excl. cancelled), MoM delta, orders/products/customers/low-stock counts, recent orders, top products |
| GET | `/api/admin/analytics` | Last-6-months sales buckets (zero-filled), status distribution, best sellers by sales & rating |
| GET | `/api/admin/customers` | Spend-derived list (name, email, joinedAt, totalSpend, ordersCount, `vip` > threshold) |
| GET/PUT | `/api/admin/settings` | Full settings read/write (validated) |
| GET | `/api/admin/notifications` | Bell feed + `unreadCount` |
| PATCH | `/api/admin/notifications/:id/read` | Mark one read |
| PATCH | `/api/admin/notifications/read-all` | Mark all read |
| GET/PATCH | `/api/admin/contact-messages[/:id]` | Contact inbox (status NEW/REPLIED/CLOSED) |

### Contact & newsletter (public, rate-limited)

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/contact` | Persist a contact message (5/min) |
| POST | `/api/newsletter/subscribe` | Upsert/dedupe by email |
| POST | `/api/newsletter/unsubscribe` | Honor unsubscribe (404 when unknown) |

## Business rules (enforced server-side)

- **Delivery**: free when subtotal ≥ `freeShippingThreshold` (default ₦50,000);
  otherwise state/area rates from `DeliveryRate` (seeded: Lagos ₦3,500/2d,
  Abuja(FCT) ₦4,000/3d, Port Harcourt ₦4,500/4d, Ibadan ₦4,000/3d), flat
  `deliveryFee` (₦3,500) fallback — all admin-editable via StoreSetting.
- **Stock** never goes below 0: checkout reserves atomically
  (`stock >= qty` guard), compensates on any failure, restocks on cancel,
  and logs every movement to `InventoryLog`.
- **Payments** flip `unpaid → paid` only via a verified webhook or the
  server-side verify endpoint; amounts are always recomputed server-side.
- **Order flow**: `pending_payment → paid → processing → shipped → delivered`
  (or `cancelled`).
- Low-stock & new-order & status-change events create `AdminNotification`s.

## Security notes

- bcrypt password hashing; httpOnly + SameSite cookies; refresh-token
  rotation with session-family revocation on reuse.
- Every `/api/admin/*` route is behind `protect` + `authorize('admin')`;
  ownership checks guard user data.
- Fixed-window rate limiting on signin/signup/password-reset/contact/
  newsletter/checkout (swap the in-memory bucket for Redis when scaling out).
- Uploads restricted to images ≤ 5 MB, sent to Cloudinary.

## Additional Notes

- If `npm run dev` gives you issues with bcrypt on MacOS you may need to run:
  `npm rebuild bcrypt --build-from-source`.
- The demo `/users` page and `/api/users` routes come from the original
  generator (JSON-file backed) and are unrelated to the store API.
