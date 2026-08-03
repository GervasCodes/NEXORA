# SLA Targets & Public Status Page (Phase 3c)

Part of the Revenue & Product Enhancements roadmap.

## SLA targets

Published on the public `/status` page:

| Target | Commitment |
|---|---|
| Platform uptime | 99.5% monthly |
| Payment webhook processing | < 30s from provider callback |
| Dispute first response | < 24 hours |
| Support ticket first response | < 24 hours |

These are the platform's stated targets, not yet backed by automated
SLA-breach alerting - Phase 1's uptime-check workflow
(`docs/UPTIME_MONITORING.md`) already measures uptime against `/health`
and opens a GitHub issue on failure, which is the closest existing signal
to the "platform uptime" row above. Wiring dispute/support response-time
tracking into an automated SLA-breach alert is a reasonable next step but
out of scope here - it would need response-time timestamps captured on
the dispute/support flows themselves, which don't currently exist.

## Public status page

`GET /api/v1/status` (public, no auth) returns:
- `health` - the same live DB-connectivity check `/health` performs
  (kept separate from that route deliberately - see
  `status.service.js`'s comment on why - but identical logic).
- `ongoing` - any `status_incidents` row not yet `resolved`.
- `recentIncidents` - the last 20 incidents regardless of status, for a
  visible history.

Rendered at `/status` (`StatusPage.jsx`) - a green "all systems
operational" banner when the DB is healthy and there are no ongoing
incidents, an incident list otherwise, the SLA table above, and recent
history.

## Incident management

`status_incidents` (migration `074_status_incidents.sql`) is a
manually-curated log, not automatically populated - an admin posts an
incident (title, affected component, severity, message) from
`/admin/status-incidents` and updates its status
(investigating → identified → monitoring → resolved) as it's worked.
This mirrors how any status page (Statuspage.io-style) separates
"we detected a problem" (automated monitoring) from "here's what we're
telling customers" (a human-authored incident post) - the uptime-check
workflow's automatic GitHub issue is the former; this table is the
latter.

## What's deliberately out of scope

- No automated incident creation from monitoring signals (e.g.
  auto-posting an incident when the uptime-check workflow's health check
  fails N times in a row) - an admin decides when something is
  customer-facing enough to post.
- No email/SMS subscriber notifications for status changes - the page is
  pull (visit `/status`), not push.
