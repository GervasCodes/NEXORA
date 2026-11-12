# API Documentation

> **Note 2026-11-11.** Snippe and MalipoPay were removed from the code. The live gateways are AzamPay, Selcom, PawaPay (mobile money and card) and PayPal; references below to the retired two describe the audited state or legacy rows only.

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Scope | HTTP API of `backend/` (Express 5), base path `/api/v1` |
| Method | **Verified** by static reading of `backend/src/app.js` mount table and each `*.routes.js` file (a script resolved prefix + path, and collected guards from per-route arguments and router-level `router.use(...)`). The server was also booted locally and 8 public/protected endpoints probed. |
| Limits | Request/response field contracts were **not** re-derived. Where `docs/openapi.yaml` documents an operation it is the contract of record; otherwise the contract is **Not documented** and must be read from the module's `*.validator.js` / `*.controller.js`. Guards are detected by name patterns (including spread guard arrays and `*Limiter` names) and may omit checks done inside controllers or services. A first parser pass wrongly reported four product-media routes as unguarded; they are guarded via `sellerMediaGuards` and the parser was corrected, which shows the inventory needs human review before being used as a security attestation. |

## 1. Summary

| Metric | Value |
|---|---|
| Route modules mounted | 68 route files incl. 2 stock sub-routers (+14 routes registered directly in `app.js`) |
| Endpoint declarations (method + path) | 575 |
| Present in `docs/openapi.yaml` | 289 (50%) |
| **Missing from OpenAPI** | **286** |
| Endpoints with no detected auth guard | 77 (public by design or guard applied elsewhere; review in section 5) |

## 2. Conventions (Verified)

- **Base URL**: `/api/v1` (local default `http://localhost:5000`, `PORT` env). Versioning is by path prefix only; no deprecation policy is documented.
- **Authentication**: JWT from `Authorization: Bearer <token>` **or** the `nexora_session` cookie (`backend/src/middleware/auth.middleware.js`). Each authenticated request re-reads account status from the database (inactive or suspended accounts are rejected; suspended returns 403 `ACCOUNT_SUSPENDED`) and compares the token's `tv` claim to the stored `token_version`, so a version bump revokes all sessions.
- **Authorization**: `authorize("buyer"|"seller"|"admin"|"delivery_agent")`; additional guards `requireApprovedSeller`, `requireApprovedDeliveryAgent`, `requireSuperAdmin`, `requireFeature(...)`, `requireSubscriptionTier(...)`. Role usage counts in code: seller 106, admin 74, buyer 60, delivery_agent 11.
- **CSRF** (`csrf.middleware.js`): for non-safe methods, when a `nexora_session` cookie is present and no Bearer header is sent, the `X-CSRF-Token` header must equal the `nexora_csrf` cookie (timing-safe compare), else 403 `CSRF_TOKEN_INVALID`. Exempt: register, login, google sign-in (2), login OTP verify/resend, forgot/reset password, logout.
- **Rate limits** (`rateLimit.middleware.js`): all `/api/` traffic 600 requests / 15 min / IP (`apiLimiter`); `authLimiter` 20 / 15 min on auth and password-OTP routes; username availability 30 / min. Limits are per IP (`trust proxy` hops from `TRUST_PROXY_HOPS`, default 1). Per-user quotas are not implemented at this layer.
- **Errors**: JSON `{ success:false, message, code? }`; messages localised `en`/`sw` from `?lang=`, `Accept-Language`, or the user's saved language. Successful responses use `{ success:true, data, pagination? }` (observed on `/store-types`, `/products`).
- **Webhooks** use raw request bodies for signature verification (Snippe, MalipoPay Card, PayPal, WhatsApp). Mobile-money webhooks verify a shared-secret header (see `docs/WEBHOOK_VALIDATION.md`; not re-verified here).
- **Locally probed** (2026-10-29, booted against the migrated DB): `/health` 200, `/` 200, `/api/v1/store-types` 200, `/api/v1/categories` 200, `/api/v1/products` 200 (paginated), `/api/v1/status` 200, `/api/v1/me` 401, `/api/v1/admin/users` 401.

## 3. OpenAPI specification status (defects)

| ID | Defect | Evidence |
|---|---|---|
| API-001 | The spec is **inconsistent about the base path**. 269 of its 305 paths start with `/api/v1` while the `servers` URLs also end in `/api/v1`, so tools combining them produce `/api/v1/api/v1/...`; the other 36 paths (all `/seller/stock/*`) omit the prefix, so they resolve correctly. | `openapi.yaml` lines 13-17, 99; path census |
| API-002 | Spec states it is generated "as of Phase RF6 (migration 082)"; repository has 160 migrations. | `openapi.yaml` info.description |
| API-003 | 286 of 575 endpoint declarations are absent from the spec (column "OpenAPI" below). | this document |
| API-004 | 16 spec operations have no matching route in code, all in retired or removed features: admin monetization / Billing Control Center and schedule (5), `GET /settings/monetization-status` (1; see API-006), department sponsorship (6), seller verification fee (4). | static diff with normalised paths |
| API-005 | The production server URL in the spec is a placeholder host (`api.nexora.example.com`). The real domain appears elsewhere in the repo (`nexoramarketplace.online`, API on `api.`). | `openapi.yaml` servers; `docs/FRONTEND_CSP.md` |
| API-006 | **Unmounted router.** `backend/src/modules/settings/settings.routes.js` (public `GET /settings/monetization-status`) is never required by `app.js`; a live probe returns 404. The frontend component `BillingStatusBanner.jsx` calls it. | probe 2026-10-29; grep |

Recommendation (Proposed): fix API-001 and API-006 first, then regenerate the spec from code or add a CI check comparing route table to spec.

## 4. Endpoint inventory

Legend: **Guards** = `auth` (valid JWT required), `role:X`, other middleware by name; blank = no guard detected. **OpenAPI** = operation present in `docs/openapi.yaml`.

### account

Source: `backend/src/modules/account/account.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| DELETE | `/api/v1/account` | auth | Y |
| GET | `/api/v1/account` | auth | Y |
| PUT | `/api/v1/account/password` | auth | Y |
| POST | `/api/v1/account/password/request-otp` | auth, authLimiter | Y |
| POST | `/api/v1/account/password/verify-otp` | auth, authLimiter | Y |
| DELETE | `/api/v1/account/photo` | auth | N |
| POST | `/api/v1/account/photo` | auth | N |
| PUT | `/api/v1/account/profile` | auth | Y |
| PUT | `/api/v1/account/settings` | auth | Y |
| PUT | `/api/v1/account/username` | auth | N |

### accountVerification

Source: `backend/src/modules/accountVerification/accountVerification.routes.js` (and sibling route files)

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/admin/account-verifications` | auth, role:admin | Y |
| GET | `/api/v1/admin/account-verifications/:id` | auth, role:admin | Y |
| PUT | `/api/v1/admin/account-verifications/:id/approve` | auth, role:admin | Y |
| PUT | `/api/v1/admin/account-verifications/:id/reject` | auth, role:admin | Y |
| GET | `/api/v1/admin/account-verifications/business-requests` | auth, role:admin | N |
| GET | `/api/v1/admin/account-verifications/business-requests/:requestId` | auth, role:admin | N |
| PUT | `/api/v1/admin/account-verifications/business-requests/:requestId/approve` | auth, role:admin | N |
| PUT | `/api/v1/admin/account-verifications/business-requests/:requestId/reject` | auth, role:admin | N |
| DELETE | `/api/v1/admin/account-verifications/documents/:docId/flag` | auth, role:admin | N |
| PUT | `/api/v1/admin/account-verifications/documents/:docId/flag` | auth, role:admin | N |
| GET | `/api/v1/seller/business-verification` | auth, role:seller, requireApprovedSeller | N |
| POST | `/api/v1/seller/business-verification` | auth, role:seller, requireApprovedSeller | N |

### admin

Source: `backend/src/modules/admin/admin.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/admin/admins` | auth, role:admin, requireSuperAdmin | Y |
| POST | `/api/v1/admin/admins` | auth, role:admin, requireSuperAdmin | Y |
| DELETE | `/api/v1/admin/admins/:id` | auth, role:admin, requireSuperAdmin | Y |
| PUT | `/api/v1/admin/admins/:id/permissions` | auth, role:admin, requireSuperAdmin | Y |
| GET | `/api/v1/admin/analytics` | auth, role:admin | Y |
| GET | `/api/v1/admin/analytics/advanced` | auth, role:admin | Y |
| GET | `/api/v1/admin/analytics/advanced/export` | auth, role:admin | Y |
| GET | `/api/v1/admin/analytics/business` | auth, role:admin | Y |
| GET | `/api/v1/admin/analytics/business/export` | auth, role:admin | Y |
| GET | `/api/v1/admin/analytics/services` | auth, role:admin | Y |
| GET | `/api/v1/admin/audit-logs` | auth, role:admin | Y |
| PUT | `/api/v1/admin/bookings/:id/release-escrow` | auth, role:admin | Y |
| GET | `/api/v1/admin/dashboard` | auth, role:admin | Y |
| GET | `/api/v1/admin/deleted-users` | auth, role:admin | Y |
| DELETE | `/api/v1/admin/deleted-users/:id` | auth, role:admin, requireSuperAdmin | Y |
| GET | `/api/v1/admin/delivery-agents` | auth, role:admin | N |
| GET | `/api/v1/admin/dispatch` | auth, role:admin | Y |
| PUT | `/api/v1/admin/dispatch/:id/assign` | auth, role:admin | N |
| GET | `/api/v1/admin/dispatch/coverage-heatmap` | auth, role:admin | N |
| GET | `/api/v1/admin/dispatch/sellers-without-pin` | auth, role:admin | N |
| GET | `/api/v1/admin/featured-store-campaigns` | auth, role:admin | Y |
| GET | `/api/v1/admin/fraud-dashboard` | auth, role:admin | N |
| GET | `/api/v1/admin/fraud-flags` | auth, role:admin | Y |
| PUT | `/api/v1/admin/fraud-flags/:id/resolve` | auth, role:admin | Y |
| GET | `/api/v1/admin/orders` | auth, role:admin | Y |
| PUT | `/api/v1/admin/orders/:id/release-escrow` | auth, role:admin | Y |
| GET | `/api/v1/admin/products` | auth, role:admin | Y |
| PUT | `/api/v1/admin/products/:id/activate` | auth, role:admin | Y |
| PUT | `/api/v1/admin/products/:id/deactivate` | auth, role:admin | Y |
| PUT | `/api/v1/admin/products/:id/sponsor` | auth, role:admin | Y |
| PUT | `/api/v1/admin/products/:id/unsponsor` | auth, role:admin | Y |
| PUT | `/api/v1/admin/products/bulk-status` | auth, role:admin | Y |
| GET | `/api/v1/admin/queue-counts` | auth, role:admin | N |
| GET | `/api/v1/admin/refunds` | auth, role:admin | Y |
| GET | `/api/v1/admin/refunds/:id` | auth, role:admin | Y |
| POST | `/api/v1/admin/refunds/:id/retry` | auth, role:admin | Y |
| GET | `/api/v1/admin/sellers` | auth, role:admin | Y |
| POST | `/api/v1/admin/sellers/:id/extend-trial` | auth, role:admin | N |
| PUT | `/api/v1/admin/sellers/:id/unverify` | auth, role:admin | Y |
| PUT | `/api/v1/admin/sellers/:id/verify` | auth, role:admin | Y |
| GET | `/api/v1/admin/services` | auth, role:admin | Y |
| PUT | `/api/v1/admin/services/:id/activate` | auth, role:admin | Y |
| PUT | `/api/v1/admin/services/:id/deactivate` | auth, role:admin | Y |
| PUT | `/api/v1/admin/services/bulk-status` | auth, role:admin | Y |
| GET | `/api/v1/admin/settings` | auth, role:admin | Y |
| PUT | `/api/v1/admin/settings` | auth, role:admin | Y |
| GET | `/api/v1/admin/settings/:key/history` | auth, role:admin | N |
| GET | `/api/v1/admin/sponsorship-campaigns` | auth, role:admin | Y |
| GET | `/api/v1/admin/subscription-plans` | auth, role:admin | Y |
| POST | `/api/v1/admin/subscription-plans` | auth, role:admin, requireSuperAdmin | Y |
| PUT | `/api/v1/admin/subscription-plans/:id` | auth, role:admin, requireSuperAdmin | Y |
| GET | `/api/v1/admin/subscriptions` | auth, role:admin | Y |
| GET | `/api/v1/admin/users` | auth, role:admin | Y |
| DELETE | `/api/v1/admin/users/:id` | auth, role:admin, requireSuperAdmin | Y |
| PUT | `/api/v1/admin/users/:id/suspend` | auth, role:admin | Y |
| PUT | `/api/v1/admin/users/:id/unsuspend` | auth, role:admin | Y |
| GET | `/api/v1/admin/users/map` | auth, role:admin | N |
| GET | `/api/v1/admin/wallets/negative-balance` | auth, role:admin | N |
| GET | `/api/v1/admin/withdrawals` | auth, role:admin | Y |
| PUT | `/api/v1/admin/withdrawals/:id/approve` | auth, role:admin | Y |
| GET | `/api/v1/admin/withdrawals/:id/context` | auth, role:admin | N |
| PUT | `/api/v1/admin/withdrawals/:id/paid` | auth, role:admin | Y |
| GET | `/api/v1/admin/withdrawals/:id/payout-details` | auth, role:admin | N |
| PUT | `/api/v1/admin/withdrawals/:id/reject` | auth, role:admin | Y |

### adminNotification

Source: `backend/src/modules/adminNotification/adminNotification.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/admin/notifications` | auth, role:admin | Y |
| PUT | `/api/v1/admin/notifications/:id/read` | auth, role:admin | Y |
| PUT | `/api/v1/admin/notifications/read-all` | auth, role:admin | Y |
| GET | `/api/v1/admin/notifications/unread-count` | auth, role:admin | Y |

### affiliate

Source: `backend/src/modules/affiliate/affiliate.admin.routes.js` (and sibling route files)

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/admin/affiliates/accounts` | auth, role:admin | N |
| POST | `/api/v1/admin/affiliates/accounts/:userId/approve` | auth, role:admin | N |
| POST | `/api/v1/admin/affiliates/accounts/:userId/reject` | auth, role:admin | N |
| GET | `/api/v1/admin/affiliates/conversions` | auth, role:admin | N |
| GET | `/api/v1/admin/affiliates/payouts` | auth, role:admin | N |
| POST | `/api/v1/admin/affiliates/payouts/:id/paid` | auth, role:admin | N |
| POST | `/api/v1/admin/affiliates/payouts/:id/reject` | auth, role:admin | N |
| POST | `/api/v1/affiliate/apply` | auth, role:buyer | N |
| POST | `/api/v1/affiliate/click` |  | N |
| GET | `/api/v1/affiliate/me` | auth, role:buyer | N |
| POST | `/api/v1/affiliate/payouts` | auth, role:buyer | N |

### ai

Source: `backend/src/modules/ai/ai.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/ai/admin/analytics/forecast-explain` | auth, role:admin, aiLimiter | Y |
| POST | `/api/v1/ai/admin/disputes/:id/suggest-resolution` | auth, role:admin, aiLimiter | Y |
| GET | `/api/v1/ai/admin/disputes/:id/summary` | auth, role:admin, aiLimiter | Y |
| GET | `/api/v1/ai/admin/fraud-flags/explain` | auth, role:admin, aiLimiter | Y |
| GET | `/api/v1/ai/admin/personalization/explain` | auth, role:admin, aiLimiter | Y |
| POST | `/api/v1/ai/bookings/:id/explain` | auth, aiLimiter | N |
| POST | `/api/v1/ai/chat` | aiLimiter | Y |
| GET | `/api/v1/ai/delivery/route` | auth, role:delivery_agent, requireApprovedDeliveryAgent, aiLimiter | Y |
| POST | `/api/v1/ai/orders/:id/explain` | auth, role:buyer, aiLimiter | Y |
| POST | `/api/v1/ai/products/:slug/explain` | aiLimiter | N |
| GET | `/api/v1/ai/recommendations/:context/explain` | aiLimiter | Y |
| POST | `/api/v1/ai/search/parse` | aiLimiter | Y |
| GET | `/api/v1/ai/seller/analytics/summary` | auth, role:seller, requireApprovedSeller, aiLimiter | Y |
| GET | `/api/v1/ai/seller/demand-forecast` | auth, role:seller, requireApprovedSeller, aiLimiter | N |
| POST | `/api/v1/ai/seller/listing-draft` | auth, role:seller, requireApprovedSeller, aiLimiter | Y |
| POST | `/api/v1/ai/seller/marketing-copy` | auth, role:seller, requireApprovedSeller, aiLimiter | Y |
| GET | `/api/v1/ai/seller/services/:serviceId/availability-suggestion` | auth, role:seller, requireApprovedSeller, aiLimiter | Y |

### app.js

Source: `backend/src/app.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/` |  | N |
| GET | `/api/v1/me` | auth | N |
| POST | `/api/v1/payments/webhooks/malipopay-card` | raw body, provider signature | N |
| POST | `/api/v1/payments/webhooks/paypal` | raw body, PayPal verify-webhook-signature | N |
| POST | `/api/v1/payments/webhooks/snippe` | raw body, provider signature (Snippe) | N |
| POST | `/api/v1/webhooks/brevo` | shared-secret header (BREVO_WEBHOOK_SECRET) | N |
| GET | `/api/v1/whatsapp/webhook` | Meta verify challenge | N |
| POST | `/api/v1/whatsapp/webhook` | raw body, X-Hub-Signature-256 | N |
| GET | `/db-test` | auth, role:admin | N |
| GET | `/health` |  | N |
| GET | `/ping` |  | N |
| GET | `/seo/prerender-shells.json` |  | N |
| GET | `/sitemap-{n}.xml` |  | N |
| GET | `/sitemap.xml` |  | N |

### auth

Source: `backend/src/modules/auth/auth.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/auth/csrf` | auth | N |
| POST | `/api/v1/auth/forgot-password` | authLimiter | Y |
| POST | `/api/v1/auth/google` | authLimiter | N |
| POST | `/api/v1/auth/google/complete` | authLimiter | N |
| POST | `/api/v1/auth/login` | authLimiter | Y |
| POST | `/api/v1/auth/login/resend-otp` | authLimiter | Y |
| POST | `/api/v1/auth/login/verify-otp` | authLimiter | Y |
| POST | `/api/v1/auth/logout` |  | N |
| GET | `/api/v1/auth/me` | auth | N |
| POST | `/api/v1/auth/register` | authLimiter | Y |
| POST | `/api/v1/auth/reset-password` | authLimiter | Y |
| GET | `/api/v1/auth/username-available` | usernameCheckLimiter | N |

### availability

Source: `backend/src/modules/availability/availability.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/services/:serviceId/availability` |  | Y |
| PUT | `/api/v1/services/:serviceId/availability` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |

### booking

Source: `backend/src/modules/booking/booking.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/bookings` | auth, role:buyer, maintenanceCheck | Y |
| GET | `/api/v1/bookings/:id` | auth | Y |
| PUT | `/api/v1/bookings/:id/cancel` | auth | Y |
| PUT | `/api/v1/bookings/:id/confirm` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/bookings/:id/reject` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/bookings/:id/reschedule` | auth, role:buyer | N |
| GET | `/api/v1/bookings/mine` | auth, role:buyer, maintenanceCheck | Y |
| GET | `/api/v1/bookings/provider/mine` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |

### broadcast

Source: `backend/src/modules/broadcast/broadcast.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/admin/broadcasts` | auth, role:admin | N |
| POST | `/api/v1/admin/broadcasts` | auth, role:admin | N |
| DELETE | `/api/v1/admin/broadcasts/:id` | auth, role:admin | N |
| POST | `/api/v1/admin/broadcasts/:id/resend` | auth, role:admin | N |
| POST | `/api/v1/admin/broadcasts/preview` | auth, role:admin | N |

### business

Source: `backend/src/modules/business/business.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| PUT | `/api/v1/business/admin/:userId/verify` | auth, role:admin | N |
| GET | `/api/v1/business/admin/pending` | auth, role:admin | N |
| POST | `/api/v1/business/apply` | auth, role:buyer | N |
| GET | `/api/v1/business/me` | auth, role:buyer | N |
| GET | `/api/v1/business/products/:productId/tiers` |  | N |
| PUT | `/api/v1/business/products/:productId/tiers` | auth, role:seller | N |

### businessTools

Source: `backend/src/modules/businessTools/businessTools.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/business-tools/convert` | auth, role:seller | N |

### buyerAddress

Source: `backend/src/modules/buyerAddress/buyerAddress.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/addresses` | auth, role:buyer | N |
| POST | `/api/v1/addresses` | auth, role:buyer | N |
| DELETE | `/api/v1/addresses/:id` | auth, role:buyer | N |
| PUT | `/api/v1/addresses/:id` | auth, role:buyer | N |
| PUT | `/api/v1/addresses/:id/default` | auth, role:buyer | N |

### buyerWallet

Source: `backend/src/modules/buyerWallet/buyerWallet.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/buyer-wallet/me` | auth, role:buyer | N |

### cart

Source: `backend/src/modules/cart/cart.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| DELETE | `/api/v1/cart` | auth, role:buyer | Y |
| GET | `/api/v1/cart` | auth, role:buyer | Y |
| POST | `/api/v1/cart` | auth, role:buyer | Y |
| DELETE | `/api/v1/cart/:productId{/:variantId}` | auth, role:buyer | Y |
| PUT | `/api/v1/cart/:productId{/:variantId}` | auth, role:buyer | Y |

### category

Source: `backend/src/modules/category/category.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/categories` |  | Y |
| POST | `/api/v1/categories` | auth, role:admin | Y |
| PUT | `/api/v1/categories/:id` | auth, role:admin | Y |
| PUT | `/api/v1/categories/:id/activate` | auth, role:admin | Y |
| PUT | `/api/v1/categories/:id/cancel-scheduled-maintenance` | maintenance, auth, role:admin | Y |
| POST | `/api/v1/categories/:id/cover` | auth, role:admin | Y |
| PUT | `/api/v1/categories/:id/deactivate` | auth, role:admin | Y |
| PUT | `/api/v1/categories/:id/maintenance` | maintenance, auth, role:admin | Y |
| PUT | `/api/v1/categories/:id/schedule-maintenance` | maintenance, auth, role:admin | Y |
| GET | `/api/v1/categories/admin/all` | auth, role:admin | Y |
| GET | `/api/v1/categories/departments` |  | Y |
| GET | `/api/v1/categories/departments/:slug` |  | Y |
| GET | `/api/v1/categories/home-highlights` |  | N |
| GET | `/api/v1/categories/services-tile` |  | N |
| GET | `/api/v1/categories/trust-stats` |  | N |

### chat

Source: `backend/src/modules/chat/chat.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/chat/conversations` | auth, maintenanceCheck | Y |
| POST | `/api/v1/chat/conversations` | auth, maintenanceCheck | Y |
| DELETE | `/api/v1/chat/conversations/:id` | auth, maintenanceCheck | Y |
| DELETE | `/api/v1/chat/conversations/:id/archive` | auth, maintenanceCheck | N |
| PUT | `/api/v1/chat/conversations/:id/archive` | auth, maintenanceCheck | N |
| POST | `/api/v1/chat/conversations/:id/attachments` | auth, maintenanceCheck | Y |
| POST | `/api/v1/chat/conversations/:id/clear` | auth, maintenanceCheck | Y |
| GET | `/api/v1/chat/conversations/:id/messages` | auth, maintenanceCheck | Y |
| POST | `/api/v1/chat/conversations/:id/messages` | auth, maintenanceCheck | Y |
| DELETE | `/api/v1/chat/conversations/:id/messages/:messageId` | auth, maintenanceCheck | Y |
| POST | `/api/v1/chat/conversations/:id/messages/:messageId/reactions` | auth, maintenanceCheck | Y |
| DELETE | `/api/v1/chat/conversations/:id/messages/:messageId/reactions/:emoji` | auth, maintenanceCheck | Y |
| DELETE | `/api/v1/chat/conversations/:id/mute` | auth, maintenanceCheck | N |
| PUT | `/api/v1/chat/conversations/:id/mute` | auth, maintenanceCheck | N |
| PUT | `/api/v1/chat/conversations/:id/read` | auth, maintenanceCheck | Y |
| GET | `/api/v1/chat/conversations/:id/search` | auth, maintenanceCheck | Y |
| GET | `/api/v1/chat/conversations/search` | auth, maintenanceCheck | N |
| GET | `/api/v1/chat/unread-count` | auth, maintenanceCheck | Y |

### content

Source: `backend/src/modules/content/content.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/content` |  | N |
| GET | `/api/v1/content/:slug` |  | N |
| GET | `/api/v1/content/admin` | auth, role:admin | N |
| POST | `/api/v1/content/admin` | auth, role:admin | N |
| GET | `/api/v1/content/admin/:id` | auth, role:admin | N |
| PUT | `/api/v1/content/admin/:id` | auth, role:admin | N |
| PUT | `/api/v1/content/admin/:id/status` | auth, role:admin | N |
| GET | `/api/v1/content/categories` |  | N |

### coupon

Source: `backend/src/modules/coupon/coupon.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/coupons/validate` | auth, role:buyer | N |

### dataReset

Source: `backend/src/modules/dataReset/dataReset.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/admin/data-reset/platform` | auth, role:admin, requireSuperAdmin | N |
| POST | `/api/v1/admin/data-reset/platform/approvals` | auth, role:admin, requireSuperAdmin | N |
| POST | `/api/v1/admin/data-reset/platform/approvals/:approvalId/approve` | auth, role:admin, requireSuperAdmin | N |
| GET | `/api/v1/admin/data-reset/platform/preview` | auth, role:admin, requireSuperAdmin | N |
| POST | `/api/v1/admin/data-reset/seller/:sellerId` | auth, role:admin | N |
| GET | `/api/v1/admin/data-reset/seller/:sellerId/preview` | auth, role:admin | N |

### delivery

Source: `backend/src/modules/delivery/deliveryRates.routes.js` (and sibling route files)

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/admin/delivery-rates` | auth, role:admin | N |
| POST | `/api/v1/admin/delivery-rates/cards` | auth, role:admin | N |
| POST | `/api/v1/admin/delivery-rates/eta` | auth, role:admin | N |
| DELETE | `/api/v1/admin/delivery-rates/eta/:id` | auth, role:admin | N |
| PUT | `/api/v1/admin/delivery-rates/eta/:id` | auth, role:admin | N |
| POST | `/api/v1/admin/delivery-rates/fuel` | auth, role:admin | N |
| GET | `/api/v1/admin/delivery-rates/preview` | auth, role:admin | N |
| PUT | `/api/v1/admin/delivery-rates/settings` | auth, role:admin | N |
| GET | `/api/v1/delivery/:orderId` | auth | Y |
| POST | `/api/v1/delivery/:orderId/claim` | auth, role:delivery_agent, requireApprovedDeliveryAgent | Y |
| POST | `/api/v1/delivery/:orderId/pickup-photo` | auth, role:delivery_agent, requireApprovedDeliveryAgent | N |
| POST | `/api/v1/delivery/:orderId/rating` | auth, role:buyer | Y |
| PUT | `/api/v1/delivery/:orderId/status` | auth, role:delivery_agent, requireApprovedDeliveryAgent | Y |
| GET | `/api/v1/delivery/available` | auth, role:delivery_agent, requireApprovedDeliveryAgent | Y |
| GET | `/api/v1/delivery/my/list` | auth, role:delivery_agent, requireApprovedDeliveryAgent | Y |
| GET | `/api/v1/delivery/my/rating-summary` | auth, role:delivery_agent, requireApprovedDeliveryAgent | Y |
| GET | `/api/v1/delivery/online` | auth, role:delivery_agent, requireApprovedDeliveryAgent | Y |
| PUT | `/api/v1/delivery/online` | auth, role:delivery_agent, requireApprovedDeliveryAgent | Y |

### deliveryBusiness

Source: `backend/src/modules/deliveryBusiness/deliveryBusiness.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/delivery-business` | auth, role:delivery_agent, requireApprovedDeliveryAgent | N |
| GET | `/api/v1/delivery-business/jobs` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |
| POST | `/api/v1/delivery-business/jobs` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |
| PUT | `/api/v1/delivery-business/jobs/:jobId/assign` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |
| PUT | `/api/v1/delivery-business/jobs/:jobId/fee` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |
| PUT | `/api/v1/delivery-business/jobs/:jobId/status` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |
| GET | `/api/v1/delivery-business/me` | auth, role:delivery_agent, requireApprovedDeliveryAgent | N |
| GET | `/api/v1/delivery-business/overview` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |
| GET | `/api/v1/delivery-business/roster` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |
| POST | `/api/v1/delivery-business/roster` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |
| DELETE | `/api/v1/delivery-business/roster/:agentId` | auth, role:delivery_agent, requireApprovedDeliveryAgent, requireDeliveryBusiness | N |

### dispute

Source: `backend/src/modules/dispute/dispute.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/disputes` | auth, role:buyer, maintenanceCheck | Y |
| POST | `/api/v1/disputes` | auth, role:buyer, maintenanceCheck | Y |
| GET | `/api/v1/disputes/:id` | auth | Y |
| POST | `/api/v1/disputes/:id/evidence` | auth | Y |
| POST | `/api/v1/disputes/:id/messages` | auth | Y |
| PUT | `/api/v1/disputes/:id/withdraw` | auth, role:buyer | Y |
| GET | `/api/v1/disputes/admin` | auth, role:admin | Y |
| PUT | `/api/v1/disputes/admin/:id/reject` | auth, role:admin | Y |
| PUT | `/api/v1/disputes/admin/:id/resolve` | auth, role:admin | Y |
| PUT | `/api/v1/disputes/admin/:id/review` | auth, role:admin | Y |
| GET | `/api/v1/disputes/seller` | auth, role:seller | Y |

### documentAccess

Source: `backend/src/modules/documentAccess/documentAccess.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/admin/documents/:kind/:id/url` | auth, role:admin | N |

### earnings

Source: `backend/src/modules/earnings/earnings.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/earnings/me` | auth, role:delivery_agent | Y |

### efd

Source: `backend/src/modules/efd/efd.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| PUT | `/api/v1/efd/admin/:userId/verify` | auth, role:admin | N |
| GET | `/api/v1/efd/admin/needs-attention` | auth, role:admin | N |
| GET | `/api/v1/efd/admin/pending` | auth, role:admin | N |
| POST | `/api/v1/efd/admin/receipts/:id/retry` | auth, role:admin | N |
| GET | `/api/v1/efd/order/:orderId` | auth | N |
| GET | `/api/v1/efd/seller/receipts` | auth, role:seller | N |
| GET | `/api/v1/efd/seller/tax-info` | auth, role:seller | N |
| PUT | `/api/v1/efd/seller/tax-info` | auth, role:seller | N |

### featuredStore

Source: `backend/src/modules/featuredStore/featuredStore.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/seller/featured-store/campaigns` | auth, role:seller, requireApprovedSeller | Y |
| POST | `/api/v1/seller/featured-store/campaigns` | auth, role:seller, requireApprovedSeller | Y |
| PUT | `/api/v1/seller/featured-store/campaigns/:id/cancel` | auth, role:seller, requireApprovedSeller | Y |
| GET | `/api/v1/seller/featured-store/categories` | auth, role:seller, requireApprovedSeller | Y |
| GET | `/api/v1/seller/featured-store/pricing` | auth, role:seller, requireApprovedSeller | Y |

### groupBuy

Source: `backend/src/modules/groupBuy/groupBuy.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/group-buys` |  | N |
| GET | `/api/v1/group-buys/:id` |  | N |
| POST | `/api/v1/group-buys/:id/claim` | auth, role:buyer | N |
| POST | `/api/v1/group-buys/:id/join` | auth, role:buyer | N |
| GET | `/api/v1/group-buys/buyer/mine` | auth, role:buyer | N |
| POST | `/api/v1/group-buys/seller` | auth, role:seller | N |
| GET | `/api/v1/group-buys/seller/mine` | auth, role:seller | N |

### kyc

Source: `backend/src/modules/kyc/kyc.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/kyc/admin` | auth, role:admin | N |
| PUT | `/api/v1/kyc/admin/:id/approve` | auth, role:admin | N |
| PUT | `/api/v1/kyc/admin/:id/reject` | auth, role:admin | N |
| GET | `/api/v1/kyc/me` | auth | N |
| POST | `/api/v1/kyc/upgrade` | auth | N |

### liveSelling

Source: `backend/src/modules/liveSelling/liveSelling.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/live-selling` |  | N |
| POST | `/api/v1/live-selling` | auth, role:seller | N |
| DELETE | `/api/v1/live-selling/:id/remind` | auth, role:buyer | N |
| GET | `/api/v1/live-selling/:id/remind` | auth, role:buyer | N |
| POST | `/api/v1/live-selling/:id/remind` | auth, role:buyer | N |
| PUT | `/api/v1/live-selling/:id/status` | auth, role:seller | N |
| GET | `/api/v1/live-selling/mine` | auth, role:seller | N |

### maintenance

Source: `backend/src/modules/maintenance/maintenance.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| PUT | `/api/v1/admin/maintenance/modules/:key/activate` | auth, role:admin, maintenanceController | Y |
| PUT | `/api/v1/admin/maintenance/modules/:key/deactivate` | auth, role:admin, maintenanceController | Y |
| GET | `/api/v1/admin/maintenance/overview` | auth, role:admin, maintenanceController | Y |

### notification

Source: `backend/src/modules/notification/notification.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/notifications` | auth | Y |
| DELETE | `/api/v1/notifications/:id` | auth | Y |
| PUT | `/api/v1/notifications/:id/read` | auth | Y |
| PUT | `/api/v1/notifications/read-all` | auth | Y |
| GET | `/api/v1/notifications/unread-count` | auth | Y |

### order

Source: `backend/src/modules/order/order.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/orders` | auth, role:buyer | Y |
| POST | `/api/v1/orders` | auth, role:buyer | Y |
| GET | `/api/v1/orders/:id` | auth, role:buyer | Y |
| PUT | `/api/v1/orders/:id/cancel` | auth, role:buyer | Y |
| GET | `/api/v1/orders/:id/invoice` | auth, role:buyer | N |
| POST | `/api/v1/orders/:id/mark-ready` | auth, role:seller, requireApprovedSeller | N |
| POST | `/api/v1/orders/:id/request-balance` | auth, role:seller, requireApprovedSeller | N |
| PUT | `/api/v1/orders/:id/status` | auth, role:seller, requireApprovedSeller | Y |
| POST | `/api/v1/orders/delivery-estimate` | auth, role:buyer | N |
| GET | `/api/v1/orders/seller/:id` | auth, role:seller, requireApprovedSeller | Y |
| GET | `/api/v1/orders/seller/list` | auth, role:seller, requireApprovedSeller | Y |

### payment

Source: `backend/src/modules/payment/payment.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/payments/:orderId` | auth | Y |
| PUT | `/api/v1/payments/:orderId/confirm-receipt` | auth, role:buyer | Y |
| POST | `/api/v1/payments/:orderId/initiate` | auth, role:buyer | Y |
| POST | `/api/v1/payments/:orderId/malipopay-card/checkout` | auth, role:buyer | Y |
| POST | `/api/v1/payments/:orderId/paypal/create` | auth, role:buyer | Y |
| POST | `/api/v1/payments/:orderId/snippe/checkout` | auth, role:buyer | Y |
| POST | `/api/v1/payments/:orderId/wallet` | auth, role:buyer | N |
| GET | `/api/v1/payments/booking/:bookingId` | auth | Y |
| POST | `/api/v1/payments/booking/:bookingId/initiate` | auth, role:buyer | Y |
| POST | `/api/v1/payments/booking/:bookingId/malipopay-card/checkout` | auth, role:buyer | Y |
| POST | `/api/v1/payments/booking/:bookingId/paypal/create` | auth, role:buyer | Y |
| POST | `/api/v1/payments/booking/:bookingId/snippe/checkout` | auth, role:buyer | Y |
| GET | `/api/v1/payments/methods` | auth | Y |
| POST | `/api/v1/payments/paypal/capture` | auth | Y |
| GET | `/api/v1/payments/review-queue` | auth, role:admin | N |
| POST | `/api/v1/payments/review-queue/:reviewId/accept` | auth, role:admin | N |
| POST | `/api/v1/payments/review-queue/:reviewId/resolve` | auth, role:admin | N |
| POST | `/api/v1/payments/wallet/topup` | auth, role:buyer | N |
| POST | `/api/v1/payments/webhooks/malipopay` | verifyMalipopayWebhook | Y |
| POST | `/api/v1/payments/webhooks/selcom` | verifySelcomWebhook | Y |

### pickupPoint

Source: `backend/src/modules/pickupPoint/pickupPoint.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/pickup-points` |  | N |
| GET | `/api/v1/pickup-points/admin` | auth, role:admin | N |
| POST | `/api/v1/pickup-points/admin` | auth, role:admin | N |
| PUT | `/api/v1/pickup-points/admin/:id` | auth, role:admin | N |

### pos

Source: `backend/src/modules/pos/pos.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/seller/pos/adjustments` | auth, role:seller | N |
| POST | `/api/v1/seller/pos/adjustments` | auth, role:seller | N |
| POST | `/api/v1/seller/pos/items` | auth, role:seller | N |
| PUT | `/api/v1/seller/pos/items/:productId` | auth, role:seller | N |
| GET | `/api/v1/seller/pos/report` | auth, role:seller | N |
| GET | `/api/v1/seller/pos/sales` | auth, role:seller | N |
| POST | `/api/v1/seller/pos/sales` | auth, role:seller | N |
| GET | `/api/v1/seller/pos/stock` | auth, role:seller | N |

### product

Source: `backend/src/modules/product/product.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/products` |  | Y |
| POST | `/api/v1/products` | auth, role:seller, requireApprovedSeller, requireProductProvider | Y |
| PUT | `/api/v1/products/:id` | auth, role:seller, requireProductProvider | Y |
| PUT | `/api/v1/products/:id/activate` | auth, role:seller, requireApprovedSeller, requireProductProvider | Y |
| PUT | `/api/v1/products/:id/deactivate` | auth, role:seller, requireProductProvider | Y |
| POST | `/api/v1/products/:id/images` | auth, role:seller, requireApprovedSeller, requireProductProvider | Y |
| DELETE | `/api/v1/products/:id/images/:imageId` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| PUT | `/api/v1/products/:id/images/:imageId/primary` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| PUT | `/api/v1/products/:id/images/reorder` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| GET | `/api/v1/products/:id/media` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| POST | `/api/v1/products/:id/media` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| DELETE | `/api/v1/products/:id/media/:mediaId` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| PUT | `/api/v1/products/:id/media/order` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| POST | `/api/v1/products/:id/media/sign` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| POST | `/api/v1/products/:id/videos` | auth, role:seller, requireApprovedSeller, requireProductProvider | Y |
| DELETE | `/api/v1/products/:id/videos/:videoId` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| PUT | `/api/v1/products/:id/videos/reorder` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| GET | `/api/v1/products/:slug` |  | Y |
| PUT | `/api/v1/products/bulk/price` | auth, role:seller, requireProductProvider | N |
| PUT | `/api/v1/products/bulk/status` | auth, role:seller, requireProductProvider | Y |
| POST | `/api/v1/products/draft` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| PUT | `/api/v1/products/draft/:id` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| POST | `/api/v1/products/draft/:id/publish` | auth, role:seller, requireApprovedSeller, requireProductProvider | N |
| GET | `/api/v1/products/filters/regions` |  | Y |
| GET | `/api/v1/products/filters/sellers` |  | Y |
| GET | `/api/v1/products/mine/:id` | auth, role:seller, requireProductProvider | Y |
| GET | `/api/v1/products/mine/list` | auth, role:seller, requireProductProvider | Y |

### productAlert

Source: `backend/src/modules/productAlert/productAlert.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/products/:productId/alerts` | auth, role:buyer | N |
| POST | `/api/v1/products/:productId/alerts` | auth, role:buyer | N |
| DELETE | `/api/v1/products/:productId/alerts/:type` | auth, role:buyer | N |

### productQuestion

Source: `backend/src/modules/productQuestion/productQuestion.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/products/:productId/questions` |  | N |
| POST | `/api/v1/products/:productId/questions` | auth, role:buyer | N |
| POST | `/api/v1/questions/:id/answer` | auth, role:seller | N |

### productVariant

Source: `backend/src/modules/productVariant/productVariant.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/products/:productId/variants` |  | N |
| PUT | `/api/v1/products/:productId/variants` | auth, role:seller | N |

### push

Source: `backend/src/modules/push/push.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/push/subscribe` | auth | Y |
| POST | `/api/v1/push/unsubscribe` | auth | Y |
| GET | `/api/v1/push/vapid-public-key` |  | Y |

### recommendation

Source: `backend/src/modules/recommendation/recommendation.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/recommendations/for-me` |  | Y |
| GET | `/api/v1/recommendations/related/:slug` |  | Y |

### referral

Source: `backend/src/modules/referral/referral.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/loyalty/me` | auth | N |

### refund

Source: `backend/src/modules/refund/refund.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/admin/refunds` | auth, role:admin | Y |
| GET | `/api/v1/admin/refunds/:id` | auth, role:admin | Y |
| POST | `/api/v1/admin/refunds/:id/retry` | auth, role:admin | Y |
| GET | `/api/v1/admin/refunds/needs-attention-count` | auth, role:admin | N |

### return

Source: `backend/src/modules/return/return.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/returns` | auth, role:buyer, maintenanceCheck | N |
| POST | `/api/v1/returns` | auth, role:buyer, maintenanceCheck | N |
| GET | `/api/v1/returns/:id` | auth | N |
| PUT | `/api/v1/returns/:id/cancel` | auth, role:buyer | N |
| POST | `/api/v1/returns/:id/evidence` | auth | N |
| PUT | `/api/v1/returns/:id/ship-back` | auth, role:buyer | N |
| GET | `/api/v1/returns/admin` | auth, role:admin | N |
| PUT | `/api/v1/returns/admin/:id/approve` | auth, role:admin | N |
| PUT | `/api/v1/returns/admin/:id/received` | auth, role:admin | N |
| PUT | `/api/v1/returns/admin/:id/reject` | auth, role:admin | N |
| GET | `/api/v1/returns/seller` | auth, role:seller | N |
| PUT | `/api/v1/returns/seller/:id/approve` | auth, role:seller | N |
| PUT | `/api/v1/returns/seller/:id/received` | auth, role:seller | N |
| PUT | `/api/v1/returns/seller/:id/reject` | auth, role:seller | N |

### review

Source: `backend/src/modules/review/review.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/reviews` | auth, role:buyer | Y |
| DELETE | `/api/v1/reviews/:id` | auth, role:buyer | Y |
| PUT | `/api/v1/reviews/:id` | auth, role:buyer | Y |
| POST | `/api/v1/reviews/:id/photos` | auth, role:buyer | Y |
| POST | `/api/v1/reviews/:id/reply` | auth, role:seller | Y |
| POST | `/api/v1/reviews/booking/:bookingId` | auth, role:buyer | Y |
| GET | `/api/v1/reviews/product/:productId` |  | Y |
| GET | `/api/v1/reviews/provider/:providerId` |  | Y |
| GET | `/api/v1/reviews/service/:serviceId` |  | Y |
| GET | `/api/v1/reviews/store/:sellerId` |  | Y |

### search

Source: `backend/src/modules/search/search.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/search/log` |  | N |
| GET | `/api/v1/search/trending` |  | N |

### seller

Source: `backend/src/modules/seller/seller.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/seller/analytics` | auth, role:seller, requireApprovedSeller | Y |
| GET | `/api/v1/seller/analytics/advanced` | auth, role:seller, requireApprovedSeller | Y |
| GET | `/api/v1/seller/analytics/export` | auth, role:seller, requireApprovedSeller | Y |
| GET | `/api/v1/seller/collections` | auth, role:seller | Y |
| POST | `/api/v1/seller/collections` | auth, role:seller | Y |
| DELETE | `/api/v1/seller/collections/:id` | auth, role:seller | Y |
| GET | `/api/v1/seller/collections/:id/products` | auth, role:seller | Y |
| POST | `/api/v1/seller/collections/:id/products` | auth, role:seller | Y |
| DELETE | `/api/v1/seller/collections/:id/products/:productId` | auth, role:seller | Y |
| GET | `/api/v1/seller/delivery-agents` | auth, role:seller | Y |
| POST | `/api/v1/seller/delivery-agents` | auth, role:seller | Y |
| DELETE | `/api/v1/seller/delivery-agents/:agentId` | auth, role:seller | Y |
| PUT | `/api/v1/seller/merchant-type` | auth, role:seller | Y |
| GET | `/api/v1/seller/overview` | auth, role:seller, requireApprovedSeller | N |
| GET | `/api/v1/seller/profile` | auth, role:seller | Y |
| POST | `/api/v1/seller/profile` | auth, role:seller | Y |
| PUT | `/api/v1/seller/profile` | auth, role:seller | Y |
| DELETE | `/api/v1/seller/promo-video` | auth, role:seller | N |
| POST | `/api/v1/seller/promo-video` | auth, role:seller | N |
| POST | `/api/v1/seller/upload-banner` | auth, role:seller | Y |
| POST | `/api/v1/seller/upload-logo` | auth, role:seller | Y |

### sellerSavedFilter

Source: `backend/src/modules/sellerSavedFilter/sellerSavedFilter.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| DELETE | `/api/v1/seller-filters/:id` | auth, role:seller | N |
| GET | `/api/v1/seller-filters/:pageKey` | auth, role:seller | N |
| POST | `/api/v1/seller-filters/:pageKey` | auth, role:seller | N |

### seoMetrics

Source: `backend/src/modules/seoMetrics/seoMetrics.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/seo/admin/search-misses` | auth, role:admin | N |
| GET | `/api/v1/seo/admin/web-vitals` | auth, role:admin | N |
| POST | `/api/v1/seo/search-misses` | reportLimiter | N |
| POST | `/api/v1/seo/web-vitals` | reportLimiter | N |

### service

Source: `backend/src/modules/service/service.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/services` |  | Y |
| POST | `/api/v1/services` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/services/:id` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/services/:id/activate` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/services/:id/deactivate` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| POST | `/api/v1/services/:id/images` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| GET | `/api/v1/services/:id/pricing-rules` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| POST | `/api/v1/services/:id/pricing-rules` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/services/:id/publish` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/services/:id/unpublish` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| POST | `/api/v1/services/:id/videos` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| GET | `/api/v1/services/:slug` |  | Y |
| POST | `/api/v1/services/draft` | auth, role:seller, requireApprovedSeller, requireServiceProvider | N |
| GET | `/api/v1/services/filters/regions` |  | Y |
| GET | `/api/v1/services/mine/:id` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| GET | `/api/v1/services/mine/list` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| DELETE | `/api/v1/services/pricing-rules/:ruleId` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/services/pricing-rules/:ruleId/activate` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |
| PUT | `/api/v1/services/pricing-rules/:ruleId/deactivate` | auth, role:seller, requireApprovedSeller, requireServiceProvider | Y |

### serviceCategory

Source: `backend/src/modules/serviceCategory/serviceCategory.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/service-categories` |  | Y |
| POST | `/api/v1/service-categories` | auth, role:admin | Y |
| PUT | `/api/v1/service-categories/:id` | auth, role:admin | Y |
| PUT | `/api/v1/service-categories/:id/activate` | auth, role:admin | Y |
| POST | `/api/v1/service-categories/:id/cover` | auth, role:admin | Y |
| PUT | `/api/v1/service-categories/:id/deactivate` | auth, role:admin | Y |
| PUT | `/api/v1/service-categories/:id/maintenance` | maintenance, auth, role:admin | Y |
| GET | `/api/v1/service-categories/:slug` |  | Y |
| GET | `/api/v1/service-categories/admin/all` | auth, role:admin | Y |
| GET | `/api/v1/service-categories/browse` |  | Y |

### sms

Source: `backend/src/modules/sms/sms.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| POST | `/api/v1/sms/webhook` | verifySmsWebhook | N |

### sponsorship

Source: `backend/src/modules/sponsorship/sponsorship.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/seller/sponsorship/campaigns` | auth, role:seller, requireApprovedSeller | Y |
| POST | `/api/v1/seller/sponsorship/campaigns` | auth, role:seller, requireApprovedSeller | Y |
| PUT | `/api/v1/seller/sponsorship/campaigns/:id/cancel` | auth, role:seller, requireApprovedSeller | Y |
| GET | `/api/v1/seller/sponsorship/campaigns/:id/cancel-preview` | auth, role:seller, requireApprovedSeller | N |
| GET | `/api/v1/seller/sponsorship/pricing` | auth, role:seller, requireApprovedSeller | Y |

### status

Source: `backend/src/modules/status/status.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/status` |  | Y |
| GET | `/api/v1/status/admin/incidents` | auth, role:admin | Y |
| POST | `/api/v1/status/admin/incidents` | auth, role:admin | Y |
| PUT | `/api/v1/status/admin/incidents/:id` | auth, role:admin | Y |
| POST | `/api/v1/status/subscribe` | authLimiter | N |
| POST | `/api/v1/status/unsubscribe` | authLimiter | N |

### stock

Source: `backend/src/modules/stock/ops.routes.js` (and sibling route files)

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/seller/stock/access` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/customers` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/customers` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/customers/:id` | auth, role:seller, requireFeature("stock_pos") | N |
| PUT | `/api/v1/seller/stock/customers/:id` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/customers/:id/payments` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/expenses` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/expenses` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/expenses/:id` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/expenses/:id/void` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/export/:kind` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/import/items` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/import/template` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/items` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/items` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/items/:id` | auth, role:seller, requireFeature("stock_pos") | N |
| PUT | `/api/v1/seller/stock/items/:id` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/items/:id/archive` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/items/:id/list-on-nexora` | auth, role:seller, requireFeature("stock_pos"), requireApprovedSeller | N |
| POST | `/api/v1/seller/stock/items/:id/stock` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/items/:id/unarchive` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/items/:id/unlink` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/lookup` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/movements` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/purchases` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/purchases` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/purchases/:id` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/purchases/:id/payments` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/reconcile` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/reports/best-sellers` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/reports/daily-close` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/reports/debts` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/reports/low-stock` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/reports/overview` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/reports/valuation` | auth, role:seller, requireFeature("stock_pos"), requireFeature("stock_cost_reports") | N |
| GET | `/api/v1/seller/stock/sales` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/sales` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/sales/:id` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/sales/:id/receipt` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/sales/:id/receipt.pdf` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/sales/:id/return` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/sales/:id/void` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/sales/sync` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/suppliers` | auth, role:seller, requireFeature("stock_pos") | N |
| POST | `/api/v1/seller/stock/suppliers` | auth, role:seller, requireFeature("stock_pos") | N |
| GET | `/api/v1/seller/stock/suppliers/:id` | auth, role:seller, requireFeature("stock_pos") | N |
| PUT | `/api/v1/seller/stock/suppliers/:id` | auth, role:seller, requireFeature("stock_pos") | N |

### store

Source: `backend/src/modules/store/store.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/stores` |  | N |
| GET | `/api/v1/stores/:slug` |  | Y |
| GET | `/api/v1/stores/:slug/collections` |  | Y |
| DELETE | `/api/v1/stores/:slug/follow` | auth, role:buyer | N |
| POST | `/api/v1/stores/:slug/follow` | auth, role:buyer | N |
| GET | `/api/v1/stores/:slug/follow-status` | auth, role:buyer | N |
| GET | `/api/v1/stores/:slug/services` |  | N |

### storeType

Source: `backend/src/modules/storeType/storeType.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/store-types` |  | Y |
| POST | `/api/v1/store-types` | auth, role:admin | Y |
| PUT | `/api/v1/store-types/:id` | auth, role:admin | Y |
| PUT | `/api/v1/store-types/:id/activate` | auth, role:admin | Y |
| PUT | `/api/v1/store-types/:id/deactivate` | auth, role:admin | Y |
| GET | `/api/v1/store-types/admin/all` | auth, role:admin | Y |

### subscription

Source: `backend/src/modules/subscription/subscription.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/subscriptions/access` | auth, role:seller | N |
| POST | `/api/v1/subscriptions/cancel` | auth, role:seller | Y |
| GET | `/api/v1/subscriptions/me` | auth, role:seller | Y |
| GET | `/api/v1/subscriptions/plans` |  | Y |
| POST | `/api/v1/subscriptions/subscribe` | auth, role:seller | Y |
| POST | `/api/v1/subscriptions/subscribe/malipopay-card` | auth, role:seller | Y |
| POST | `/api/v1/subscriptions/subscribe/paypal` | auth, role:seller | Y |
| POST | `/api/v1/subscriptions/subscribe/snippe` | auth, role:seller | Y |

### support

Source: `backend/src/modules/support/support.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/support` | auth | N |
| POST | `/api/v1/support` | auth | N |
| GET | `/api/v1/support/:id` | auth | N |
| POST | `/api/v1/support/:id/reply` | auth | N |
| GET | `/api/v1/support/admin` | auth, role:admin | N |
| PUT | `/api/v1/support/admin/:id/status` | auth, role:admin | N |

### wallet

Source: `backend/src/modules/wallet/wallet.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/wallet` | auth, role:seller, maintenanceCheck | Y |
| GET | `/api/v1/wallet/withdrawals` | auth, role:seller, maintenanceCheck | Y |
| POST | `/api/v1/wallet/withdrawals` | auth, role:seller, maintenanceCheck | Y |

### whatsapp

Source: `backend/src/modules/whatsapp/whatsapp.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| PUT | `/api/v1/whatsapp/opt-in` | auth | N |

### wishlist

Source: `backend/src/modules/wishlist/wishlist.routes.js`

| Method | Path | Guards | OpenAPI |
|---|---|---|---|
| GET | `/api/v1/wishlist` | auth, role:buyer, maintenanceCheck | Y |
| DELETE | `/api/v1/wishlist/:productId` | auth, role:buyer, maintenanceCheck | Y |
| POST | `/api/v1/wishlist/:productId` | auth, role:buyer, maintenanceCheck | Y |
| GET | `/api/v1/wishlist/ids` | auth, role:buyer, maintenanceCheck | Y |
| GET | `/api/v1/wishlist/services` | auth, role:buyer, maintenanceCheck | N |
| DELETE | `/api/v1/wishlist/services/:serviceId` | auth, role:buyer, maintenanceCheck | N |
| POST | `/api/v1/wishlist/services/:serviceId` | auth, role:buyer, maintenanceCheck | N |

## 5. Endpoints with no detected auth guard (review list)

Many are intentionally public (catalog, status, webhooks). The point of the list is that each one needs an explicit owner decision; mutating methods deserve special attention.

| Method | Path | Note |
|---|---|---|
| POST | `/api/v1/affiliate/click` | Verified public by design (landing-page click tracking); body validated; only the global 600/15min/IP limiter applies (affiliate.routes.js:14) |
| POST | `/api/v1/ai/chat` | aiLimiter |
| POST | `/api/v1/ai/products/:slug/explain` | aiLimiter |
| POST | `/api/v1/ai/search/parse` | aiLimiter |
| POST | `/api/v1/auth/forgot-password` | authLimiter |
| POST | `/api/v1/auth/google` | authLimiter |
| POST | `/api/v1/auth/google/complete` | authLimiter |
| POST | `/api/v1/auth/login` | authLimiter |
| POST | `/api/v1/auth/login/resend-otp` | authLimiter |
| POST | `/api/v1/auth/login/verify-otp` | authLimiter |
| POST | `/api/v1/auth/logout` | Public and CSRF-exempt by design (csrf.middleware.js) |
| POST | `/api/v1/auth/register` | authLimiter |
| POST | `/api/v1/auth/reset-password` | authLimiter |
| POST | `/api/v1/payments/webhooks/malipopay` | verifyMalipopayWebhook |
| POST | `/api/v1/payments/webhooks/malipopay-card` | raw body, provider signature |
| POST | `/api/v1/payments/webhooks/paypal` | raw body, PayPal verify-webhook-signature |
| POST | `/api/v1/payments/webhooks/selcom` | verifySelcomWebhook |
| POST | `/api/v1/payments/webhooks/snippe` | raw body, provider signature (Snippe) |
| POST | `/api/v1/search/log` | Verified public; body validated; only the global limiter applies (search.routes.js:16) |
| POST | `/api/v1/seo/search-misses` | reportLimiter |
| POST | `/api/v1/seo/web-vitals` | reportLimiter |
| POST | `/api/v1/sms/webhook` | verifySmsWebhook |
| POST | `/api/v1/status/subscribe` | authLimiter |
| POST | `/api/v1/status/unsubscribe` | authLimiter |
| POST | `/api/v1/webhooks/brevo` | shared-secret header (BREVO_WEBHOOK_SECRET) |
| POST | `/api/v1/whatsapp/webhook` | raw body, X-Hub-Signature-256 |

(GET endpoints without guards: 51; not listed individually - see the inventory above.)
