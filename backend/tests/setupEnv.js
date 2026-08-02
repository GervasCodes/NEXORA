// Runs before the test framework is installed and before any test file
// (or the modules it requires) is evaluated - this is what lets
// `require("jsonwebtoken")`-based modules like generateToken.js /
// auth.middleware.js work under Jest without a real .env file, and keeps
// webhookAuth.middleware.js's "fail closed in production" branch out of
// the way for tests that don't specifically set NODE_ENV=production
// themselves.
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-do-not-use-in-prod";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

// Webhook secrets - set to fixed values so signature/secret tests are
// deterministic instead of depending on whatever a real .env happens to
// contain.
// MOBILE_MONEY_API_KEY doubles as MalipoPay's webhook payloadSignature
// secret (see webhookAuth.middleware.js) - MalipoPay has one key, not a
// separate secret+key pair.
process.env.MOBILE_MONEY_API_KEY = process.env.MOBILE_MONEY_API_KEY || "test-malipopay-api-key";
process.env.MALIPOPAY_WEBHOOK_SECRET = process.env.MALIPOPAY_WEBHOOK_SECRET || "test-malipopay-secret";
process.env.SELCOM_WEBHOOK_SECRET = process.env.SELCOM_WEBHOOK_SECRET || "test-selcom-secret";
process.env.SNIPPE_SECRET_KEY = process.env.SNIPPE_SECRET_KEY || "test-snippe-secret-key";
process.env.SNIPPE_WEBHOOK_SECRET = process.env.SNIPPE_WEBHOOK_SECRET || "test-snippe-webhook-secret";

// DB env vars - for the mocked suite (jest.config.js) these are never
// actually connected to (config/db.js's pool is always jest.mock()'d
// before use) and only need to exist to avoid a mysql2.createPool()
// warning at require-time. For the real-database suite
// (jest.db.config.js / tests/db-integration/**) these ARE the real
// connection details - see docker-compose.test.yml for the matching
// disposable MySQL container this points at.
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_PORT = process.env.DB_PORT || "3306";
process.env.DB_USER = process.env.DB_USER || "test";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test";
process.env.DB_NAME = process.env.DB_NAME || "nexora_test";

// Always force SSL off for the test DB, regardless of what's already in
// the environment. Without this, db.js's later require("dotenv").config()
// call fills these in from the real backend/.env (which has DB_SSL=true
// for the managed cloud DB) since dotenv never overrides a key that's
// already set - and setupEnv.js was setting DB_HOST/USER/PASSWORD/NAME
// but not the SSL vars, so they leaked through. The local Docker MySQL
// container doesn't support TLS, so that leak produced "Server does not
// support secure connection". Setting all three here (including as
// empty strings) pre-empts dotenv from ever filling them in.
process.env.DB_SSL = "false";
process.env.DB_SSL_REJECT_UNAUTHORIZED = "false";
process.env.DB_SSL_CA_PATH = "";
process.env.DB_SSL_CA = "";
