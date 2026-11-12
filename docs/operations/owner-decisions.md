# Owner decisions (decided on the owner's behalf, 2026-11-12)

The owner asked for these to be decided and implemented without touching the
GitHub repository. Each is a default that can be changed later; "Needs you"
marks what only the owner or a professional can supply.

| # | Topic | Decision | Status |
|---|-------|----------|--------|
| 1 | Original repo | Public repo `GervasCodes/nexora` has full history (113+ commits, last `688d91c`, 2026-11-08). Changes are delivered as zips of files, not pushed. | Needs you: apply the zips, confirm the deployed commit in Render. |
| 2 | API hosting | Always-on (Render `starter`). `render.yaml` added; the 10-minute uptime check stays as a backup. | Needs you: create the service from the blueprint, set secrets. |
| 3 | Payout/refund approval | Payouts at or above 1,000,000 TZS need two different admins (`PAYOUT_DUAL_APPROVAL_THRESHOLD`, 0 = off). Smaller payouts, and any rejection, need one admin. Migration 162. | Done and tested. Needs you: run migration 162; the admin screen shows the API message "First approval recorded" (no UI change yet). |
| 4 | Legal opinion | Not something code can settle. Ask a Tanzanian lawyer about holding customer balances and the Personal Data Protection Act before live payments. | Needs you. |
| 5 | Retention, SLA, browsers | Suggested: orders and payment records 7 years (tax records), chat 2 years, logs 90 days, approved verification files per the admin setting. SLA: dispute checkpoints at 12h and 20h as built. Browsers: last 2 versions of Chrome, Safari, Samsung Internet; Android Chrome 100+. | Not implemented: retention jobs delete data and could not be tested without a database. Confirm the periods with your accountant first. |
| 6 | Backup window | Sunday 02:00-04:00 EAT, after a tested restore. | Not implemented: encryption of payout details and `users.phone` rewrites live rows and needs a database to rehearse. |
| 7 | Breached-password check | No online service. Passwords are checked offline against a local list (about 200 common passwords, case-insensitive) plus pattern rules. Nothing leaves the server. | Done. |
| 8 | Support email | Moves to a company mailbox by configuration only: backend `SUPPORT_EMAIL`, frontend `VITE_SUPPORT_EMAIL`. The AI assistant now reads the same variable. | Done. Needs you: the address. `company-information.md` still shows the Gmail address until you give it. |
