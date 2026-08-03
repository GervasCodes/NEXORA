# Active Users Metric (Phase 3b)

Adds a DAU/WAU/MAU "active users" stat to the existing admin analytics
dashboard (`GET /api/v1/admin/analytics/business`), extending it rather
than building a new page - the dashboard's GMV/take-rate/retention
metrics already lived there (see `admin.service.js#getBusinessMetrics`).

## How activity is tracked

Migration `076_user_last_active_tracking.sql` adds a nullable
`users.last_active_at` timestamp. `auth.middleware.js` - which already
does a DB round-trip on every authenticated request to check account
status - now also (throttled to roughly once per 5 minutes per user,
fire-and-forget, not awaited) updates that timestamp. This measures
*platform activity broadly* (anyone making an authenticated request:
browsing, managing a store, checking a dashboard), which is a different
question from the existing buyer/provider retention metrics that only
count users who actually completed a paid transaction.

## Endpoint

`admin.repository.js#getActiveUsersMetrics` groups by role
(buyer/seller/delivery_agent/admin) and counts how many have
`last_active_at` within the last 1/7/30 days. Folded into the existing
`getBusinessMetrics` response under a new `activeUsers` key:

```json
"activeUsers": {
  "total": { "dau": 42, "wau": 210, "mau": 640 },
  "byRole": {
    "buyer": { "dau": 30, "wau": 150, "mau": 480 },
    "seller": { "dau": 10, "wau": 50, "mau": 140 }
  }
}
```

`AdminDashboard.jsx` renders this as a new stat row directly under the
existing GMV cards.

## Note

Anyone who registered before this migration and hasn't made an
authenticated request since will show `last_active_at = NULL` (counted
as inactive, not an error) until their next login/request.
