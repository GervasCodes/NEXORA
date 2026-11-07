# Release Notes

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Policy | **No release history is invented.** This file records only what the repository evidences (chiefly `docs/CHANGELOG.md` and git) and what this audit changed. |

## 1. Version identifiers found (Verified)

| Artifact | Version | Note |
|---|---|---|
| `backend/package.json` | 1.0.0 | Not tied to releases |
| `frontend/package.json` | 0.1.0 | Not synchronised with the backend |
| `database/package.json` | 1.0.0 | |
| Schema | 160 migrations (`001` to `160_search_queries.sql`) | Forward-only; applied cleanly on MariaDB 10.11.14 in this audit |
| Git tags | None | No semantic release markers |
| Documentation package | 1.0 (this audit, 2026-10-29) | |

## 2. Change history evidence

| Source | What it shows |
|---|---|
| `docs/CHANGELOG.md` (500 lines, 27 sections) | The project's own change log, grouped by **phase**, not by version. It covers the homepage/marketplace upgrade (Phases 1-10: departments, discovery, product cards, store profiles, branding, sponsored marketplace, payment trust, optimisation), then Admin Account Control, Admin Notifications, PWA and real-time notifications, Messaging, Audit Logs, a test review and documentation phase, six dated entries of 2026-08-08 (monetization master switch and payment reliability, mobile number country codes, duplicate service department cleanup, mobile navigation unification, trust and monetization communication, UX polish), "Upgrade Round 2", and Nexora Stock Management Phases 6-8 (foundation, sales/purchases/receipts, expenses/reports/alerts/import-export/offline/plans). It states it does not restate the earlier "10-phase maintenance roadmap" and points to a root `README.md` that **is not in the delivered tree**. Entries after the stock phases (for example migrations 157-160 beyond what it lists, and search queries) were not cross-checked. |
| Git log (readable part) | 73 commits from 2026-07-09 to 2026-09-19 by a single committer identity; messages are short and informal ("fixes", "polishing", "broadcast and fixes"). `HEAD` is `8bed47e6`. |
| Working tree vs git | The tree contains files newer than `HEAD`: 244 files are not in git's index and 29 indexed files are absent (KNOWN-004). Changes after 2026-09-19 therefore have **no commit history** in the delivered archive. |
| `CHANGES.md` | Listed in git's index but **absent** from the delivered tree. |
| `DEPENDENCY_UPDATE_CHANGELOG.md` | One backend dependency-update record. Its test and lint counts are out of date (KNOWN-008). |
| Migration comments | Migration headers record decisions (for example 079 monetization switches, 113 retirement of the verification fee) and are a reliable secondary history of schema-affecting changes. |

**Notable retirements recorded:** verification fee (migration 113), department sponsorship (redirects in `App.jsx`), product audio (routes return 410), seller loans (page remnant only).

## 3. Current state summary (what a first tagged release would contain)

Feature areas are listed in `delivery/current-state-audit.md` section 3. Notable facts for a release baseline: monetization switches default to off; three scheduled jobs are not wired (KNOWN-003); department sponsorship and seller loans are retired with remnants (KNOWN-009).

## 4. Changes made by this audit

Documentation only: the new `docs/README.md` and files under `docs/business`, `product`, `design`, `technical`, `delivery`, `operations`, `diagrams`. Existing documents in `docs/` were **not modified**. No application source, configuration or database was changed in the delivered repository (a working copy was used for installs, builds and tests).

## 5. Recommendations (Proposed)

Adopt semantic versioning with tags; keep a `CHANGELOG.md` generated from conventional commits or PR titles; align frontend and backend version numbers or document why they differ; record the migration range in each release; include the output of the CI test, lint and audit jobs in release notes.

## 6. Future work

See `delivery/implementation-plan.md` and `operations/known-issues.md`. Nothing listed there is marked as done.
