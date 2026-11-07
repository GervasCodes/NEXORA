# Roles and Permissions Matrix

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Method | **Backend** guards were extracted from route files (`authorize("role")`, `authMiddleware`, `requireApproved*`, `requireSuperAdmin`, router-level `router.use(...)` and spread guard arrays). The matrix counts endpoint declarations per module and role. Frontend `Require*` wrappers are noted separately and are **not** treated as security. |
| Limits | Counts are of declared routes, not of effective permissions. Checks done inside controllers or services (e.g. "only the owner of this order") were **not** audited and are the main remaining risk. An endpoint with several roles counts once per role. |

## 1. Roles (Verified)

| Role | Stored as | Notes |
|---|---|---|
| Visitor | no account | Browse catalog, status page, legal pages |
| Buyer | `users.role = buyer` | Cart, checkout, orders, bookings, disputes, returns, wallet |
| Seller | `users.role = seller`; `merchant_type` product/service/hybrid; `seller_mode` marketplace/business_tools | Must be approved (`requireApprovedSeller`) to list and sell; further `requireProductProvider` / `requireServiceProvider` split |
| Delivery agent | `users.role = delivery_agent` | Must be approved (`requireApprovedDeliveryAgent`); individual or part of a delivery business (`requireDeliveryBusiness`) |
| Admin | `users.role = admin`, `admin_level = admin` | Whole `/admin` router is guarded by `authorize("admin")` |
| Super admin | `admin_level = super_admin` | `requireSuperAdmin` on selected routes |

Self-registration allows only buyer, seller and delivery_agent. Admin accounts are created by the seed script (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PHONE`) or by a super admin.

## 2. Endpoint access by module

| Module | Public | Any signed-in | Buyer | Seller | Delivery agent | Admin |
|---|---|---|---|---|---|---|
| account |  | 10 |  |  |  |  |
| accountVerification |  |  |  | 2 |  | 10 |
| admin |  |  |  |  |  | 64 |
| adminNotification |  |  |  |  |  | 4 |
| affiliate | 1 |  | 3 |  |  | 7 |
| ai | 4 | 1 | 1 | 5 | 1 | 5 |
| app.js | 12 | 1 |  |  |  | 1 |
| auth | 10 | 2 |  |  |  |  |
| availability | 1 |  |  | 1 |  |  |
| booking |  | 2 | 3 | 3 |  |  |
| broadcast |  |  |  |  |  | 5 |
| business | 1 |  | 2 | 1 |  | 2 |
| businessTools |  |  |  | 1 |  |  |
| buyerAddress |  |  | 5 |  |  |  |
| buyerWallet |  |  | 1 |  |  |  |
| cart |  |  | 5 |  |  |  |
| category | 6 |  |  |  |  | 9 |
| chat |  | 18 |  |  |  |  |
| content | 3 |  |  |  |  | 5 |
| coupon |  |  | 1 |  |  |  |
| dataReset |  |  |  |  |  | 6 |
| delivery |  | 1 | 1 |  | 8 | 8 |
| deliveryBusiness |  |  |  |  | 11 |  |
| dispute |  | 3 | 3 | 1 |  | 4 |
| documentAccess |  |  |  |  |  | 1 |
| earnings |  |  |  |  | 1 |  |
| efd |  | 1 |  | 3 |  | 4 |
| featuredStore |  |  |  | 5 |  |  |
| groupBuy | 2 |  | 3 | 2 |  |  |
| kyc |  | 2 |  |  |  | 3 |
| liveSelling | 1 |  | 3 | 3 |  |  |
| maintenance |  |  |  |  |  | 3 |
| notification |  | 5 |  |  |  |  |
| order |  |  | 6 | 5 |  |  |
| payment | 2 | 4 | 11 |  |  | 3 |
| pickupPoint | 1 |  |  |  |  | 3 |
| pos |  |  |  | 8 |  |  |
| product | 4 |  |  | 23 |  |  |
| productAlert |  |  | 3 |  |  |  |
| productQuestion | 1 |  | 1 | 1 |  |  |
| productVariant | 1 |  |  | 1 |  |  |
| push | 1 | 2 |  |  |  |  |
| recommendation | 2 |  |  |  |  |  |
| referral |  | 1 |  |  |  |  |
| refund |  |  |  |  |  | 4 |
| return |  | 2 | 4 | 4 |  | 4 |
| review | 4 |  | 5 | 1 |  |  |
| search | 2 |  |  |  |  |  |
| seller |  |  |  | 21 |  |  |
| sellerSavedFilter |  |  |  | 3 |  |  |
| seoMetrics | 2 |  |  |  |  | 2 |
| service | 3 |  |  | 16 |  |  |
| serviceCategory | 3 |  |  |  |  | 7 |
| sms | 1 |  |  |  |  |  |
| sponsorship |  |  |  | 5 |  |  |
| status | 3 |  |  |  |  | 3 |
| stock |  |  |  | 47 |  |  |
| store | 4 |  | 3 |  |  |  |
| storeType | 1 |  |  |  |  | 5 |
| subscription | 1 |  |  | 7 |  |  |
| support |  | 4 |  |  |  | 2 |
| wallet |  |  |  | 3 |  |  |
| whatsapp |  | 1 |  |  |  |  |
| wishlist |  |  | 7 |  |  |  |
| **Total** | 77 | 60 | 71 | 172 | 21 | 174 |

## 3. Additional guards

| Guard | Endpoints | Examples |
|---|---|---|
| `requireApprovedDeliveryAgent` | 20 | GET /api/v1/delivery/available, POST /api/v1/delivery/:orderId/claim |
| `requireApprovedSeller` | 64 | GET /api/v1/seller/sponsorship/pricing, GET /api/v1/seller/sponsorship/campaigns |
| `requireDeliveryBusiness` | 9 | GET /api/v1/delivery-business/overview, GET /api/v1/delivery-business/roster |
| `requireFeature("stock_cost_reports")` | 1 | GET /api/v1/seller/stock/reports/valuation |
| `requireFeature("stock_pos")` | 47 | GET /api/v1/seller/stock/items, POST /api/v1/seller/stock/items |
| `requireProductProvider` | 23 | POST /api/v1/products, POST /api/v1/products/draft |
| `requireServiceProvider` | 20 | POST /api/v1/services, POST /api/v1/services/draft |
| `requireSuperAdmin` | 12 | GET /api/v1/admin/data-reset/platform/preview, POST /api/v1/admin/data-reset/platform |

## 4. Access-control observations

| ID | Observation | Status |
|---|---|---|
| ACL-001 | Roles are exclusive: one `users.role` per account. A person who is both buyer and seller needs two accounts (Inferred from the single-valued enum). | Verified (schema) / Inferred (consequence) |
| ACL-002 | Frontend `RequireBuyer`/`RequireSeller`/`RequireAdmin` only redirect or show a message based on the client-held `user.role`. They provide no protection; every sensitive action must be and (by the guard counts above) generally is guarded on the backend. | Verified |
| ACL-003 | Object-level authorization (a buyer reading another buyer's order, a seller editing another seller's product) lives in services/repositories, not in the route guards. Examples with tests: cancelling another buyer's order is rejected; chat non-participants rejected. **No systematic audit of ownership checks was performed.** | Verified for examples; Not verified in general |
| ACL-004 | Every authenticated request re-reads the account from the database, so suspension, deactivation and `token_version` changes take effect on the next call (cost: one DB read per request). | Verified |
| ACL-005 | `/db-test` is an admin-only debug route in production code. | Verified (`app.js`) |
| ACL-006 | Module switches (`platform_modules`) disable a feature server-side: `maintenance.middleware.js` returns 503 `MODULE_MAINTENANCE`; if the status lookup itself fails the request is **allowed through** (fail-open). `requireFeature(...)` is a separate plan/feature guard (e.g. `stock_pos`, 11 endpoints). | Verified |
| ACL-007 | Verification documents are fetched through the guarded `documentAccess` routes (`/admin/documents`, `PrivateDocumentLink` in the UI). Whether the underlying storage objects are non-public was not verified. | Verified (route guard); storage privacy Not verified |
| ACL-008 | There are only two admin levels (`admin`, `super_admin`); `PUT /admin/admins/:id/permissions` changes that level only. A regular admin has broad power over users, money approvals and settings; there are no fine-grained admin permissions. Super admin alone can create, list, demote and remove admins and run data reset (approval table `data_reset_approvals`). Demoting the last super admin is refused, and admin creation/level changes are audit-logged and notify other admins. | Verified (`admin.service.js` 1190-1230, `admin.routes.js` 195-198); separation of duties for payout approval is not defined (Owner Confirmation Required) |

## 5. Permission sketch by capability (Inferred from the matrix)

| Capability | Buyer | Seller | Delivery agent | Admin |
|---|---|---|---|---|
| Browse and search | yes | yes | yes | yes |
| Place and pay for orders | yes | no | no | no |
| List products/services | no | yes (approved) | no | moderate |
| Fulfil orders, set own delivery | no | yes | no | no |
| Accept/complete deliveries | no | no | yes (approved) | dispatch override |
| Open disputes / returns | yes | respond | no | resolve |
| Request withdrawal | no | yes | earnings (agent) | approve and mark paid |
| Configure platform, fees, switches | no | no | no | yes |
| Manage admins, data reset | no | no | no | super admin only |
