# Uptime Monitoring

NEXORA's backend already exposes a public health check at `GET /health`
(see `backend/src/app.js`). It returns `200` with `{"status":"ok"}` when
the API and its database connection are both healthy, and `503` with
`{"status":"degraded"}` when the database is unreachable. This is the
endpoint both monitoring layers below check.

## Primary: external uptime monitor

Use a free third-party monitor as the primary alerting channel, since it
checks from outside GitHub's infrastructure and can page you by
SMS/call/email/Slack independent of GitHub Actions being up at all.

Recommended: **UptimeRobot** (free tier: 50 monitors, 5-minute interval) or
**Better Uptime** (free tier available). Either works the same way:

1. Create a free account.
2. Add a new **HTTP(s)** monitor pointed at:
   `https://<your-backend-domain>/health`
3. Set the expected response to HTTP `200` (some tools let you also assert
   on response body containing `"status":"ok"`).
4. Set the check interval (5 minutes is a good default on the free tier).
5. Add your email (and optionally SMS/Slack/Discord webhook) as an alert
   contact.

That's it - no code or repo changes are needed for this layer.

## Backup: `Uptime Check` GitHub Actions workflow

`.github/workflows/uptime-check.yml` pings the same `/health` endpoint
every 15 minutes from GitHub's infrastructure and opens (or updates) a
GitHub issue labeled `uptime` when it doesn't get back a `200` - and
auto-closes that issue once it recovers. This exists as a backup in case
the external monitor's alerting lapses (e.g. a free-tier account expiring
unnoticed), not as a replacement for it.

To enable it, set a repository **variable** (not secret - the URL isn't
sensitive) with the deployed backend's health URL:

1. Repo **Settings > Secrets and variables > Actions > Variables** tab.
2. **New repository variable**:
   - Name: `BACKEND_HEALTH_URL`
   - Value: `https://<your-backend-domain>/health`

If this variable isn't set, the workflow logs a warning and skips its
check rather than failing - so leaving it unset doesn't break CI.

You can also trigger it on demand from the **Actions** tab
(`Uptime Check` workflow > **Run workflow**) to verify it's wired up
correctly before waiting for the schedule.

## Why not more than this for now

A full observability stack (uptime + latency + error-rate dashboards) is
covered separately in Phase 2 (Sentry, structured logging). This phase is
intentionally just "is the API reachable right now" - cheap to set up,
zero ongoing cost, and enough to catch the most common failure mode
(process crashed, host down, DB connection dropped).
