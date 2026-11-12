# Maintenance, Backup and Recovery Guide

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Structure | Part A: mechanisms that **exist** in the repository (Verified from code or existing docs). Part B: **recommendations** (Proposed). No backup or restore was performed against real data. |

# Part A - Existing mechanisms

## A1. Monitoring and logs

| Mechanism | Detail | Status |
|---|---|---|
| Health endpoint | `GET /health`: runs `SELECT 1`; 200 `ok` or 503 `degraded`; HTML for browsers, JSON otherwise. Redis, queue and providers are not checked. | Verified |
| Public status page | `GET /api/v1/status`, `/status` page; incidents curated by admins at `/admin/status-incidents` (`status_incidents`) | Verified |
| Logs | pino structured logs, one request id per request (`X-Request-Id`), level via `LOG_LEVEL` | Verified |
| Error tracking | Sentry on backend and frontend (needs DSNs) | Verified (config) |
| Audit trail | `audit_logs` (login failures, admin changes, others); admin notification feed | Verified |
| Uptime check | GitHub workflow described in `docs/UPTIME_MONITORING.md` | **Workflow absent from delivered tree** |
| Business metrics | GMV, take rate, retention, DAU/WAU/MAU in the admin dashboard | Verified (`docs/ACTIVE_USERS_METRIC.md`) |
| Fraud and reconciliation | `fraud_flags`, `wallet_reconciliation_flags`, `payment_review_queue` | Verified (schema, jobs) |

## A2. Scheduled jobs (live scheduler `backend/src/jobs/index.js`, 24 jobs)

Each runs through `safeRun` (errors are logged, not fatal) with a MySQL advisory lock so replicas do not double-run. Times are server time (confirm the server timezone). The **Purpose** column is **Inferred** from job names and brief reading, not from tracing each job; the schedules themselves are Verified.

| Schedule (cron) | Job | Purpose |
|---|---|---|
| `* * * * *` | departmentMaintenanceSchedule | Apply scheduled module maintenance windows |
| `*/5 * * * *` | deliveryRematch | Re-dispatch unanswered delivery offers |
| `*/5 * * * *` | emailRetry | Retry failed email outbox rows |
| `*/15 * * * *` | bookingExpiry, disputeSla, groupBuyExpiry, staleOrders | Expire unpaid bookings and orders, dispute SLA, group buys |
| `*/30 * * * *` | codAutoConfirm, efdRetry, supplyNudge | COD auto-confirm (48 h rule), TRA receipt retries, supply nudges |
| `0 * * * *` | featuredStoreExpiry, sponsorshipExpiry | Promotion expiry |
| `10 * * * *` | bookingLifecycle | Booking state progression |
| `15 * * * *` | escrowRelease | Release held funds (BR-024) |
| `20 * * * *` | rewardSettlement | Affiliate/loyalty settlement |
| `0 */6 * * *` | renderDeployHook | Rebuild static SEO shells (needs `RENDER_DEPLOY_HOOK_URL`) |
| `0 3 * * *` | otpCleanup | Purge expired OTPs |
| `10 3 * * *` | webhookReplayCleanup | Purge old replay-guard rows |
| `20 3 * * *` | walletReconciliation | Compare ledger and balances; raise flags |
| `30 3 * * *` | documentRetention | Remove verification documents per retention setting |
| `40 3 * * *` | seoMetricsCleanup | Purge old web-vitals/search metrics |
| `30 2 * * *` | subscriptionLifecycle | Renew/expire subscriptions |
| `0 4 * * *` | paymentReconciliation | Reconcile payments with providers |
| `0 6 * * *` | fuelCapReminder | Daily check that raises the fuel-cap reminder |

**Defined but not scheduled by the live scheduler:** `lowStockAlerts` (hourly), `preorderReminders` (hourly), `draftCleanup` (daily) (all three are in the unused `jobs.index.js`), and `monetizationSchedule` (every minute per its service comment; in neither file); see KNOWN-003. `departmentSponsorshipExpiry.job.js` is unreferenced and requires a missing module.

Run mode: in-process in `server.js` by default, or in `worker.js` when `RUN_JOBS_IN_PROCESS=false` on the web process.

## A3. Backup and restore tooling

| Item | Detail |
|---|---|
| `database/backup.js` (`npm run backup` in `database/`) | Uses `mysqldump` with the same `DB_*` variables as the migrator; writes a timestamped gzip dump to `database/backups/` or `--out <dir>`. The `database/backups/` folder does not exist in the delivered tree. |
| `database/restore.js` (`npm run restore`) | Restores a dump (usage not re-read in detail) |
| Managed backups | Aiven MySQL backups are **stated** by `docs/DEPLOYMENT.md`; plan, retention and restore test **not verified** |
| Rollback runbook | `docs/ROLLBACK.md`: Render code rollback (does not revert DB), DB restore for schema/data issues |
| Migration safety | Forward-only; `schema_migrations` tracks applied files; `migrate.js --status` |

## A4. Maintenance operations available in the app

Admin can switch modules into maintenance (`platform_modules`, messages shown to users), schedule maintenance windows, post status incidents, suspend users, and (super admin, guarded by environment flags and an approval record) run platform data reset. Settings changes through `/admin/settings` take effect without deploys.

# Part B - Recommendations (Proposed)

| ID | Recommendation | Why |
|---|---|---|
| OPS-R01 | Define RTO/RPO and backup frequency; take automated backups; **perform and record a restore drill** to a staging database. | None defined; restore never evidenced |
| OPS-R02 | Keep at least one off-platform backup copy with retention and access control; backups contain PII and ID-document references. | Data protection |
| OPS-R03 | Add Redis and queue health to `/health` and alert on failures; keep `/health` cheap. | Silent degradation |
| OPS-R04 | Restore the uptime check or use an external monitor; alert on `/health` and on payment webhook failures. | SLA text not backed |
| OPS-R05 | Alert on job failures (`safeRun` logs errors only) and on missing ticks for money jobs (`escrowRelease`, `paymentReconciliation`, `walletReconciliation`). | Money correctness |
| OPS-R06 | Daily review queue: `payment_review_queue`, `wallet_reconciliation_flags`, `fraud_flags`, refunds in `manual_required`, withdrawals `pending`/`approved`. | Manual money steps |
| OPS-R07 | Weekly: dependency audit, Sentry triage, check disputes nearing SLA. Monthly: review fuel cap, provider credentials expiry, retention jobs. | Hygiene |
| OPS-R08 | Incident response runbook: contacts, severity levels, provider status pages, user communication via status incidents and broadcasts, post-incident review. | None exists beyond `ROLLBACK.md` |
| OPS-R09 | Log retention and redaction policy; confirm Sentry and logs do not capture personal data. | PRIV-007 |
| OPS-R10 | Document capacity assumptions and review DB pool saturation warnings. | NFR-008 |

## B1. Suggested restore procedure outline (to be validated in staging)

1. Declare incident; enable maintenance for affected modules.
2. Identify the last good backup and the time of corruption.
3. Restore into a fresh database; verify `schema_migrations` against the code version.
4. Re-run `walletReconciliation` and `paymentReconciliation`; check `wallet_reconciliation_flags`.
5. Replay provider webhooks missed during the gap using provider dashboards (replay guard prevents double processing).
6. Switch the app to the restored database, smoke-test, lift maintenance, publish a status incident update.
