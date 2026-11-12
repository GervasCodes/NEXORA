# Security and Privacy Specification

> **Note 2026-11-11.** Snippe and MalipoPay were removed from the code. The live gateways are AzamPay, Selcom, PawaPay (mobile money and card) and PayPal; references below to the retired two describe the audited state or legacy rows only.

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Nature | A **documentation audit**, not a penetration test or formal security review. Controls are described from source reading and the checks listed in section 8. No credentials, tokens or personal data were accessed or are reproduced here. |
| Labels | Verified control / Observation (weakness or gap, severity **Proposed** by this audit) / Recommended (not implemented) |

## 1. Verified controls

| ID | Control | Evidence |
|---|---|---|
| SEC-001 | **Sessions.** JWT (HS256 default, 7-day lifetime) in an HTTP-only cookie (`Secure` and `SameSite=None` in production, `Lax` otherwise) or Bearer header. Every request re-checks the account in the DB; a `token_version` bump revokes all sessions; suspended or inactive accounts are refused. | `sessionCookie.js`, `generateToken.js`, `auth.middleware.js`; `auth.sessionCookie.test.js` |
| SEC-002 | **CSRF.** Double-submit token (`nexora_csrf` cookie = `X-CSRF-Token` header, timing-safe compare) for cookie-authenticated unsafe requests; skipped for Bearer requests and listed pre-login endpoints. | `csrf.middleware.js` |
| SEC-003 | **Login hardening.** Mandatory email OTP second step; progressive lockout (5 failures per level, 5/15/60 min), checked before bcrypt; OTP 5-minute expiry, resend throttle, request cap; OTP stored as `code_hash`; auth endpoints limited to 20 per 15 min per IP; `returnTo` restricted to internal paths. | `login.service.js`, `loginLockout.service.js`, `otp.service.js`, `rateLimit.middleware.js`, `Login.jsx`; tests |
| SEC-004 | **Password storage.** bcrypt cost 10. | `hashPassword.js` |
| SEC-005 | **Authorization.** `authorize(role)`, approval guards, `requireSuperAdmin`, `requireFeature`, module maintenance gates on 575 endpoint declarations; 77 have no auth guard (public by design or limiter-only, reviewed in `api-documentation.md` section 5). | `roles-permissions.md` |
| SEC-006 | **Webhook security.** Fail-closed when a secret is missing in any environment; signature or secret verification per provider; raw-body signatures for Snippe, MalipoPay Card, PayPal, WhatsApp; replay guard table; unsigned bypass only with an explicit flag and never in production. | `webhookAuth.middleware.js`, `app.js`; `webhookAuth.*.test.js`, `payment.webhooks*.test.js` |
| SEC-007 | **Input validation.** express-validator chains on routes (52 validator files); registration, account, auth, wallet and others validated server-side. | `*.validator.js` |
| SEC-008 | **Upload safety.** Content-type sniffing (`fileContentValidator`), image re-processing (`imageSanitize.js`, sharp), optional ClamAV scan, signed direct-to-Cloudinary uploads. | `utils/`, middleware; unit tests pass |
| SEC-009 | **Security headers (API).** helmet with a deny-by-default CSP, nonce for the single inline style in `/health`, `frame-ancestors 'none'`, same-site CORP. | `app.js` (helmet block) |
| SEC-010 | **Abuse control.** Global limiter (600 / 15 min / IP), AI limiter, report limiters, username-check limiter; `trust proxy` hop count configurable so IP-based limits and allow-lists are not spoofable by header padding. | `rateLimit.middleware.js`, `app.js` |
| SEC-011 | **Audit trail.** `audit_logs` for login failures, admin account creation and level changes, and other events; admin notifications for sensitive admin changes. | `audit` module, `admin.service.js` |
| SEC-012 | **PII encryption (partial).** Payer phone numbers kept for refunds are AES-256-GCM encrypted (`payments.payer_phone_encrypted`). | `phoneEncryption.js` |
| SEC-013 | **Fraud and reconciliation.** `fraud_flags`, `wallet_reconciliation_flags`, payment review queue, nightly reconciliation jobs. | schema, jobs |
| SEC-014 | **Destructive-operation guard.** Platform data reset requires super admin, an approval record, and environment flags (`ALLOW_PLATFORM_DATA_RESET`, `_REAL`). | `dataReset` module |
| SEC-015 | **Secrets handling.** Secrets are environment variables; startup check requires the essentials; a regex scan of the delivered tree for common key formats found **no hard-coded secrets**; `.env` is git-ignored. | `envCheck.js`; scan 2026-10-29 |
| SEC-016 | **Observability.** Request ids, structured logs, Sentry. | `requestLogger.middleware.js`, `sentry.js` |

## 2. Observations (weaknesses and gaps)

Severity is **Proposed** (H/M/L) and based on code evidence, not exploitation.

| ID | Sev | Observation | Evidence | Recommended control |
|---|---|---|---|---|
| SECF-01 | H | **Dependency advisories.** `npm audit --omit=dev` on 2026-10-29: backend 4 (2 high: `multer` DoS via pending async fileFilter, `body-parser` DoS via trailing bytes after a compressed body; 2 moderate: `qs`, `ip-address`), frontend 1 high (`follow-redirects` credential-header handling; transitively via axios, and likely not reachable in a browser build, Inferred). All have fixes available. `DEPENDENCY_UPDATE_CHANGELOG.md` claims a clean audit, so it is out of date. | `npm audit` | Update `multer`, `body-parser`, `qs`, `ip-address`, `follow-redirects`; run audit in CI |
| SECF-02 | M | **Encryption key derived from `JWT_SECRET`.** The payer-phone key is `SHA-256(JWT_SECRET)`. Rotating the JWT secret makes stored ciphertext undecryptable, and one leaked secret exposes both sessions and PII. The code comment itself suggests a dedicated key. | `phoneEncryption.js:15-26` | Introduce `PHONE_ENCRYPTION_KEY` with versioning and a migration |
| SECF-03 | M | **Payout details stored in plain columns.** `withdrawal_requests.payout_phone`, `payout_account_number`, `payout_account_name`, `payout_details` are plain `varchar`; masking exists for display (`maskPayout.js`) but no at-rest encryption was found. `users.phone` is also plain. | schema | Encrypt or tokenise payout destinations; limit admin read access |
| SECF-04 | M | **Database TLS may be unverified.** With `DB_SSL=true` and no CA, certificates are not validated unless `DB_SSL_REJECT_UNAUTHORIZED=true`. | `config/db.js` | Require a CA and enable verification in production; same for Redis (`REDIS_TLS_REJECT_UNAUTHORIZED` defaults to verify, good) |
| SECF-05 | M | **Single 7-day token, no refresh or device list.** Revocation exists (`token_version`) but there is no per-session revocation, and admins use the same 7-day sessions. | `generateToken.js` | Shorter admin sessions; session list and revoke |
| SECF-06 | M | **Password policy is length-only.** Server accepts any 8+ character password (no maximum, no breached-password check); bcrypt silently truncates input beyond 72 bytes. The UI has a strength meter that the server does not enforce. | `auth.validator.js:25-28`, `account.validator.js:54` | Add complexity/breached-list check and a 72-byte cap |
| SECF-07 | L | **Selcom webhook uses a static bearer token and the IP allow-list is optional** (empty list allows any source). | `webhookAuth.middleware.js:40-47` | Make the allow-list mandatory in production; consider signature if provider supports |
| SECF-08 | L | **Account enumeration via lockout.** Unknown emails return 401 and never lock, while real accounts return 429 after 5 failures, so an attacker can tell which emails exist. | `login.service.js` | Apply uniform throttling by IP+email key |
| SECF-09 | L | **Maintenance middleware fails open** when its status lookup throws. | `maintenance.middleware.js` | Acceptable for availability; log and alert |
| SECF-10 | L | **Debug route in production code.** `GET /db-test` (admin only) probes the DB. | `app.js:262` | Remove or disable in production |
| SECF-11 | L | **CORS defaults to `*` if `CORS_ORIGIN` is unset** (with credentials true, browsers refuse credentialed wildcard, so impact is limited; still a misconfiguration trap). | `app.js:114-118` | Fail startup in production when unset |
| SECF-12 | M | **32 SQL statements interpolate fragments** (`${...}`) in 18 files (dynamic `SET`/`WHERE`/column lists in admin, pickup point, delivery business, monetization and others). Sampled cases pass values as parameters; **column and clause fragments were not each verified against allow-lists.** | grep scan | Review each; centralise a safe dynamic-update helper |
| SECF-13 | M | **Simulate providers depend on `NODE_ENV`.** A production process with `NODE_ENV` unset/mistyped would use simulated payment, SMS, WhatsApp and TRA providers. | `integrations.md` section 1 | Assert `NODE_ENV` at boot; block simulate when `DATABASE host` is non-local |
| SECF-14 | M | **Object-level authorization not audited.** Route guards are consistent, but ownership checks (order, booking, document, conversation) live in services and were only sampled. | `roles-permissions.md` ACL-003 | Dedicated IDOR review and tests per resource |
| SECF-15 | L | **`.env.example` is git-ignored** (`backend/.gitignore`), so it is not versioned, and it omits about two dozen variables. | `.gitignore`, `integrations.md` INT-G1 | Track the example file and keep it complete |
| SECF-16 | L | **Missing CI and security scanning.** CodeQL, Dependabot config and CI workflows are in git's index but absent from the delivered tree. | KNOWN-004 | Restore `.github/` |
| SECF-17 | L | **Frontend header policy is documented but not deployable from the repo.** `docs/FRONTEND_CSP.md` gives the CSP to paste into the Render dashboard (no `unsafe-inline` for scripts, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; but `style-src 'unsafe-inline'`, and allows Google, Google Tag Manager/Analytics, Sentry, Cloudinary, OpenStreetMap, unpkg, Unsplash and YouTube hosts). `frontend/public/_headers` is absent, and other headers (HSTS, frame options, referrer policy) are not documented. What is actually deployed was not verified. | `docs/FRONTEND_CSP.md`, `docs/DEPLOYMENT.md` | Version the full header policy; drop unneeded third-party hosts (e.g. unpkg, Unsplash) and inline styles where feasible |
| SECF-18 | L | **Uptime and SLA claims unmonitored in this tree.** | `SLA.md` | Restore uptime workflow or external monitor |

## 3. Privacy and data protection

**Personal-data footprint (heuristic from column names; see `data-dictionary.md`)**

| Category | Columns | Tables | Notable locations |
|---|---|---|---|
| Contact PII (email, phone, address, coordinates) | 46 | 18 | `users`, `buyer_addresses`, `orders`, `payments`, `seller_profiles`, `pickup_points`, `stock_customers`, `stock_suppliers`, `support_tickets`, `email_outbox`, `whatsapp_sessions`, `audit_logs` |
| Government/ID documents | 11 | 7 | `account_verification_documents`, `kyc_upgrade_requests`, `business_verification_requests` |
| Financial | 112 | 49 | wallets, payments, withdrawals, orders |
| Credentials/secrets | 15 | 14 | `users.password` (bcrypt), `otp_codes.code_hash`, `token_version`, push subscription keys |
| Location tracking | n/a | n/a | `users.current_lat/lng` for agents (and buyers who share location), delivery tracking |

| ID | Topic | Finding | Status |
|---|---|---|---|
| PRIV-001 | Consent | Registration requires explicit acceptance of Terms and Privacy Policy (stored with version and timestamp); checkout stores consent; analytics page views are sent only after the user grants consent (`AnalyticsTracker.jsx`, `CookieConsentBanner.jsx`, `utils/analytics.js`). | Verified (code) |
| PRIV-002 | Legal basis and policy text | Terms, Privacy, Cookie, Refund policies exist as app content but carry template notices pending legal review. Whether they comply with Tanzania's personal data protection law is **not assessed** (legal opinion required). | Owner Confirmation Required |
| PRIV-003 | Deletion | Users can soft-delete and later permanently delete accounts (migrations 056-057, `dataReset`, `account` module). Exact data removed vs retained (orders, payments, audit logs) is **not documented**. | Verified (feature); policy Not verified |
| PRIV-004 | Retention | `approved_document_retention_days` (default 0) and a daily retention job exist for verification documents; no retention periods are defined for orders, chat, audit logs, location history or email events (`seoMetricsCleanup`, `otpCleanup`, `webhookReplayCleanup` clean technical data only). | Verified (documents); others Not defined |
| PRIV-005 | Access to documents | Guarded `documentAccess` routes and `PrivateDocumentLink`, short-lived URLs (`DOCUMENT_URL_TTL_SECONDS`). Storage-level privacy not verified. | Verified (route); storage Not verified |
| PRIV-006 | Data sharing | Personal data flows to Cloudinary, Brevo, SMS gateway, Meta WhatsApp, payment providers, AI providers (prompts may contain buyer/seller content), Sentry and Google. Data-processing agreements and AI data policies were not reviewed. | Owner Confirmation Required |
| PRIV-007 | Logging | Request logs, `audit_logs.metadata` and Sentry may contain emails and IPs. Redaction was not audited. | Not verified |
| PRIV-008 | Data subject requests | No export-my-data feature was identified. | Not verified (absence of evidence) |

## 4. Backup, recovery and incident response

Existing mechanisms: `database/backup.js` and `restore.js` scripts, `docs/ROLLBACK.md`, and the backup item in the `docs/DEPLOYMENT.md` pre-launch checklist (line 242). No dedicated backup/recovery document exists. Managed-database backups (Aiven) are **Stated**, not verified; RTO/RPO are **not defined**. No incident-response runbook or security contact (`SECURITY.md`) was found other than `SECURITY_MAINTENANCE.md`, which is in git's index but missing from the delivered tree. See `operations/maintenance-recovery.md`.

## 5. Recommended security requirements (Proposed)

SEC-R01 patch all advisories and run `npm audit` in CI; SEC-R02 dedicated encryption keys and encryption of payout destinations; SEC-R03 mandatory DB TLS verification in production; SEC-R04 stronger password policy and admin session hardening (shorter lifetime, optional second factor beyond email OTP); SEC-R05 assert production mode and forbid simulate providers there; SEC-R06 object-level authorization test suite; SEC-R07 review of dynamic SQL fragments; SEC-R08 documented retention and deletion policy; SEC-R09 versioned security headers for the frontend host; SEC-R10 external penetration test before accepting live payments.

## 6. Pre-launch security checklist already in the repository

`docs/DEPLOYMENT.md` section 5 ("Before accepting real payments") and section 6 (pre-launch checklist), `docs/SECURITY_REVIEW_CHECKLIST.md`, `docs/WEBHOOK_VALIDATION.md`. These were read for context but their individual checkboxes were not re-verified.

## 7. Contradictions recorded

| Item | Statement | Reality |
|---|---|---|
| Dependency audit | `DEPENDENCY_UPDATE_CHANGELOG.md` implies a clean state | 5 production advisories on audit date |
| Login OTP | `openapi.yaml` calls the OTP step optional | OTP is mandatory for password login |

## 8. Checks actually performed for this document

Source reading of the files cited; `npm audit --omit=dev` (both packages); regex scan for common secret formats; grep scans for SQL interpolation and env usage; boot of the backend against a throwaway DB with 8 endpoint probes (public 200, protected 401); backend unit (118 suites, 1,632 tests) and integration (11 suites, 96 tests) suites passed. **Not performed:** dynamic testing, fuzzing, authorization bypass testing, provider sandbox tests, infrastructure review.
