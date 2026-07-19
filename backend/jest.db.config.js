// Jest config for the real-database integration suite (tests/db-integration/).
//
// Unlike the main suite (jest.config.js), nothing here mocks the mysql2
// pool - these tests run real SQL against a real MySQL instance and exist
// specifically to catch what a fully-mocked pool never can: a typo'd
// column name, a broken JOIN, a FK/constraint violation, or a transaction
// that doesn't actually roll back.
//
// Needs a running MySQL with migrations applied first - see
// docker-compose.test.yml at the repo root and `npm run test:db`
// (which runs migrations, then this config, then exits) for the full
// sequence. Never run as part of plain `npm test`.
module.exports = {
    testEnvironment: "node",
    setupFiles: ["<rootDir>/tests/setupEnv.js"],
    testMatch: ["**/tests/db-integration/**/*.db.test.js"],
    collectCoverage: false,
    verbose: true,
    clearMocks: true,
    // Real network/transaction round trips are slower than the mocked
    // suite's in-process calls - give them more room than the default
    // 10s before a hung connection is reported as a failure.
    testTimeout: 30000,
    // Real MySQL, one process at a time - concurrent test files sharing
    // the same tables would otherwise race each other's fixture cleanup.
    maxWorkers: 1
};
