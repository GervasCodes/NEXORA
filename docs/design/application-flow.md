# Application Flow and User Journeys

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Basis | Route tree and guards in `frontend/src/App.jsx` (Verified), login/registration navigation code, backend module behaviour from `product/functional-specification.md`. Journeys were **not walked in a browser** (no Playwright browsers in the sandbox; the project's 3 e2e specs were not run). Treat transitions as code-derived. |
| Companion | `docs/diagrams/application-flow.mmd` (top-level map) |

## 1. Entry points (Verified)

| Entry | Behaviour |
|---|---|
| `/` Home | Hero ("Shop local. Sell local. Delivered to your door."), department rails, recommendations, recently viewed |
| Search (`/search`, header search box) | Product/service search; AI smart search parsing is available |
| Direct links to `/products/:slug`, `/services/:slug`, `/stores/:slug` | Public, prerendered shells for SEO (`scripts/prerender-shells.mjs`) |
| `/sell`, `/how-it-works`, `/about`, `/contact`, `/guides` | Marketing and help content |
| `/login`, `/register`, `/forgot-password` | Authentication |
| Affiliate `?ref=CODE` landings | `AffiliateClickTracker` posts to `/affiliate/click` |
| PWA install | `InstallPrompt` after the cookie notice is acknowledged |

Global chrome: header (hidden on admin and chat-thread routes), footer (hidden on admin, thread, checkout and auth-form routes), cookie consent banner, onboarding tour, floating AI assistant button and support widget, network status notice, update-available banner.

## 2. Authentication and onboarding

```mermaid
flowchart TD
    A[Visitor] --> B{Action needs account?}
    B -- yes --> C["/login with returnTo"]
    A --> D["/register"]
    D --> E{Method}
    E -- password --> F["Submit role, names, email, password 8+, terms"]
    E -- Google --> G["Google credential, ticket, complete profile"]
    F -- success --> H["Redirect to /login after about 1-2 s"]
    G -- signed in --> I["Redirect to /"]
    C --> J["POST /auth/login"]
    H --> J
    J -- wrong credentials --> K["401 generic message"]
    J -- 5 failures --> L["429 ACCOUNT_LOCKED 5/15/60 min"]
    J -- "password ok (always)" --> M["Enter emailed one-time code, 5 min expiry"]
    M -- ok --> N["Session cookie, 7 days"]
    M -- "wrong code" --> M2["Error; failures count toward lockout"]
    N --> O["navigate returnTo or /"]
```

Notes: there is **no role-based landing page**; a seller, agent or admin reaches their area by navigating (header menu) after login. `returnTo` is accepted only if it starts with a single `/` (open-redirect guard in `Login.jsx`). Sellers and delivery agents with account verification pending see a review notice (`AccountReviewNotice`) and cannot list or take deliveries until approved. Delivery agents must supply vehicle type and plate at registration.

## 3. Buyer purchase journey

```mermaid
flowchart TD
    A["Browse /products or /search"] --> B["/products/:slug"]
    B --> C{Variant needed?}
    C -- yes --> D[Select variant]
    C -- no --> E[Add to cart]
    D --> E
    E --> F["/cart (RequireBuyer)"]
    F --> G["/checkout: address, delivery, payment method, accept terms"]
    G --> H{Payment method}
    H -- "mobile money / card / PayPal" --> I["Provider prompt or redirect"]
    H -- "wallet" --> J["Wallet debit"]
    H -- "cash on delivery" --> K["Order placed unpaid"]
    I --> L["Webhook confirms, order paid"]
    J --> L
    K --> M["Seller prepares"]
    L --> M
    M --> N["/orders/:id/tracking: assigned, picked_up, in_transit"]
    N --> O["Buyer confirms receipt, delivered"]
    O --> P["Review, optional return or dispute"]
```

Alternate and error paths: empty cart; insufficient stock (checkout rolls back); payment failure (`payments.status = failed`, buyer can retry); unpaid orders swept by a 15-minute job; cancellation within a window; COD auto-confirmed after 48 h; payment status shown by `PaymentStatusBanner` and live via Socket.IO `payment:updated`.

## 4. Service booking journey

Browse `/services` -> `/services/:slug` -> choose dates/units (availability calendar) -> pay (booking payment, always escrowed) -> provider confirms or rejects (`/seller/bookings`) -> `/bookings/:id` shows progress (`BookingProgressTimeline`) -> completed or cancelled/refunded. Dates with no capacity or closed block the booking atomically.

## 5. Seller journey

```mermaid
flowchart TD
    A["Register as seller"] --> B["Verification review (documents)"]
    B -- approved --> C["/seller/setup: store, branding, payout details"]
    B -- rejected --> B2["Resubmit /seller/verification"]
    C --> D["/seller/products/new (wizard) or /seller/services/new"]
    D --> E["Orders /seller/orders: accept, ready, hand to agent or own delivery"]
    E --> F["Funds held, then released after delivery + hold + no dispute"]
    F --> G["/seller/wallet: request withdrawal"]
    G --> H["Admin approves, pays manually, records reference"]
    C --> I["/seller/promote, /seller/subscription (if enabled)"]
    C --> J["/seller/stock, /seller/pos (feature stock_pos)"]
```

## 6. Delivery agent journey

`/delivery` shows available offers -> accept (offer expires if unanswered; platform re-dispatches) -> `/delivery/mine` pick-up and drop-off, location shared in real time, handover by code or photo plus GPS -> `/delivery/earnings` and `/delivery/ratings`; a delivery business owner manages agents at `/delivery/business`.

## 7. Dispute, return and refund journey

Buyer opens `/disputes/new` or `/returns/new` (within 7 or 14 days) -> seller responds within 72 h -> admin reviews (`/admin/disputes`, `/admin/returns`) -> outcome: rejected (release resumes) or refund approved -> refund attempted via provider, else `manual_required` for an admin -> buyer notified.

## 8. Admin journey

Sign in -> `/admin` dashboard (GMV, active users) -> work queues: account verifications, withdrawals, disputes, returns, refunds, fraud, support, EFD, content -> configuration: settings, delivery rates, modules and maintenance, subscriptions and promotions -> oversight: audit logs, users and map, dispatch -> super admin only: admins, data reset.

## 9. Error and system states (Verified in code)

| State | Behaviour |
|---|---|
| Unknown route | `NotFound` (`*`) |
| Wrong role on a guarded page | Message ("This page is for buyer accounts") or redirect; unauthenticated users go to `/login` |
| Module under maintenance | HTTP 503 `MODULE_MAINTENANCE`; `MaintenanceScreen`; `DepartmentMaintenanceListener` |
| Backend suspended account | 403 `ACCOUNT_SUSPENDED` |
| Offline | `NetworkStatusNotice`, service-worker offline fallback |
| New build available | `UpdateAvailableBanner` |
| Render error | `ErrorFallback`, Sentry capture |

## 10. Retired or unreachable flows

`/seller/department-sponsorship` and `/admin/department-sponsorship` redirect to `/seller/promote` and `/admin/sponsorship`. Seller loans have a page file but no route. See `delivery/known-issues.md` (KNOWN-009).
