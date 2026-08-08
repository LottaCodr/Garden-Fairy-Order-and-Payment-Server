# Garden Fairy — Order & Payment Server

REST API for a plant e-commerce store ("Garden Fairy"): catalogue, categories,
cart, orders with stock reservation, and Flutterwave payments (hosted payment
links, webhooks, and redirect verification).

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
cp config/.env.development config/.env.development.local # or edit in place
npm run dev        # http://localhost:PORT (see PORT in your env file)
npm run seed       # seed admin user, categories and sample plants
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
| `npm run seed` | Seed the database with an admin, categories and sample plants |

## Environment variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret used to sign auth tokens (falls back to `dev_secret`) |
| `JWT_EXPIRES_IN` | | Token lifetime (default `7d`) |
| `FLUTTERWAVE_SECRET_KEY` | ✅ (payments) | Flutterwave secret key |
| `FLUTTERWAVE_REDIRECT_URL` | | URL Flutterwave redirects to after hosted payment |
| `FLW_BASE_URL` | | Flutterwave API base URL (default `https://api.flutterwave.com/v3`) |
| `FLW_WEBHOOK_SECRET` | ✅ (webhook) | Secret hash set in the Flutterwave dashboard, used to verify webhooks |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | ✅ (uploads) | Cloudinary credentials for plant images |
| `CORS_ORIGIN` | | Comma-separated allowed frontend origins |
| `PORT` / `HOST` | | Server bind settings |

## API overview

All application routes are under `/api`. Auth is `Authorization: Bearer <token>`.

### Health

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/health` | — | Liveness probe (`status`, `uptime`, `timestamp`) |

### Auth — `/api/auth`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/auth/register` | — | Register. Body: `{ name, email, password (min 8), phone? }` → `{ token, user }` |
| POST | `/api/auth/login` | — | Login. Body: `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/me` | ✅ | Current user profile |
| PUT | `/api/auth/me` | ✅ | Update profile. Body: `{ name?, phone? }` |

### Categories — `/api/categories`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/categories` | — | List categories (sorted by name) |
| GET | `/api/categories/:slug` | — | Get one category by slug |
| POST | `/api/categories` | admin | Create. Body: `{ name, description?, slug? }` (slug auto-generated from name) |
| PUT | `/api/categories/:id` | admin | Update |
| DELETE | `/api/categories/:id` | admin | Delete |

### Plants — `/api/plants`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/plants` | — | Catalogue with search & pagination. Query: `q`, `category`, `minPrice`, `maxPrice`, `sunlight`, `petFriendly=true`, `sort` (`price_asc`, `price_desc`, `popular`, `name_asc`), `page`, `limit` |
| GET | `/api/plants/:id` | — | Plant details (category populated) |
| POST | `/api/plants` | admin | Create (multipart, up to 6 `images` — uploaded to Cloudinary) |
| POST | `/api/plants/:plantId/images` | admin | Append images (multipart, up to 5 `images`) |
| PUT | `/api/plants/:id` | admin | Update (multipart, optional new `images` replace old ones) |
| DELETE | `/api/plants/:id` | admin | Delete |

### Cart — `/api/cart` (all authenticated)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/cart` | Get (or lazily create) the user's cart, products populated |
| POST | `/api/cart/items` | Add item. Body: `{ product, qty, size? }`. Merges same product+size; validates product existence and stock |
| PUT | `/api/cart/items/:id` | Update item qty/size (cart item `_id`) |
| DELETE | `/api/cart/items/:id` | Remove one item |
| DELETE | `/api/cart` | Clear the whole cart |

### Orders — `/api/orders` (all authenticated)

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/orders` | Create order from cart items. Body: `{ items: [{ productId, qty, size? }], shippingAddress: { state, city, phone, street?, name?, email? }, deliveryMethod?: "standard" \| "express" }`. Supports the `Idempotency-Key` header. Atomically reserves stock (409 when insufficient), creates a `Payment`, initializes a Flutterwave hosted payment → `{ order, txRef, paymentLink }`, and clears the cart. If the provider call fails, stock/order/payment are rolled back |
| GET | `/api/orders/my` | The user's orders. Query: `page`, `limit` |
| GET | `/api/orders/:id` | One order (owner or admin) |
| POST | `/api/orders/:id/cancel` | Cancel an order still `pending_payment` (owner or admin) — restores stock and voids the pending payment |

### Payments — `/api/payments`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/payments/initialize` | ✅ | (Re-)initialize payment for an order. Body: `{ orderId }` — the amount is taken from the order, never the client. Rejects paid/cancelled orders. Supports `Idempotency-Key` (replays the pending payment) → `{ txRef, paymentLink }` |
| GET | `/api/payments/verify/:txRef` | ✅ (owner/admin) | Verify a payment after the Flutterwave redirect: confirms the transaction server-side with Flutterwave (status, amount, currency) and syncs `Payment`/`Order` state |
| POST | `/api/payments/webhook/flutterwave` | signature | Flutterwave webhook. Verifies the `verif-hash` dashboard secret (also accepts the legacy HMAC `verify-hash`), confirms the transaction server-side (status + amount + currency, idempotent), marks `successful`/`failed` payments and updates the linked order |

### Admin orders — `/api/admin/orders` (admin only)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/admin/orders` | List all orders. Query: `status`, `page`, `limit` |
| GET | `/api/admin/orders/:id` | One order |
| PUT | `/api/admin/orders/:id/status` | Update status (`pending_payment`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`) plus optional `{ deliveryProvider, trackingId }`. Sets delivery state/timestamps; cancelling restores stock |

## Behavior notes

- **Stock** is reserved at order creation with an atomic
  `findOneAndUpdate({ stock: { $gte: qty } }, { $inc: ... })` (no overselling);
  it is restored when an order is cancelled (user or admin).
- **Order statuses**: `pending_payment → paid → processing → shipped → delivered`,
  plus `cancelled`. Payment statuses: `unpaid`, `paid`, `failed`, `refunded`.
- **Idempotency**: `POST /api/orders` and the webhook honor the
  `Idempotency-Key` header; only successful (2xx) responses are cached and
  replayed with their original status code.
- **Errors**: unknown API routes return JSON 404s; Mongoose validation/cast
  errors map to 400, duplicate keys to 409 — no HTML stack traces leak.
- The demo `/users` page and `/api/users` routes come from the original
  generator (JSON-file backed) and are unrelated to the store API.

## Additional Notes

- If `npm run dev` gives you issues with bcrypt on MacOS you may need to run:
  `npm rebuild bcrypt --build-from-source`.
