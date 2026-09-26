# Security maintenance



Most of NEXORA's security posture is already implemented and reviewed —
`docs/SECURITY_REVIEW_CHECKLIST.md` covers CSRF, rate limiting, Helmet/CSP, session
cookie hardening, HTTPS/HSTS, file-upload content validation, malware scanning, and
server-side input validation. This file covers the part that can't be solved once and
left alone: **keeping dependencies current**.

A dependency audit is not a task you complete. It's a thing you do on a schedule, forever.

---

## Why this needs a schedule

Both halves of the project ship a lockfile (`backend/package-lock.json`,
`frontend/package-lock.json`), so builds are reproducible — which is good, and is also
exactly why a vulnerable transitive dependency can sit pinned and unnoticed for months.
Nothing in the repo currently checks for that. There is no `.github/workflows/`
directory, so no CI runs an audit today.

The realistic failure mode isn't a dramatic zero-day. It's a `npm audit` that hasn't been
run since launch, producing 40 findings at once, at which point nobody triages any of
them.

---

## Recommended cadence

### Weekly — automated

Enable **Dependabot** (or Renovate) on the repository. Both are free for public and
private repos on GitHub and need no CI minutes to open a PR.

A minimal `.github/dependabot.yml` covering both halves of this project:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      # Patch/minor bumps land as one PR instead of twenty.
      minor-and-patch:
        update-types: ["minor", "patch"]

  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        update-types: ["minor", "patch"]
```

Grouping matters. Ungrouped Dependabot on a project this size produces enough PRs that
people start closing them unread, which is worse than not running it.

**Security alerts should stay ungrouped and separate** — enable Dependabot security
updates in the repository settings so an advisory-triggered bump arrives as its own PR
and is visibly distinct from routine version churn.

### Monthly — manual

Run, in both `backend/` and `frontend/`:

```bash
npm audit --omit=dev          # what actually ships
npm audit                     # including build/test tooling
npm outdated
```

`--omit=dev` first, because a vulnerability in a build-time-only package (Vite, Vitest,
ESLint) has a very different risk profile from one in Express or a runtime crypto
library. Triage those separately rather than treating one number as "the" audit result.

### Before each release

Check that no `high` or `critical` advisory affects a runtime dependency. If one does and
no fix is published yet, record the decision — what the exposure actually is for this
app, and why shipping is acceptable — rather than silently ignoring it.

---

## Triage guidance

`npm audit` over-reports for an application like this. A finding's severity label is a
property of the package, not of how NEXORA uses it. Before acting, ask:

1. **Is it a runtime or a dev dependency?** A ReDoS in a test formatter does not reach
   production.
2. **Is the vulnerable code path reachable?** A path-traversal advisory in a library only
   ever called with hard-coded internal paths is not the same risk as one fed user input.
3. **Is there a fix?** If `npm audit fix` resolves it without a breaking major bump, just
   take it. If it needs a major upgrade, that's a scheduled piece of work, not a hotfix.

Never run `npm audit fix --force` on a whim — it will happily install breaking major
versions across the tree.

---

## Adjacent things worth a periodic look

These aren't dependency audits, but they decay the same way and have no owner otherwise:

- **Node runtime version.** `backend/package.json` declares `"node": ">=18"`. Node 18 is
  past its maintenance window; confirm what the deployment target actually runs and move
  to a supported major.
- **Secrets rotation.** API keys for Brevo, Cloudinary, the payment providers, and the AI
  providers. Rotate on a schedule and immediately on any team change.
- **Dormant accounts with elevated access.** Admin and super-admin accounts that nobody
  has used in months. `AdminManageAdmins.jsx` and the audit log are the places to check.
- **The CSP placeholder.** `frontend/public/_headers` carries a placeholder domain from
  Phase 1 (see `PHASE_1_NOTES.md`). A CSP pointed at a placeholder is not a CSP.

---

## Not covered here

Penetration testing, infrastructure hardening (Cloudflare and Render configuration), DNS
and email authentication (SPF/DKIM/DMARC — flagged separately in the Phase 5 scope), and
database-level access control. None of those live in this repository, and none of them
are addressed by a dependency audit.
