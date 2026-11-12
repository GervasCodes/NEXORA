# Integration Specification

> **Note 2026-11-11.** Snippe and MalipoPay were removed from the code. The live gateways are AzamPay, Selcom, PawaPay (mobile money and card) and PayPal; references below to the retired two describe the audited state or legacy rows only.

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Basis | Provider modules, registries, middleware and `.env.example`. **No integration was exercised against a real provider** (no credentials, no network to providers). "Simulate" behaviour and failure handling are from code. Secret values are never recorded here; only variable names. |

## 1. Selection and fallback rules (Verified in code)

| Domain | Selection | Not configured, non-production | Not configured, production |
|---|---|---|---|
| Mobile money | `MOBILE_MONEY_PROVIDER` = `malipopay`, `selcom` or `azampay` (`mobileMoney.provider.js`) | Uses the simulate provider (`isConfigured()` returns true outside production) | Throws "Mobile money is not configured" |
| SMS | Gateway provider | Simulate | Throws |
| WhatsApp | Meta Cloud API provider | Simulate | Throws |
| TRA tax receipts | TRA VFD provider | Simulate | Throws |
| AI | `AI_PROVIDER` = anthropic, openai, gemini, groq, openrouter; optional provider chain | AI off if not configured | AI off |
| Cards / PayPal | Snippe, MalipoPay Card, PayPal, toggled by `PAYMENT_ENABLE_*` | Per registry `isConfigured` | Not offered |

**Risk (Inferred):** because the safe/unsafe split depends on `NODE_ENV === "production"`, a production deployment started with `NODE_ENV` unset or mistyped would silently use simulate providers. `envCheck.js` guards some typos and requires `MOBILE_MONEY_PROVIDER` in production, but a hard assertion on `NODE_ENV` itself was not found.

## 2. Inventory

| ID | Integration | Purpose | Code | Configuration (names only) | Failure handling (Verified unless noted) |
|---|---|---|---|---|---|
| INT-01 | **MalipoPay** (mobile money) | Collect and refund mobile-money payments; disbursement capability flagged | `payment/providers/malipopay.provider.js` | `MOBILE_MONEY_PROVIDER`, `MOBILE_MONEY_API_BASE_URL`, `_API_KEY`, `_API_SECRET`, `_VENDOR_ID` | Webhook verified by SHA-256 over reference+timestamp+amount+phone+secret; missing secret rejects (HTTP 200 `success:false`); replay guard |
| INT-02 | **Selcom** | Alternative mobile-money provider | `selcom.provider.js`; `verifySelcomWebhook` | `SELCOM_WEBHOOK_SECRET`, optional `SELCOM_WEBHOOK_ALLOWED_IPS` | Static bearer token; IP allow-list optional (if empty, any source IP passes) |
| INT-03 | **AzamPay** | Alternative mobile-money provider | `azampay.provider.js` | `AZAMPAY_API_BASE_URL`, `_APP_NAME`, `_CLIENT_ID`, `_CLIENT_SECRET` | Webhook path not separately traced |
| INT-04 | **Snippe** | Cards / hosted checkout | `snippe.provider.js`, `app.js` raw route | `SNIPPE_API_BASE_URL`, `_SECRET_KEY`, `_WEBHOOK_SECRET`, `PAYMENT_ENABLE_SNIPPE` | Raw-body signature verification; unit tests for provider |
| INT-05 | **MalipoPay Card** | Card checkout (Visa, Mastercard, Amex, UnionPay flags) | `malipopayCard.provider.js` | `MALIPOPAY_CARD_API_BASE_URL`, `_SECRET_KEY`, `_WEBHOOK_SECRET`, `_ENVIRONMENT` | Raw-body signature verification |
| INT-06 | **PayPal** | International card/PayPal payments; USD | `paypal.provider.js` | `PAYPAL_CLIENT_ID`, `_CLIENT_SECRET`, `_MODE`, `PAYPAL_WEBHOOK_ID`, `PAYMENT_ENABLE_PAYPAL` | Verified through PayPal's verify-webhook-signature API |
| INT-07 | **Platform wallet** | Internal tender | `wallet` module | n/a | Ledger + reconciliation job |
| INT-08 | **Brevo** | Transactional and broadcast email; delivery events | `config/brevo.js`, `utils/sendEmail.js`, `emailOutbox`, `broadcast` | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_WEBHOOK_SECRET` | Outbox with retry job every 5 min; events webhook protected by shared-secret header. Legacy `EMAIL_HOST/USER/PASSWORD/PORT` in `.env.example` are **not read** by `src` (no SMTP library in dependencies). |
| INT-10 | **SMS gateway** | OTP and notifications | `sms/providers/gateway.provider.js` | `SMS_GATEWAY_API_KEY`, `_SECRET_KEY`, `_BASE_URL`, `_SENDER_ID`, `_WEBHOOK_SECRET` | Inbound webhook verified (`verifySmsWebhook`); delivery retry not traced |
| INT-11 | **WhatsApp Cloud API** | Order and OTP templates, inbound messages | `whatsapp/providers/cloudApi.provider.js` | `WHATSAPP_ACCESS_TOKEN`, `_PHONE_NUMBER_ID`, `_APP_SECRET`, `_VERIFY_TOKEN`, `_ORDER_TEMPLATE_*`, `_OTP_TEMPLATE_*` | `X-Hub-Signature-256` over raw body; GET challenge verification |
| INT-12 | **Web Push (VAPID)** | Browser notifications | `config/webPush.js`, `push_subscriptions` | `VAPID_PUBLIC_KEY`, `_PRIVATE_KEY`, `_SUBJECT` | Not traced (expired subscriptions handling) |
| INT-13 | **Cloudinary** | Media storage and delivery | `config/cloudinary.js`, `utils/cloudinary*.js` | `CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET` | Signed direct uploads; deletion helper |
| INT-14 | **OSRM** | Driving routes and ETA | `config/routing.js`, `utils/eta.js` | `OSRM_BASE_URL`, `OSRM_PROFILE`, `OSRM_TIMEOUT_MS`, `ROUTING_PROVIDER`, `ROUTING_FALLBACK_ENABLED` | Timeout then fallback estimate (`deliveries.routing_provider = fallback`). The default public OSRM demo server has usage limits (Inferred; check `OSRM_BASE_URL` in production). |
| INT-15 | **TRA VFD (EFD)** | Fiscal receipts and credit notes | `efd/providers/traVfd.provider.js` | `TRA_VFD_BASE_URL`, `TRA_VFD_API_KEY` | `efdRetry` job every 30 min; `efd_receipts` table. No tests located for the `efd` module. |
| INT-16 | **Google Sign-In** | Sign-in and sign-up prefill | `google-auth-library`; `auth` | `GOOGLE_CLIENT_ID` (backend), `VITE_GOOGLE_CLIENT_ID` (frontend) | Credential verified server-side; no test located |
| INT-17 | **AI providers** | Buyer assistant, search parsing, seller drafting, admin copilot | `ai/providers/*` | `AI_PROVIDER`, `AI_MODEL`, `AI_PROVIDER_BASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `AI_OPENROUTER_*` (all **missing from `.env.example`**) | Admin master switch `ai_enabled`; token caps per user and global; per-route `aiLimiter`; outcomes logged in `ai_usage_log`, `ai_call_outcomes` |
| INT-18 | **Redis / BullMQ** | Cache, delayed dispatch jobs | `config/redis.js`, `queues/dispatchQueue.js` | `REDIS_URL`, `REDIS_DISABLED`, `REDIS_TLS_REJECT_UNAUTHORIZED`, `CACHE_TTL_SECONDS` | Max one retry per request, limited reconnect, no offline queue; degrades to no cache |
| INT-19 | **ClamAV** | Antivirus scanning of uploads | `utils/malwareScan.js` | `CLAMAV_HOST`, `CLAMAV_PORT` | Optional; behaviour when unreachable not traced |
| INT-20 | **Sentry** | Error and trace reporting | `config/sentry.js`; frontend `@sentry/react` | `SENTRY_DSN`, `_ENVIRONMENT`, `_RELEASE`, `_TRACES_SAMPLE_RATE`, `VITE_SENTRY_*` | n/a |
| INT-21 | **Render deploy hook** | Rebuild static shells | `jobs/renderDeployHook.job.js` | `RENDER_DEPLOY_HOOK_URL` | Logs failure on non-OK response |
| INT-22 | **Google Analytics / Search Console** | Analytics and site verification | frontend `AnalyticsTracker`, `VITE_GA_MEASUREMENT_ID`, `VITE_GSC_VERIFICATION` | listed | Page views are sent only after consent is granted (`AnalyticsTracker.jsx`); GA is active only if `VITE_GA_MEASUREMENT_ID` is set |
| INT-23 | **GitHub** | CI, CodeQL, Dependabot, uptime check | `.github/` | n/a | **Absent from the delivered tree** (present in git index) |

## 3. Webhook endpoints (Verified)

`POST /api/v1/payments/webhooks/{malipopay, malipopay-card, paypal, selcom, snippe}`, `POST /api/v1/sms/webhook`, `GET|POST /api/v1/whatsapp/webhook`, `POST /api/v1/webhooks/brevo`. All reject when their secret is not configured (fail closed); the sole bypass is `ALLOW_UNSIGNED_WEBHOOKS=true` and it is ignored when `NODE_ENV=production`. Replay protection is in `webhook_replay_guard` with a nightly cleanup job.

## 4. Configuration gaps

| ID | Gap |
|---|---|
| INT-G1 | `.env.example` omits about two dozen variables the code reads, including all AI provider keys, `PAYMENT_ENABLE_*`, `PAYPAL_WEBHOOK_ID`, `PAYMENT_AMOUNT_TOLERANCE_PERCENT`, `PAYMENT_RECONCILIATION_DAYS`, `STALE_*_MINUTES`, `SUPPORT_EMAIL`, `ALLOW_PLATFORM_DATA_RESET*`, `DOCUMENT_URL_TTL_SECONDS` |
| INT-G2 | `.env.example` lists `EMAIL_*` SMTP variables that no code reads (stale) |
| INT-G3 | Provider contracts, sandbox credentials and webhook URLs registered with each provider are outside the repository (Owner Confirmation Required) |
| INT-G4 | Timeouts and retry policies for provider HTTP calls were not systematically audited |
