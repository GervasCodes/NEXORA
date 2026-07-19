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
process.env.MALIPOPAY_WEBHOOK_SECRET = process.env.MALIPOPAY_WEBHOOK_SECRET || "test-malipopay-secret";
process.env.SELCOM_WEBHOOK_SECRET = process.env.SELCOM_WEBHOOK_SECRET || "test-selcom-secret";
process.env.SNIPPE_SECRET_KEY = process.env.SNIPPE_SECRET_KEY || "test-snippe-secret-key";
process.env.SNIPPE_WEBHOOK_SECRET = process.env.SNIPPE_WEBHOOK_SECRET || "test-snippe-webhook-secret";

// DB env vars - never actually connected to in tests (config/db.js's pool
// is always jest.mock()'d before use), but mysql2.createPool() reads these
// synchronously at require-time, so they need to exist to avoid a warning.
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_PORT = process.env.DB_PORT || "3306";
process.env.DB_USER = process.env.DB_USER || "test";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test";
process.env.DB_NAME = process.env.DB_NAME || "nexora_test";
