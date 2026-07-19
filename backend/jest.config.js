// Jest config for the NEXORA backend.
//
// Two suites live under tests/: `unit` (services/utils, DB and providers
// mocked at the module boundary - no network, no MySQL, fast) and
// `integration` (supertest against the real Express `app`, with only the
// mysql2 pool mocked - so routing/middleware/validation/controller wiring
// is exercised end-to-end, but no real database is required to run CI).
//
// A third suite, tests/db-integration/, runs real SQL against a real
// MySQL instance - see jest.db.config.js and `npm run test:db`. It's
// excluded here (testPathIgnorePatterns) so the default `npm test` never
// needs MySQL running and stays fast.
//
// Coverage thresholds are intentionally scoped to the modules with real
// test coverage rather than a single global number - see README "What
// remains" for anything not yet covered. Raising `global` before those
// exist would just make CI red for no benefit.
module.exports = {
    testEnvironment: "node",
    setupFiles: ["<rootDir>/tests/setupEnv.js"],
    testMatch: ["**/tests/**/*.test.js"],
    testPathIgnorePatterns: ["/node_modules/", "<rootDir>/tests/db-integration/"],
    collectCoverage: false, // enabled via --coverage (npm run test:coverage) to keep default `npm test` fast
    collectCoverageFrom: [
        "src/modules/payment/payment.service.js",
        "src/modules/payment/providers/snippe.provider.js",
        "src/modules/wallet/wallet.service.js",
        "src/modules/fraud/fraud.service.js",
        "src/modules/auth/login.service.js",
        "src/modules/order/order.service.js",
        "src/modules/cart/cart.service.js",
        "src/modules/admin/admin.service.js",
        "src/modules/chat/chat.service.js",
        "src/modules/delivery/delivery.service.js",
        "src/modules/dispute/dispute.service.js",
        "src/modules/seller/seller.service.js",
        "src/modules/notification/notification.service.js",
        "src/utils/deliveryPricing.js",
        "src/utils/appError.js",
        "src/i18n/index.js"
    ],
    coverageDirectory: "<rootDir>/coverage",
    coverageThreshold: {
        global: {
            statements: 75,
            branches: 60,
            functions: 65,
            lines: 75
        }
    },
    verbose: true,
    clearMocks: true,
    testTimeout: 10000
};
