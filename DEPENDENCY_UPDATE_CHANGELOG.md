# NEXORA backend dependency update

Ran `npm update` against the outdated-packages list and verified with a real
install + test run + app-load check.

## Updated to "Wanted" (within the existing `^` range in package.json - no
package.json change needed, only package-lock.json)

| Package             | Before  | After   |
|---------------------|---------|---------|
| @sentry/node        | 10.69.0 | 10.75.3 |
| bullmq              | 6.3.4   | 6.3.9   |
| cloudinary          | 2.10.0  | 2.11.0  |
| compression         | 1.8.1   | 1.8.2   |
| express-rate-limit  | 8.5.2   | 8.7.0   |
| socket.io           | 4.8.3   | 4.8.4   |
| socket.io-client    | 4.8.3   | 4.8.4   |
| supertest           | 7.2.2   | 7.3.0   |

## Left alone - major version bumps outside the declared range

These would require bumping the `^` range in package.json itself and are
more likely to carry breaking changes, so I didn't touch them without your
go-ahead:

| Package       | Current | Latest  | Note |
|---------------|---------|---------|------|
| @sentry/node  | 10.75.3 | 11.0.0  | SDK major bump - check the Sentry v11 migration notes before jumping (this repo's Sentry wiring from the RF1/Phase 2 observability work would need a re-check) |
| cross-env     | 7.0.3   | 10.1.0  | Dev-only, low risk, but a 3-major jump |
| dotenv        | 17.4.2  | 18.0.4  | Config-loading behavior can change across majors |
| eslint        | 8.57.1  | 10.11.0 | Flat-config is mandatory from ESLint v9+; this repo's `.eslintrc.json` (legacy config) would need migrating to `eslint.config.js` before this bump works at all |
| jest          | 29.7.0  | 30.5.2  | Test-runner major bump, worth its own verification pass given how much this repo leans on Jest |

Say the word if you want any of those tackled as a separate, reviewed phase.

## Verified

- `npm install` -> 0 vulnerabilities
- `npm run lint` -> 0 errors (2 pre-existing, unrelated warnings untouched)
- `npm run test:unit` -> 76 suites / 1128 tests passing
- App module (`src/app.js`) still loads cleanly
- `package.json` is unchanged (all updates stayed within its existing `^`
  ranges); only `package-lock.json` changed
