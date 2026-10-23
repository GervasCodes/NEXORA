# Rollback runbook

Short, practical version of "something just broke in production, how do I
get back to a known-good state" - not an exhaustive incident-response
doc. See `docs/DEPLOYMENT.md` for the full deploy setup this assumes
(both the backend and the frontend run as Render services - a Web
Service and a Static Site respectively - per that doc's own
host-specific sections).

## 1. App code (backend - Render)

Render keeps previous deploys. Fastest path back to working:

1. Render dashboard → the backend service → **Deploys** tab.
2. Find the last deploy that was known-good (before the change that
   broke things).
3. Click it → **Rollback to this deploy** (or redeploy that commit,
   depending on your Render plan's exact wording).

This reverts code only - it does **not** touch the database. If the bad
deploy's migrations already ran (see §3), rolling back the app code
alone can leave it running against a schema it doesn't expect (missing
columns a newer version reads, for example). Check what migrated before
rolling back code-only.

## 2. Frontend (Render Static Site)

Render keeps previous successful deploys and can roll back to one
without a full rebuild (it reuses that deploy's build artifact):

1. Render dashboard → the frontend static site → **Events** tab.
2. Find the last deploy that was known-good → click **Rollback** → confirm
   on the following page (**Rollback to this deploy**).

Unlike a plain redeploy, triggering a rollback this way **automatically
disables autodeploy** for that service - a safeguard so a routine push
can't silently re-introduce the bad change while you're still
investigating. Re-enable it from the service's **Settings** page once
the underlying issue is actually fixed forward.

A rollback also reverts that deploy's Redirects/Rewrites and Headers
settings (see `docs/DEPLOYMENT.md`'s frontend section) to match what was
live at that deploy, not just the built files - so `index.html`'s
`Cache-Control: no-cache` header (set there, not in a committed file)
still applies and visitors pick up the rolled-back version on their very
next request, no waiting out a stale cached shell.

## 3. Database (migrations are forward-only - there is no automatic `down`)

`database/migrate.js` only ever applies new migrations forward (see its
own file - there's no `rollback`/`down` command). Every migration in
this repo is written to be idempotent ("safe to re-run" - see most
migration files' own header comments), but none of them undo themselves.
That means "rolling back a migration" isn't a single command here -
pick the approach that fits what actually broke:

- **The migration itself errored partway through** (like the real
  failures found this phase - a duplicate migration number, a
  MariaDB/MySQL syntax difference): fix the migration file (or delete a
  genuinely dead duplicate, as this phase did) and re-run
  `node database/migrate.js`. Nothing partial was recorded as applied -
  `migrate.js` only inserts into `schema_migrations` after a migration
  fully succeeds (see migrate.js's own `catch` block) - so a failed
  migration is safe to fix-and-retry, not something to manually unwind.
- **The migration succeeded but the resulting schema/behavior is wrong**
  (a bad default, a column that should have been nullable, an index
  that should not have shipped): write a new forward migration that
  corrects it - do not hand-edit an already-applied migration file in
  place (other than the kind of same-day bugfix covered above, before
  anyone has run it against a real database). `docs/DATABASE.md`'s
  migration-count convention (checked by
  `database/checkMigrationDocsDrift.js`) assumes migrations only move
  forward in number.
- **Data itself is wrong/lost** (a bad backfill, a destructive bug):
  restore from backup. `database/backup.js`/`restore.js` are the
  existing tooling (`node database/restore.js --latest` for the most
  recent nightly dump) - see that pair of files' own usage comments.
  Restoring overwrites tables present in the backup; it does not drop
  tables absent from it, so a restore followed immediately by
  `node database/migrate.js` (idempotent - already-applied migrations
  are skipped) brings a restored-but-older database back up to the
  current schema in one more step.

## 4. Health-check gate on rolling restarts

`GET /health` already exists (`backend/src/app.js`) and checks real DB
connectivity (`SELECT 1`), not just "the process is up" - it returns
`503` when the database is unreachable, `200` with `{"status":"ok"}`
otherwise. Confirm it's actually wired up as Render's **Health Check
Path** for the backend service (Render dashboard → the service →
Settings → Health Check Path → `/health`) - Render won't route traffic
to a new instance, and won't consider a rolling restart successful,
until that path returns `200`. Nothing in this repo can set that for
you; it's a dashboard setting, not a committed config file (no
`render.yaml` exists here - see `docs/DEPLOYMENT.md` for why this repo
treats Render as dashboard-configured rather than infra-as-code). If
it's set to a plain TCP check or the default `/` route instead, a
rolling restart can mark a DB-disconnected instance "healthy" and
route real traffic to it - worth checking once, not something that
needs re-confirming on every deploy.
