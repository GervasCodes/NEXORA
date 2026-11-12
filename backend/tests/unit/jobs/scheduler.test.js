// Guards the LIVE job scheduler (src/jobs/index.js, the file server.js and
// worker.js load). An earlier version of this codebase kept three jobs
// (lowStockAlerts, preorderReminders, draftCleanup) in an unused duplicate
// scheduler file, so they never ran while a test that read that duplicate
// kept passing. This test executes the real startJobs() and pins the exact
// set of scheduled job names and cron expressions, so a job can neither
// disappear nor be left unscheduled without a test failing.

const scheduled = [];
const lockedNames = [];

jest.mock("node-cron", () => ({
    schedule: jest.fn((expr, fn) => {
        scheduled.push({ expr, fn });
    }),
}));

// Do not run any job: just record which job each wrapper would lock.
jest.mock("../../../src/utils/dbLock", () => ({
    withLock: jest.fn(async (name) => {
        lockedNames.push(name.replace("nexora:job:", ""));
        return { acquired: true };
    }),
}));

jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/config/db", () => ({ query: jest.fn(), getConnection: jest.fn() }));

const EXPECTED = {
    bookingExpiry: "*/15 * * * *",
    bookingLifecycle: "10 * * * *",
    codAutoConfirm: "*/30 * * * *",
    deliveryRematch: "*/5 * * * *",
    departmentMaintenanceSchedule: "* * * * *",
    disputeSla: "*/15 * * * *",
    documentRetention: "30 3 * * *",
    draftCleanup: "30 3 * * *",
    efdRetry: "*/30 * * * *",
    emailRetry: "*/5 * * * *",
    escrowRelease: "15 * * * *",
    featuredStoreExpiry: "0 * * * *",
    fuelCapReminder: "0 6 * * *",
    groupBuyExpiry: "*/15 * * * *",
    lowStockAlerts: "40 * * * *",
    otpCleanup: "0 3 * * *",
    paymentReconciliation: "0 4 * * *",
    preorderReminders: "0 * * * *",
    renderDeployHook: "0 */6 * * *",
    rewardSettlement: "20 * * * *",
    seoMetricsCleanup: "40 3 * * *",
    sponsorshipExpiry: "0 * * * *",
    staleOrders: "*/15 * * * *",
    subscriptionLifecycle: "30 2 * * *",
    supplyNudge: "*/30 * * * *",
    walletReconciliation: "20 3 * * *",
    webhookReplayCleanup: "10 3 * * *",
};

describe("live job scheduler (src/jobs/index.js)", () => {
    beforeAll(async () => {
        const { startJobs } = require("../../../src/jobs");
        startJobs();
        for (const s of scheduled) await s.fn();
    });

    it("schedules exactly the expected set of jobs", () => {
        expect([...lockedNames].sort()).toEqual(Object.keys(EXPECTED).sort());
    });

    it("uses the expected cron expression for every job", () => {
        const byName = {};
        scheduled.forEach((s, i) => { byName[lockedNames[i]] = s.expr; });
        expect(byName).toEqual(EXPECTED);
    });

    it("has no duplicate scheduler file next to it", () => {
        const fs = require("fs");
        const path = require("path");
        expect(fs.existsSync(path.join(__dirname, "../../../src/jobs/jobs.index.js"))).toBe(false);
    });
});
