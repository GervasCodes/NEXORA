# Phase 1 — Engineering & Security Foundations

## Summary

Adds the CI/security scaffolding NEXORA didn't have yet: automated test
runs on every push/PR, dependency-update automation, a dependency
vulnerability gate, static security analysis, and a basic uptime check.
No application code (backend/frontend `src/`) was touched — this phase
is entirely CI configuration and documentation.

## New files

- `.github/workflows/ci.yml` — runs on every push and PR:
  - **backend** job: `npm ci` → `npm run lint` → `npm test` (mocked-DB
    suite, no MySQL service needed) → `npm audit --audit-level=moderate`
  - **frontend** job: `npm ci` → `npm run lint` → `npm test` → `npm run
    build` → `npm audit --audit-level=moderate`
  - **database** job: `npm ci` → `npm audit --audit-level=moderate`
    (this package has no test suite of its own)
  - Concurrency group cancels superseded runs on the same branch/PR.
- `.github/workflows/codeql.yml` — GitHub CodeQL static analysis
  (`security-extended` query pack) for JavaScript/JSX, on every push/PR
  plus a weekly Monday scheduled scan.
- `.github/workflows/uptime-check.yml` — pings the deployed backend's
  existing `GET /health` endpoint every 15 minutes and opens/updates a
  GitHub issue (label `uptime`) on non-200 responses, auto-closing it on
  recovery. Reads the target URL from a repo variable
  (`vars.BACKEND_HEALTH_URL`) so no code change is needed to point it at
  a real deployment; skips (with a warning, not a failure) if unset.
- `.github/dependabot.yml` — weekly dependency-update PRs for
  `/backend`, `/frontend`, `/database` (npm ecosystem, grouped
  minor/patch updates to reduce PR noise) and for the workflow files
  themselves (`github-actions` ecosystem).
- `docs/UPTIME_MONITORING.md` — setup guide: a free external monitor
  (UptimeRobot/Better Uptime) as the primary alert channel, plus how to
  wire up the `uptime-check.yml` backup workflow via the
  `BACKEND_HEALTH_URL` repo variable.

## Modified files

- `README.md` — added CI and CodeQL status badges at the top.

## Notes / assumptions

- No existing `.github/` directory was present, so nothing was
  overwritten — the `docker-compose.test.yml` comment referencing
  `.github/workflows/backend-tests.yml` was aspirational; this phase's
  `ci.yml` is the workflow that reference describes (name differs
  slightly — one combined `ci.yml` covering backend, frontend, and
  database rather than a backend-only file — since frontend/database
  needed the same lint+audit treatment).
- CI does **not** run `test:db` (the real-MySQL integration suite) —
  that suite needs `docker-compose.test.yml`'s container and is left as
  a local/manual check, matching how it's already documented in that
  file. Only the mocked-DB default `npm test` runs in CI.
- `npm audit` is set to fail CI on `moderate` and above. If this proves
  too noisy against transitive dev-dependency advisories, the threshold
  can be relaxed to `high` — flagging this as a judgment call rather
  than silently picking a level.
- The uptime workflow requires one manual step (setting the
  `BACKEND_HEALTH_URL` repository variable) since the actual deployed
  domain isn't part of this codebase — documented in
  `docs/UPTIME_MONITORING.md`.
- Per instructions, tests were **not** run as part of this delivery —
  `npm test` was not executed locally; the CI workflow is written to
  call the project's existing test scripts as-is (`npm test` in
  `backend/` and `frontend/`) without modification, so it will run
  whatever suite already passes/fails today.

## Requires manual setup

1. Merge this ZIP's contents into the repo.
2. **Settings → Code security → Dependabot** → confirm Dependabot alerts
   and security updates are enabled (dependabot.yml handles version
   update PRs; alerts are a separate repo-level toggle).
3. **Settings → Code security → Code scanning** → CodeQL will register
   itself automatically once `codeql.yml` runs once on the default
   branch.
4. **Settings → Secrets and variables → Actions → Variables** → add
   `BACKEND_HEALTH_URL` (see `docs/UPTIME_MONITORING.md`).
5. (Recommended) Set up a free UptimeRobot/Better Uptime monitor against
   `/health` as the primary alert channel — see
   `docs/UPTIME_MONITORING.md`.
