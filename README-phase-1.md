# Phase 1 – Admin Account Control

## What changed

### Suspend / Unsuspend (replaces Deactivate)
- **Migration `058_admin_account_suspension.sql`** adds `suspended_at`,
  `suspension_reason`, `suspended_by` to `users` (same pattern as the
  existing `deleted_at` self-deletion columns). `is_active` still gates
  login/session access — these three columns just record *why* and *by
  whom*, the way `deleted_at` already records self-deletion.
- `admin.repository.js` / `admin.service.js`: `setUserActive` is gone,
  replaced by `suspendUser(userId, reason, adminId)` and
  `unsuspendUser(userId, adminId)`. Suspending requires a non-empty
  reason (validated server-side, `admin.validator.js`), can't be used on
  a self-deleted account, and an admin can't suspend their own account.
  Both actions notify the affected user and write an `audit_logs` entry
  (`account_suspended` / `account_unsuspended`).
- New routes: `PUT /admin/users/:id/suspend` (body: `{ reason }`),
  `PUT /admin/users/:id/unsuspend`. The old `/deactivate` and `/activate`
  routes are removed.
- **Login blocking**: `login.service.js` now checks `suspended_at` before
  the generic deactivated fallback and throws a distinct `ACCOUNT_SUSPENDED`
  (403) error carrying the reason. `auth.controller.js` forwards that as
  `{ code: "ACCOUNT_SUSPENDED", data: { reason } }`.
- **Mid-session blocking**: `auth.middleware.js` re-checks suspension on
  every request (same as it already did for `is_active`), so a
  still-unexpired token from before the suspension is blocked immediately
  with the same `ACCOUNT_SUSPENDED` code, not just a generic 401.
- **Frontend**: `api/client.js`'s response interceptor detects
  `ACCOUNT_SUSPENDED` on *any* API call and routes to a new full-screen
  `SuspendedScreen` (animated, matches the existing splash-screen visual
  language) via a small handler `AuthContext` registers — this covers
  both "blocked at login" and "was already logged in, got suspended
  mid-session" without needing route-based logic.
- `AdminUsers.jsx`: "Deactivate/Activate" buttons replaced with
  "Suspend" (prompts for a reason) / "Unsuspend", and the suspension
  reason/admin/timestamp are shown inline per user.

### Permanent Delete (generalized)
- The existing `permanentlyDeleteUser` logic (which already scrubs PII,
  deletes safe-to-remove data, and keeps financial/legal records per the
  FK architecture — see the doc comment in `admin.service.js`) no longer
  requires the account to have been self-deleted first. It's now a
  direct, standalone admin action, still super-admin gated and still
  irreversible.
- Since it can now run on an account that skipped the self-delete step,
  it also now cleans up cart items, push subscriptions, and deactivates
  any still-live seller listings (previously handled by self-delete
  before this action ever ran).
- New route: `DELETE /admin/users/:id` (super admin only), alongside the
  existing `DELETE /admin/deleted-users/:id` — both call the same
  service function.
- `AdminUsers.jsx` gets a "Permanently delete" button (super admins only)
  with the same typed-email-confirmation safeguard used on the existing
  Deleted Accounts page.

## Files touched
See the file tree in this zip — every file is either new
(`SuspendedScreen.jsx`, migration 058) or an edit to existing files; no
deletions.

## Not in this phase
Admin notification center, audit-log UI, and tests are Phases 2, 5, and 6
respectively — not touched here. `audit_logs` entries are written for
suspend/unsuspend (reusing the audit infrastructure already used
elsewhere in the codebase), but there's no new UI to view them yet.

## Before you test
Run `node database/migrate.js` to apply migration 058.
