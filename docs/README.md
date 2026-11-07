# NEXORA Documentation Index

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Documentation package version | 1.0 |
| Subject | The delivered repository `NEXORA.zip` (backend, frontend, database, existing docs) |
| Method | Static inspection of source, plus executed checks: all 160 migrations applied to MariaDB 10.11.14; backend unit, integration and DB tests; frontend tests, build and lint; backend boot with endpoint probes; dependency audit; secret-pattern scan. Schema, endpoint, role and screen inventories were **generated from the code and the migrated database by scripts**, then hand-reviewed; the scripts are not part of this package. |
| Not done | No production access, no real provider calls, no browser walkthroughs, no e2e or load runs, no penetration test, no legal review. No application source was changed. |

## 1. Evidence labels

**Verified** observed in the repository or in an executed check. **Inferred** reasoned from evidence. **Proposed** a recommendation by this audit. **Owner Confirmation Required** cannot be known from the repository. Severities are Proposed unless stated.

## 2. Document map

| Document | Audience | Depends on | Status |
|---|---|---|---|
| **Business** | | | |
| `business/company-overview.md` | Owner, investors, new staff | Repo copy, legal content | Complete for what the repo evidences; owner items open |
| `business/business-rules.md` | Product, ops, QA | Seeded settings, schema, code | Complete; production values unconfirmed |
| **Product** | | | |
| `product/prd.md` | Product, owner | Business docs | Complete (reverse-engineered) |
| `product/functional-specification.md` | Developers, QA | PRD, code | Complete at behaviour level; field contracts defer to OpenAPI |
| `product/requirements-traceability.md` | QA, auditors | PRD, tests | Complete; test-name heuristic |
| **Design** | | | |
| `design/application-flow.md` | Product, UX, QA | Route tree | Code-derived; not walked in a browser |
| `design/ui-ux-specification.md` | Designers, front-end | Tailwind config, components | Existing design and proposals separated; no visual review |
| `design/screen-inventory.md` | Front-end, QA | `App.jsx` | Generated; complete for routes |
| `design/roles-permissions.md` | Security, backend | Route guards | Generated; object-level checks not audited |
| **Technical** | | | |
| `technical/technical-requirements.md` | Engineering, ops | Manifests | Complete |
| `technical/architecture.md` | Engineering | Source | Complete |
| `technical/database-schema.md` | Engineering, DBA | Live schema | Generated from migrated DB; verified on MariaDB only |
| `technical/data-dictionary.md` | Engineering, data protection | Live schema | Generated; sensitivity column is heuristic |
| `technical/api-documentation.md` | Integrators, QA | Route files | Inventory complete (575 declarations); field contracts only where `openapi.yaml` has them |
| `technical/integrations.md` | Engineering, ops | Provider modules | Complete; no live provider test |
| `technical/security-privacy.md` | Security, owner | All code | Documentation audit, not a pen test |
| **Delivery** | | | |
| `delivery/current-state-audit.md` | Everyone | All | Complete |
| `delivery/gap-analysis.md` | Product, engineering | All | Complete |
| `delivery/implementation-plan.md` | Owner, engineering | Audit, known issues | Proposed work only; nothing done |
| `delivery/testing-qa-plan.md` | QA | Tests, RTM | Existing results and proposed cases separated |
| **Operations** | | | |
| `operations/deployment-guide.md` | DevOps | Scripts, env | Local steps verified; production steps Stated |
| `operations/maintenance-recovery.md` | Ops | Jobs, scripts | Existing mechanisms vs recommendations; no restore drill |
| `operations/user-manual.md` | Buyers, sellers, agents | Verified rules | Based on code; screens not viewed |
| `operations/administrator-manual.md` | Admins | Admin routes, settings | Based on code; screens not viewed |
| `operations/release-notes.md` | Everyone | CHANGELOG, git | Only evidenced history |
| `operations/known-issues.md` | Engineering, owner | All | 21 items, all open |
| **Diagrams** | | | |
| `diagrams/architecture.mmd`, `application-flow.mmd`, `database-erd.mmd` | All | Above | All Mermaid diagrams in the package parse with Mermaid 10 |

## 3. Existing documents in `docs/` (kept, not modified)

| File | Status found |
|---|---|
| `openapi.yaml` | **Stale and inconsistent** (KNOWN-001, 002); still the only field-level contract for 289 endpoints |
| `DATABASE.md` | **Stale** (MySQL 8, 159 migrations, detail to migration 082); superseded by `technical/database-schema.md` |
| `SRS.md` | **Stale** technology section |
| `ARCHITECTURE.md` | Partial: 40 of 72 modules; lists a retired module |
| `DEPLOYMENT.md`, `ROLLBACK.md` | Useful; env and scripts cross-checked; host settings unverified |
| `CHANGELOG.md` | Project change log by phase; current through the stock-management phases |
| `ESCROW_PAYMENT_FLOW.md` | Consistent with the schema (columns and ledger types checked); flow not executed end to end |
| `ESCROW_LICENSING_REVIEW.md` | Raises the regulatory question; no legal conclusion |
| `FRONTEND_CSP.md` | Documents the frontend CSP and the production domain |
| `MOBILE_STRATEGY.md`, `MULTICURRENCY_PAYOUTS.md`, `RECOMMENDATIONS.md` | Describe features that are implemented |
| `SLA.md`, `ACTIVE_USERS_METRIC.md`, `SUBSCRIPTIONS.md` | Read; SLA targets are unmeasured in this tree |
| `API.md`, `ARCHITECTURE_REVIEW.md`, `ESCROW_ANALYSIS.md`, `PAYMENT_PROVIDERS.md`, `REFUNDS.md`, `ROUTING.md`, `SCALABILITY_REPORT.md`, `SECURITY_REVIEW_CHECKLIST.md`, `SEO_PLAYBOOK.md`, `UPTIME_MONITORING.md`, `WEBHOOK_VALIDATION.md`, `DISPATCH_SELLER_PROXIMITY.md`, `EFD_COMPLIANCE_NOTE.md` | **Not reviewed in detail**; treat as unverified |
| Root `DEPENDENCY_UPDATE_CHANGELOG.md`, `legal and customers trust .md`, `README-ai-providers-*.md` | Dependency changelog is stale; the legal note is contradicted by `frontend/src/legal/company-information.md`; AI note not reviewed |

## 4. Most important findings

1. **Repository integrity (KNOWN-004):** the delivered git database is unreadable, HEAD predates the files, 244 files are untracked and 29 indexed files (including all CI and some modules) are missing.
2. **Four job files never run (KNOWN-003)**, and one test passes by checking the wrong file.
3. **Unmounted settings router (KNOWN-021):** a frontend banner calls a 404 endpoint; the old Billing Control Center is gone.
4. **Security (KNOWN-011, security-privacy.md):** 5 dependency advisories; encryption key derived from the JWT secret; payout details in plain columns; DB TLS not verified by default; simulate payment providers depend on `NODE_ENV`.
5. **API documentation** covers half the endpoints and is internally inconsistent (KNOWN-001, 002).
6. **Test harness drift (KNOWN-005):** DB-integration tests fail as-is; 4 of 73 still fail after cleanup is neutralised.
7. **Manual money operations (KNOWN-017):** payouts and some refunds are manual by design, with an open regulatory question.

Recommended order: `delivery/implementation-plan.md` (recover repository, fix scheduler and advisories, restore CI, repair tests, then hardening and operations).

## 5. Checks performed and results

| Check | Result |
|---|---|
| Migrations 001-160 on MariaDB 10.11.14 | Applied cleanly |
| Backend unit / integration | 118 suites, 1,632 tests pass / 11 suites, 96 tests pass |
| Backend DB-integration | As-is most files fail on cleanup; with cleanup neutralised 69 of 73 pass, 4 fail |
| Frontend Vitest | 476 of 477 pass (1 accessibility test fails) |
| Frontend `vite build` | Passes (about 18 s); prerender step not run |
| Backend boot and probes | Public 200, protected 401, unmounted settings route 404 |
| Lint | Backend 4 errors, 19 warnings; frontend 8 errors, 16 warnings |
| `npm audit --omit=dev` | Backend 4 (2 high), frontend 1 (high) |
| Secret scan | No matches |
| Docs checks | Mermaid diagrams parse; file references resolved except intentionally absent files; requirement IDs cross-checked |
| Not executed | Playwright e2e, load tests, real providers, MySQL 8 run |

## 6. Questions for the company owner

| ID | Question |
|---|---|
| BUS-Q1 | Are the legal name, BRELA number, TIN and address in `company-information.md` correct and current? |
| BUS-Q2 | Which monetization switches (commission, subscriptions, sponsorship) are live in production, at what rates? |
| BUS-Q3 | What is the launch status, user volume and order volume? |
| BUS-Q4 | Which countries beyond Tanzania are intended? |
| BUS-Q5 | What are the company mission, positioning and target segments? |
| BUS-Q6 | Which support mailbox and phone should be shown (the hard-coded email is a consumer address)? Are the social links yours? |
| BUS-Q7 | Has a Tanzanian advocate reviewed holding customer funds, data protection and tax-receipt obligations? |
| BUS-Q8 | What database engine and version, hosting plans and Redis run in production? |
| BUS-Q9 | Who owns the domain `nexoramarketplace.online`, and how are DNS, TLS and any CDN set up? |
| BUS-Q10 | Who approves payouts and refunds, with what turnaround and what second check? |
| BUS-Q11 | What retention and deletion rules apply to orders, chat, location, documents, logs? |
| BUS-Q12 | Which browsers and devices must be supported, and to what accessibility level? |
| BUS-Q13 | Should the four unscheduled jobs run (low-stock alerts, pre-order reminders, draft cleanup, scheduled monetization)? |
| BUS-Q14 | Restore or delete the Billing Control Center, department sponsorship and seller loans (and their tables)? |
| BUS-Q15 | Can you provide the original repository with full history, CI and the missing files? |
| BUS-Q16 | Which provider contracts, sandbox credentials and webhook URLs are registered? |
| BUS-Q17 | What do verification levels require, who reviews documents and how fast? |
| BUS-Q18 | Are the published SLA numbers commitments, and how should they be measured? |

## 7. Incomplete or unverified areas

Production configuration and data; real provider behaviour; end-to-end browser journeys; object-level authorization beyond samples; 17 untested backend modules; the 13 existing docs listed as not reviewed; MySQL 8 behaviour; performance and capacity; legal compliance; the 16 OpenAPI operations for removed features need a decision. The endpoint inventory is static analysis: it found and corrected its own errors during this audit (missed sub-routers, optional-segment syntax, prefix inconsistencies), so spot-check before relying on exact counts.

## 8. Maintaining this documentation

Regenerate the schema, data dictionary, endpoint inventory, screen inventory and roles matrix whenever migrations or routes change (implementation-plan WI-023 proposes doing this in CI). Update `known-issues.md` and `release-notes.md` with each release; keep requirement IDs stable.
