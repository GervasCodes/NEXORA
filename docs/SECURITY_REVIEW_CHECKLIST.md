# Security Review Checklist

Phase 3 (External Review Readiness) deliverable. A self-assessment
against the codebase as it stands, intended as the starting point for an
external security reviewer — not a substitute for one. Each item is
marked against what's actually implemented today, with a file reference
so a reviewer can verify the claim directly rather than take it on
faith.

Status legend: ✅ Implemented · ⚠️ Partial / needs reviewer judgment ·
❌ Not implemented / known gap.

Last verified against commit `865ce08` (2026-08-25). Claims in this
document reflect the codebase as of that commit — re-verify against
`git log` / `git diff` if it's meaningfully older than the code you're
reviewing.

## 1. Authentication & session management

| Item | Status | Notes |
|---|---|---|
| Password hashing | ✅ | bcrypt, `auth.service.js` |
| JWT session tokens | ✅ | `backend/src/middleware/auth.middleware.js`; short-lived pre-auth/reauth tokens carry a `typ` claim and are rejected as general session tokens |
| Fresh account-status check per request | ✅ | `auth.middleware.js` re-checks `is_active`/suspension from the DB on every request rather than trusting a 7-day JWT — closes the "still-valid token after account suspended/deleted" gap |
| Auth endpoint rate limiting | ✅ | `authLimiter` — 20 req/15min/IP on login/OTP (`rateLimit.middleware.js`) |
| General API rate limiting | ✅ | `apiLimiter` — 600 req/15min/IP platform-wide |
| Role-based authorization | ✅ | `authorize.middleware.js`, checked per-route (`admin`/`super_admin`/`seller`/`buyer`/`agent`) |
| Password reset / OTP flow abuse resistance | ✅ | Same `authLimiter` covers OTP verify/resend |
| Session revocation on password change | ✅ | Confirmed: `account.repository.js#updatePassword` bumps `token_version` in the same query as the password update; `auth.middleware.js` rejects any token whose `tv` claim doesn't match the current DB value |
| Session revocation on admin permission change | ✅ | `authorize.middleware.js`/`requireSuperAdmin.middleware.js` trust `role`/`admin_level` straight off the JWT with no independent DB check (unlike the account-status check above) — a permission change only takes effect immediately if it also bumps `token_version`. Fixed: `admin.repository.js#updateAdminLevel`/`revokeAdmin` now bump `token_version` in the same query, same pattern as password change. Before this fix, a demoted/removed admin kept their old JWT's access (including super-admin powers) for up to its remaining 7-day life — see `tests/unit/admin/admin.repository.security.test.js` |
| Socket.IO handshake re-checks account status, not just JWT signature | ✅ | Phase 2: `socket.js#io.use` now calls the same `authRepository.findAccountStatusById` fresh DB check as `auth.middleware.js` (`is_active`/suspension/`token_version`) before allowing the connection at all — closes the "signature-valid-but-suspended/stale-tv token still opens a socket" gap; see `PHASE2_SECURITY_CHANGELOG.md`. Room-level authorization itself (`assertParticipant`/`assertCanTrackOrder`/`admins` role gate) was already in place and unchanged |

## 2. Payments & webhooks

| Item | Status | Notes |
|---|---|---|
| Webhook authentication (MalipoPay/Selcom) | ✅ | Shared-secret header, fail-closed in production — `webhookAuth.middleware.js`; see `docs/WEBHOOK_VALIDATION.md` §1 |
| Webhook authentication (Snippe) | ✅ | HMAC-SHA256 over raw body, constant-time comparison — `snippe.provider.js`; see `docs/WEBHOOK_VALIDATION.md` §2 |
| PayPal capture trust boundary | ✅ | Capture confirmed server-side via PayPal's own API response, not the client redirect — `docs/WEBHOOK_VALIDATION.md` §3 |
| Webhook idempotency (no double-credit on retry) | ✅ | `payment.status === 'completed' \|\| 'failed'` short-circuit in both `_handleOrderPaymentWebhook` and `_handleBookingPaymentWebhook` |
| Open-redirect protection on payment return URLs | ✅ | `assertAllowedRedirect` in `payment.controller.js` validates `successUrl`/`cancelUrl`/`returnUrl` origins against `CORS_ORIGIN` |
| Seller funds held until delivery + dispute window (escrow) | ✅ | `held_balance`/`balance` split, `escrowRelease.job.js` — see `docs/ESCROW_PAYMENT_FLOW.md` |
| Webhook replay protection beyond idempotency (nonce/timestamp) | ✅ | Phase 2: timestamp-freshness check (where a provider supplies one) + SHA-256 payload-hash dedup against `webhook_replay_guard` (migration 072) for all three providers — `utils/webhookReplayGuard.js`, wired into `webhookAuth.middleware.js` (MalipoPay/Selcom) and `payment.controller.js#snippeWebhook` (Snippe) — see `PHASE2_SECURITY_CHANGELOG.md` |
| Provider payload shape verified against live sandbox | ⚠️ | MalipoPay/Selcom field names follow commonly documented patterns, not confirmed against real provider docs/sandbox — see `docs/WEBHOOK_VALIDATION.md` §6 |
| Withdrawal amount validated against available balance | ✅ | `requestWithdrawal` rejects `amount > wallet.balance`; `held_balance` isn't withdrawable by construction |

## 3. Input validation & injection

| Item | Status | Notes |
|---|---|---|
| SQL parameterization | ✅ | Spot-checked across repositories (e.g. `product.repository.js`) — all queries use `?` placeholders via `mysql2`, no string-concatenated SQL found in the sampled files |
| Request body/query validation | ✅ | Per-module `*.validator.js` files (e.g. `payment.validator.js`) |
| File upload type/size restriction | ✅ | `multer` memory storage, 5 MB limit, MIME-type allowlist (`image/*`) — `upload.middleware.js`; separate middlewares exist for video/audio/document/chat-attachment uploads with their own limits |
| Uploaded file content validated server-side (not just MIME sniffing) | ✅ | Phase 2: magic-byte content classifier (`utils/fileContentValidator.js`) runs after multer buffers the file, independent of the client-reported `mimetype` — wired into all five upload middlewares via `utils/wrapUploadMiddleware.js`; see `PHASE2_SECURITY_CHANGELOG.md` |
| Open redirect protection (general, beyond payment return URLs) | ⚠️ | Confirmed for payment flows (§2); reviewer should check any other user-supplied-URL redirect surfaces |

| Non-timing-safe secret comparison surface | ✅ | Spot-checked every `=== `/`!== ` secret comparison in `backend/src`: the only one was the unused `verifySharedSecretHeader` fallback in `webhookAuth.middleware.js` (not wired to any route). Fixed to use `crypto.timingSafeEqual` with a length check, matching the two live webhook verifiers next to it — see `tests/unit/webhookAuth.middleware.test.js` |

| Item | Status | Notes |
|---|---|---|
| HTTPS-only in production | ⚠️ | Enforced at the hosting/reverse-proxy layer (Render), not in application code — reviewer should confirm the deployment target terminates TLS and doesn't accept plaintext HTTP |
| Security headers | ✅ | `helmet()` — HSTS, `X-Content-Type-Options`, `X-Frame-Options`, etc. CSP re-enabled and scoped in Phase 2 (`default-src 'none'`, per-response nonce for `/health`'s one inline `<style>` block) — see `PHASE2_SECURITY_CHANGELOG.md`. Frontend (separately deployed, Netlify) gets its own scoped CSP via `frontend/public/_headers`, also added in Phase 2 — the `connect-src` origin there needs a manual production value; see that file's header comment |
| CORS restricted to known origins in production | ✅ | `CORS_ORIGIN` env var, comma-separated allowlist; falls back to `*` only if unset (dev default) — `.env.example` calls out setting it explicitly in production |
| `trust proxy` configured correctly for rate limiting | ✅ | `app.set("trust proxy", 1)` — trusts exactly one hop (the platform's own proxy), not the full `X-Forwarded-For` chain, preventing IP-spoofing around rate limits |
| Response compression | ✅ | `compression()` — not a security control, noted for completeness |
| Debug/introspection routes gated | ✅ | `/db-test` requires `admin` auth, not publicly reachable |

## 5. Secrets & configuration

| Item | Status | Notes |
|---|---|---|
| `.env` files gitignored | ✅ | Confirmed in `backend/.gitignore` / `frontend/.gitignore` |
| `.env.example` kept in sync with actual `process.env.*` usage | ✅ | Cross-checked in Phase 2 (`PHASE2_CHANGELOG.md`) |
| No secrets committed in example files | ✅ | `.env.example` values are placeholders/blank |
| JWT secret rotation guidance documented | ✅ | `.env.example` notes rotating `JWT_SECRET` invalidates every session |
| Known `.env` misconfigurations flagged (not fixed, since `.env` is out of source control) | ⚠️ | `AADMIN_EMAIL` typo and unset `MOBILE_MONEY_PROVIDER` — flagged in `PHASE2_CHANGELOG.md`, not resolved (requires an operator decision, not a code change) |

## 6. Dependency & static analysis (CI)

| Item | Status | Notes |
|---|---|---|
| Automated dependency vulnerability scanning | ✅ | `npm audit --audit-level=moderate` in CI for backend/frontend/database — `.github/workflows/ci.yml` (Phase 1) |
| Automated dependency update PRs | ✅ | Dependabot, weekly, grouped minor/patch — `.github/dependabot.yml` (Phase 1) |
| Static application security testing (SAST) | ✅ | GitHub CodeQL, `security-extended` query pack, on push/PR + weekly schedule — `.github/workflows/codeql.yml` (Phase 1) |
| CI blocks merge on lint/test/audit failure | ✅ | `ci.yml` runs lint → test → audit per package |
| Uptime / availability monitoring | ✅ | `uptime-check.yml` + external monitor guidance — `docs/UPTIME_MONITORING.md` (Phase 1) |

## 7. Logging, monitoring & incident visibility

| Item | Status | Notes |
|---|---|---|
| Structured logging with credential redaction | ✅ | `pino`-based logger redacts `password`/`token`/`authorization`/cookies — `backend/src/utils/logger.js` (Phase 2) |
| Error tracking / alerting | ✅ | Sentry, conditional on `SENTRY_DSN` being set — `backend/src/config/sentry.js` (Phase 2) |
| Payment/webhook failures specifically monitored | ✅ | Wallet-credit failure paths report to Sentry with order/booking id attached — highest-value addition in Phase 2, per its changelog |
| Log/alert noise discipline (forgeries vs. real bugs) | ✅ | Rejected webhooks logged at `warn`, not `error`/exception-tracked — see `docs/WEBHOOK_VALIDATION.md` §5 |
| Per-request correlation id | ✅ | `X-Request-Id`, generated by `requestLogger.middleware.js`, echoed to the client |

## 8. Data integrity & business-logic safeguards

| Item | Status | Notes |
|---|---|---|
| Seller payout timing tied to delivery + dispute window | ✅ | Escrow model — see `docs/ESCROW_PAYMENT_FLOW.md` |
| Dispute-side clawback can't drive a wallet negative | ✅ | Resolved in the escrow model — refunds during an open dispute reduce `held_balance` (nothing to claw back from `balance`, since it was never released) — see `docs/ESCROW_ANALYSIS.md` §1 step 5 and §3.2 |
| Multi-vendor (parent/child) order payment status kept consistent | ✅ | `updatePaymentStatusForChildren`, per-child wallet crediting — `payment.service.js` |
| Retroactive/historical escrow handling documented | ✅ | Recommendation (leave historical balances untouched) recorded in `docs/ESCROW_ANALYSIS.md` §4 |

## 9. Out of scope for this review pass

Flagged so an external reviewer knows what wasn't examined here, rather
than assuming silence means "checked and fine":

- Frontend XSS surface: spot-checked for `dangerouslySetInnerHTML` and
  similar React escape hatches — none found in `frontend/src` as of
  this pass. Not a full re-audit of every render path. As of Phase 4
  (Testing & Session Hardening) the session token itself no longer
  travels through JS-accessible storage: it lives in an httpOnly cookie
  set by the server, so an XSS bug can't read it directly via
  `document.cookie` or `localStorage` — see `frontend/src/api/client.js`
  and `backend/src/utils/sessionCookie.js`. The double-submit CSRF token
  (`nexora_csrf`) that pairs with it is deliberately *not* httpOnly (the
  frontend has to read and echo it back as an `X-CSRF-Token` header —
  see `csrf.middleware.js`), so an XSS bug could still exfiltrate the
  CSRF token; combined with the httpOnly session cookie, that alone
  isn't enough to forge a session from a different origin, but is still
  worth re-checking whenever a new HTML-rendering feature is added.
- Infrastructure/hosting-level review (network segmentation, database
  access controls, backup encryption) — outside this repo's scope.
- Penetration testing / dynamic testing of any kind. This checklist is a
  static, code-level self-assessment only.

## How to use this checklist

This is meant to accompany `docs/ARCHITECTURE_REVIEW.md` and
`docs/WEBHOOK_VALIDATION.md` as the starting packet for an external
security/architecture reviewer. Each ⚠️/❌ item above is a concrete,
actionable follow-up — treat this document as a punch list, not a
certification that NEXORA has been independently audited.
