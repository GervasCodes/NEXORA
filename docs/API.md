# API Reference

Base URL: `/api/v1`. All endpoints below are mounted under this prefix
unless noted otherwise. Every path in this document is relative to its
module's mount point, listed in the table below.

Auth: unless a route is explicitly listed as public, assume it requires a
valid session (`Authorization: Bearer <token>`, set on login/OTP
verification). Routes restricted to a specific role are noted inline
(`admin`, `super_admin`, `seller`, `buyer`, delivery `agent`). Admin-only
modules (`/admin/*`) gate on `admin` or `super_admin` unless noted.

For full request/response shapes, the authoritative source is each
module's `*.controller.js` and `*.validation.js` — this document is a
map of what exists and where, not a full OpenAPI spec.

## Module → mount point

| Module | Mount point | File |
|---|---|---|
| Auth | `/auth` | `modules/auth/auth.routes.js` |
| Account | `/account` | `modules/account/account.routes.js` |
| Account verification (admin) | `/admin/account-verifications` | `modules/accountVerification/accountVerification.routes.js` |
| Admin | `/admin` | `modules/admin/admin.routes.js` |
| Seller | `/seller` | `modules/seller/seller.routes.js` |
| Seller sponsorship | `/seller/sponsorship` | `modules/sponsorship/sponsorship.routes.js` |
| Seller featured store | `/seller/featured-store` | `modules/featuredStore/featuredStore.routes.js` |
| Seller department sponsorship | `/seller/department-sponsorship` | `modules/departmentSponsorship/departmentSponsorship.routes.js` |
| Products | `/products` | `modules/product/product.routes.js` |
| Categories | `/categories` | `modules/category/category.routes.js` |
| Store types | `/store-types` | `modules/storeType/storeType.routes.js` |
| Stores (public storefront) | `/stores` | `modules/store/store.routes.js` |
| Cart | `/cart` | `modules/cart/cart.routes.js` |
| Orders | `/orders` | `modules/order/order.routes.js` |
| Payments | `/payments` | `modules/payment/payment.routes.js` |
| Delivery | `/delivery` | `modules/delivery/delivery.routes.js` |
| Reviews | `/reviews` | `modules/review/review.routes.js` |
| Notifications | `/notifications` | `modules/notification/notification.routes.js` |
| Chat | `/chat` | `modules/chat/chat.routes.js` |
| Push (Web Push) | `/push` | `modules/push/push.routes.js` |
| Wallet | `/wallet` | `modules/wallet/wallet.routes.js` |
| Earnings | `/earnings` | `modules/earnings/earnings.routes.js` |
| Wishlist | `/wishlist` | `modules/wishlist/wishlist.routes.js` |
| Disputes | `/disputes` | `modules/dispute/dispute.routes.js` |

## Auth — `/auth` (public)

| Method | Path | Notes |
|---|---|---|
| POST | `/register` | Create account |
| POST | `/login` | Password login; may trigger OTP step |
| POST | `/login/verify-otp` | Complete OTP login |
| POST | `/login/resend-otp` | Resend login OTP |
| POST | `/forgot-password` | Start password reset |
| POST | `/reset-password` | Complete password reset |

## Account — `/account`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Current user's profile |
| PUT | `/profile` | Update profile |
| PUT | `/settings` | Update language/theme/currency settings |
| POST | `/password/request-otp` | Start OTP-gated password change |
| POST | `/password/verify-otp` | Verify OTP for password change |
| PUT | `/password` | Change password |
| DELETE | `/` | Delete own account |

## Seller — `/seller`

| Method | Path | Notes |
|---|---|---|
| POST | `/upload-logo` | Store logo (Phase 7B) |
| POST | `/profile` | Create seller profile |
| GET | `/profile` | Get own seller profile |
| PUT | `/profile` | Update seller profile |
| POST | `/upload-banner` | Store banner (Phase 7B) |
| GET | `/delivery-agents` | List own delivery agents |
| POST | `/delivery-agents` | Add a delivery agent |
| DELETE | `/delivery-agents/:agentId` | Remove a delivery agent |
| GET | `/collections` | List own collections (Phase 7C) |
| POST | `/collections` | Create a collection |
| DELETE | `/collections/:id` | Delete a collection |
| GET | `/collections/:id/products` | List products in a collection |
| POST | `/collections/:id/products` | Add a product to a collection |
| DELETE | `/collections/:id/products/:productId` | Remove a product from a collection |
| GET | `/analytics` | Seller sales/analytics dashboard |
| POST | `/verification/fee` | Pay the Verified Seller badge fee (Phase 7D) |

Sub-modules mounted under `/seller/*`: `sponsorship`, `featured-store`,
`department-sponsorship` — each exposes the same shape:
`GET /pricing`, `GET /campaigns`, `POST /campaigns`,
`PUT /campaigns/:id/cancel` (plus `GET /categories` for the two
category-scoped ones — featured store and department sponsorship).

## Products — `/products`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | List/search products (filters, sort, pagination via query params) |
| GET | `/filters/sellers` | Distinct sellers for the filter UI |
| GET | `/filters/regions` | Distinct regions for the filter UI |
| GET | `/:slug` | Public product detail |
| POST | `/` | Create product (seller) |
| POST | `/:id/images` | Upload product images |
| POST | `/:id/videos` | Upload product video (Phase 6A) |
| POST | `/:id/audio` | Upload product audio (Phase 6B) |
| GET | `/mine/list` | Own products (seller) |
| GET | `/mine/:id` | Own product detail (seller) |
| PUT | `/:id` | Update product |
| PUT | `/:id/deactivate` | Deactivate product |
| PUT | `/:id/activate` | Reactivate product |

## Categories — `/categories`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Public category list |
| GET | `/departments` | Department discovery list (Phase 1B/1C) |
| GET | `/departments/:slug` | Department detail incl. promotions/sponsored/featured stores (Phase 2C) |
| GET | `/admin/all` | Full list incl. inactive (admin) |
| POST | `/:id/cover` | Upload department cover image (admin) |
| POST | `/` | Create category (admin) |
| PUT | `/:id` | Update category (admin) |
| PUT | `/:id/deactivate` | Deactivate (admin) |
| PUT | `/:id/activate` | Reactivate (admin) |

## Store types — `/store-types`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Public list |
| GET | `/admin/all` | Full list (admin) |
| POST | `/` | Create (admin) |
| PUT | `/:id` | Update (admin) |
| PUT | `/:id/deactivate` | Deactivate (admin) |
| PUT | `/:id/activate` | Reactivate (admin) |

## Stores (public storefront) — `/stores`

| Method | Path | Notes |
|---|---|---|
| GET | `/:slug/collections` | Store's public collections (Phase 7C) |
| GET | `/:slug` | Store profile — basics, trust info, catalog, about, delivery info, reviews (Phase 5A–5D) |

## Cart — `/cart`

| Method | Path | Notes |
|---|---|---|
| POST | `/` | Add item |
| GET | `/` | Get own cart |
| PUT | `/:productId` | Update quantity |
| DELETE | `/:productId` | Remove item |
| DELETE | `/` | Clear cart |

## Orders — `/orders`

| Method | Path | Notes |
|---|---|---|
| POST | `/` | Place order (creates parent/child orders per seller — order splitting) |
| GET | `/` | Own orders (buyer) |
| GET | `/:id` | Order detail |
| PUT | `/:id/cancel` | Cancel an order |
| GET | `/seller/list` | Orders for own store (seller) |
| GET | `/seller/:id` | Order detail (seller) |
| PUT | `/:id/status` | Update order status (seller) |

## Payments — `/payments`

| Method | Path | Notes |
|---|---|---|
| POST | `/webhooks/malipopay` | MalipoPay webhook (signature-verified) |
| POST | `/webhooks/selcom` | Selcom webhook (signature-verified) |
| POST | `/verification-fee/snippe/checkout` | Snippe checkout for the seller verification fee |
| POST | `/verification-fee/paypal/create` | PayPal order for the verification fee |
| POST | `/paypal/capture` | Capture a PayPal payment |
| POST | `/:orderId/initiate` | Start mobile-money payment (Selcom/MalipoPay) for an order |
| POST | `/:orderId/snippe/checkout` | Start Snippe hosted checkout for an order |
| POST | `/:orderId/paypal/create` | Start PayPal payment for an order |
| GET | `/:orderId` | Payment status for an order |
| PUT | `/:orderId/confirm-cod` | Confirm cash-on-delivery |

Escrow: captured payments are held rather than released to the seller
immediately; release happens via
`PUT /admin/orders/:id/release-escrow` — see `docs/ESCROW_ANALYSIS.md`
and the Admin section below.

## Delivery — `/delivery`

| Method | Path | Notes |
|---|---|---|
| GET | `/available` | Open deliveries an agent can claim |
| POST | `/:orderId/claim` | Claim a delivery (agent) |
| PUT | `/online` | Toggle own online/offline shift status (agent) |
| GET | `/my/list` | Own delivery history (agent) |
| GET | `/my/rating-summary` | Own rating summary (agent) |
| PUT | `/:orderId/status` | Update delivery status (picked up / in transit / delivered / failed) |
| GET | `/:orderId` | Delivery detail / live tracking data |
| POST | `/:orderId/rating` | Buyer rates a completed delivery |

See also the Admin dispatch endpoint and Socket.IO events documented
below — the live agent-offer/dispatch system sits across both modules.

## Reviews — `/reviews`

| Method | Path | Notes |
|---|---|---|
| GET | `/product/:productId` | Reviews for a product |
| GET | `/store/:sellerId` | Reviews for a store (Phase 5D) |
| POST | `/` | Create a review |
| PUT | `/:id` | Edit own review |
| DELETE | `/:id` | Delete own review |
| POST | `/:id/photos` | Attach photos to a review (Phase 6C) |
| POST | `/:id/reply` | Seller reply to a review — one per review (Phase 6C) |

## Notifications — `/notifications`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | List own notifications |
| GET | `/unread-count` | Unread count (for badge) |
| PUT | `/read-all` | Mark all read |
| PUT | `/:id/read` | Mark one read |
| DELETE | `/:id` | Delete a notification |

## Chat — `/chat`

| Method | Path | Notes |
|---|---|---|
| POST | `/conversations` | Start a conversation |
| GET | `/conversations` | List own conversations |
| GET | `/conversations/:id/messages` | List messages |
| POST | `/conversations/:id/messages` | Send a message |
| PUT | `/conversations/:id/read` | Mark conversation read |
| DELETE | `/conversations/:id/messages/:messageId` | Delete a message |
| POST | `/conversations/:id/clear` | Clear a conversation from own view |
| DELETE | `/conversations/:id` | Remove a conversation from own list |

## Push — `/push`

| Method | Path | Notes |
|---|---|---|
| GET | `/vapid-public-key` | Public key for Web Push subscription (public) |
| POST | `/subscribe` | Register a push subscription |
| POST | `/unsubscribe` | Remove a push subscription |

## Wallet — `/wallet`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Own wallet balance/ledger (seller/agent) |
| GET | `/withdrawals` | Own withdrawal history |
| POST | `/withdrawals` | Request a withdrawal |

## Earnings — `/earnings`

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | Own earnings dashboard (agent/seller) |

## Wishlist — `/wishlist`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Own saved products |
| GET | `/ids` | Just the saved product IDs (cheap check for `ProductCard`) |
| POST | `/:productId` | Save a product |
| DELETE | `/:productId` | Remove a saved product |

## Disputes — `/disputes`

| Method | Path | Notes |
|---|---|---|
| GET | `/admin` | All disputes (admin) |
| PUT | `/admin/:id/review` | Mark under review (admin) |
| PUT | `/admin/:id/resolve` | Resolve (admin) |
| PUT | `/admin/:id/reject` | Reject (admin) |
| GET | `/seller` | Own disputes (seller) |
| GET | `/` | Own disputes (buyer) |
| POST | `/` | Open a dispute (buyer) |
| PUT | `/:id/withdraw` | Withdraw own dispute |
| GET | `/:id` | Dispute detail |
| POST | `/:id/evidence` | Attach evidence |
| POST | `/:id/messages` | Post a message on a dispute thread |

## Account verification — `/admin/account-verifications` (admin)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | List pending/reviewed verifications |
| GET | `/:id` | Detail incl. uploaded documents |
| PUT | `/:id/approve` | Approve — grants Verified Seller badge |
| PUT | `/:id/reject` | Reject |

## Admin — `/admin`

| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | Top-line metrics |
| GET | `/dispatch` | Live delivery dispatch overview — see detail below |
| GET | `/analytics` | Platform analytics |
| GET | `/fraud-flags` | List fraud flags |
| PUT | `/fraud-flags/:id/resolve` | Resolve a fraud flag |
| GET | `/audit-logs` | Audit log |
| GET | `/refunds` | List refunds |
| GET | `/refunds/:id` | Refund detail |
| POST | `/refunds/:id/retry` | Retry a failed refund |
| GET | `/users` | List users |
| PUT | `/users/:id/deactivate` / `/activate` | Toggle a user account |
| GET | `/sellers` | List sellers |
| PUT | `/sellers/:id/verify` / `/unverify` | Toggle seller verification |
| GET | `/products` | List products |
| PUT | `/products/:id/deactivate` / `/activate` | Toggle a product |
| PUT | `/products/:id/sponsor` / `/unsponsor` | Toggle `is_sponsored` (Phase 2C) |
| GET | `/orders` | List orders |
| PUT | `/orders/:id/release-escrow` | Release held payment to seller wallet (Phase 9D) |
| GET | `/settings` / PUT `/settings` | Platform settings (commission rates, fees, etc.) |
| GET | `/sponsorship-campaigns` | All product sponsorship campaigns |
| GET | `/featured-store-campaigns` | All featured-store campaigns |
| GET | `/department-sponsorship-campaigns` | All department sponsorship campaigns |
| GET | `/withdrawals` | List withdrawal requests |
| PUT | `/withdrawals/:id/approve` / `/reject` / `/paid` | Process a withdrawal |
| GET | `/admins` *(super_admin)* | List admin accounts |
| POST | `/admins` *(super_admin)* | Create an admin account |
| PUT | `/admins/:id/permissions` *(super_admin)* | Update an admin's permissions |
| DELETE | `/admins/:id` *(super_admin)* | Remove an admin |

### `GET /admin/dispatch` — full response shape

One combined read powering the admin dispatch dashboard.

```json
{
  "deliveries": [
    {
      "id": 1,
      "order_id": 10,
      "agent_id": 5,
      "status": "in_transit",
      "delivery_fee": 4000,
      "distance_km": 6,
      "estimated_duration_minutes": 18,
      "assigned_at": "2026-07-21T09:00:00.000Z",
      "minutes_elapsed": 25,
      "is_delayed": true,
      "order_number": "ORD-1001",
      "shipping_city": "Dar es Salaam",
      "agent_first_name": "Amina",
      "agent_current_lat": -6.81,
      "agent_current_lng": 39.21
    }
  ],
  "agents": [
    {
      "id": 5,
      "first_name": "Amina",
      "current_lat": -6.81,
      "current_lng": 39.21,
      "active_delivery_count": 1
    }
  ],
  "delayed": [ /* subset of deliveries where is_delayed is true */ ],
  "summary": {
    "active_deliveries": 1,
    "delayed_deliveries": 1,
    "online_agents": 1,
    "idle_agents": 0
  }
}
```

`is_delayed` compares real elapsed time since assignment against the
road-routing ETA snapshot taken at assignment time
(`estimated_duration_minutes`) — that snapshot deliberately never
changes as the agent moves, so it stays a stable "were we on time"
baseline.

### Socket.IO events (room: `admins`)

Admin/super_admin sockets auto-join the `admins` room on connect (see
`backend/src/socket/socket.js`). No extra `join_*` call is needed.

| Event | Payload | Fired when |
|---|---|---|
| `dispatch:delivery_assigned` | `{ orderId, deliveryId?, agentId }` | A delivery is claimed manually or a matching offer is accepted |
| `dispatch:delivery_status` | `{ orderId, deliveryId, status }` | A delivery's status changes (picked up / in transit / delivered / failed) |
| `dispatch:agent_status` | `{ agentId, isOnline }` | An agent goes on/off shift |
| `dispatch:agent_position` | `{ agentId, lat, lng, timestamp }` | An online agent's location ping |

The dashboard treats `dispatch:delivery_assigned` / `dispatch:delivery_status`
/ `dispatch:agent_status` as "something changed, re-fetch `GET /admin/dispatch`"
triggers (so delay flags and summary counts, computed server-side, never
drift), and applies `dispatch:agent_position` directly to the matching
agent's row instead.

### Other Socket.IO events (not admin-scoped)

Beyond the dispatch events above, the app relies on Socket.IO for
real-time delivery offers (auto-offer to nearest agent, 30-second
timeout — see `README-phase-10B.md` for the `IncomingOfferModal` client
side) and live order/notification pushes. See
`backend/src/socket/socket.js` for the authoritative event list and room
structure.
