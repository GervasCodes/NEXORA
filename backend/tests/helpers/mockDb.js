// Reusable mock of `backend/src/config/db.js` (the mysql2 pool) for
// integration tests. Real integration tests here exercise routing,
// middleware, and controller/service wiring against the actual Express
// `app` via supertest - but never a real database. Call
// `jest.mock("../../src/config/db", () => require("../helpers/mockDb"))`
// (adjust relative path) at the top of a test file, then drive
// `db.query.mockResolvedValueOnce([...])` per call the code under test is
// expected to make, in call order.
const mockConnection = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    query: jest.fn()
};

const db = {
    query: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(mockConnection),
    on: jest.fn(),
    __mockConnection: mockConnection
};

module.exports = db;
