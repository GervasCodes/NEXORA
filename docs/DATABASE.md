# Database

NEXORA uses MySQL 8. Schema changes live as numbered, forward-only SQL
files in `database/migrations/` (`NNN_description.sql`), applied in
order by `database/migrate.js`, which tracks what's already applied in
a `schema_migrations` table.

```bash
cd database
npm install
npm run migrate          # apply every pending migration
npm run migrate:status   # list applied vs pending
npm run seed             # populate reference/dev data
```

Connection settings (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME`, plus optional `DB_SSL*` vars) are read from `backend/.env` -
see `backend/.env.example`.

## Testing against the database

The backend has three Jest suites (`backend/jest.config.js` /
`backend/jest.db.config.js`), each with a different relationship to
MySQL:

| Suite | Location | What's real | What's mocked |
|---|---|---|---|
| Unit | `backend/tests/unit/` | Pure logic | The DB pool, external providers |
| Integration | `backend/tests/integration/` | Express app, routing, middleware | The `mysql2` pool |
| DB-integration | `backend/tests/db-integration/**/*.db.test.js` | Real SQL against a real MySQL 8 instance | Only external boundaries (email transport, payment provider network calls, fraud/audit/socket side-effects) |

Only the third suite needs MySQL actually running. It exists to catch
what a fully-mocked pool never can: a typo'd column name, a broken
`JOIN`, a foreign-key/constraint violation, or a transaction that
doesn't actually roll back on error.

### Running the DB-integration suite locally

```bash
docker compose -f docker-compose.test.yml up -d   # disposable MySQL 8
npm --prefix backend run db:migrate               # apply migrations to it
npm --prefix backend run test:db                  # run tests/db-integration/**
docker compose -f docker-compose.test.yml down -v
```

`docker-compose.test.yml`'s credentials/port match `tests/setupEnv.js`'s
fallback defaults (`DB_HOST=localhost`, `DB_PORT=3306`,
`DB_USER=test`/`DB_PASSWORD=test`, `DB_NAME=nexora_test`), so no `.env`
file is required to run it locally.

### CI (Phase 3)

`.github/workflows/backend-tests.yml` runs a MySQL 8 `services:`
container for every push/PR, waits for it to accept connections, runs
every pending migration against it, then runs all three backend
suites (`test:unit`, `test:integration`, `test:db`) plus the frontend
Vitest suite and a `vite build` in a separate job. `BREVO_API_KEY` is
intentionally left unset in CI - `backend/src/config/brevo.js` falls
back to a simulated (no-network) send outside `NODE_ENV=production`,
so no test run ever emails a real inbox.

### Fixture conventions

`backend/tests/db-integration/helpers/dbFixtures.js` holds shared
fixture creators (`createUser`, `createProduct`, `createOrder`,
`createOrderItem`, `createCartItem`, `createPayment`, `createDispute`)
and a `resetTables()` cleanup helper. Every db-integration test file
calls `resetTables()` in a `beforeEach` - the suite shares one
long-lived database rather than spinning up a fresh schema per test,
so tests must never assume they're the only row in a table.

`resetTables()` deletes in child-before-parent order to respect
foreign keys. When a migration adds a new table that a db-integration
test writes to, add it to that list (as a child of whatever it
references) rather than reaching for `TRUNCATE` / disabling FK checks.
