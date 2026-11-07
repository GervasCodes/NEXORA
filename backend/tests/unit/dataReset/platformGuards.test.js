jest.mock("../../../src/modules/dataReset/dataReset.repository", () => ({
    findAllOrderIds: jest.fn(),
    findAllBookingIds: jest.fn(),
    findUserPasswordHash: jest.fn(),
    countPaidOrders: jest.fn(),
    consumeApproval: jest.fn(),
    createApproval: jest.fn(),
    findApproval: jest.fn(),
    approve: jest.fn()
}));
jest.mock("../../../src/utils/comparePassword", () => jest.fn());
jest.mock("../../../src/modules/audit/audit.service", () => ({ log: jest.fn(), logFromRequest: jest.fn() }));
jest.mock("../../../src/modules/adminNotification/adminNotification.service", () => ({ notify: jest.fn() }));

const repository = require("../../../src/modules/dataReset/dataReset.repository");
const comparePassword = require("../../../src/utils/comparePassword");
const service = require("../../../src/modules/dataReset/dataReset.service");

describe("platform reset guards", () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV, NODE_ENV: "production" };
        delete process.env.ALLOW_PLATFORM_DATA_RESET;
        delete process.env.ALLOW_PLATFORM_DATA_RESET_REAL;
    });

    afterEach(() => {
        process.env = OLD_ENV;
    });

    it("is switched off in production unless the server flag is set", async () => {
        await expect(
            service.resetPlatform({ testOnly: true, confirmation: "RESET ENTIRE PLATFORM", password: "pw" }, { actorId: 1 })
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.findAllOrderIds).not.toHaveBeenCalled();
    });

    it("needs a second flag to delete real (non-test) data", async () => {
        process.env.ALLOW_PLATFORM_DATA_RESET = "true";
        await expect(
            service.resetPlatform({ testOnly: false, confirmation: "RESET ENTIRE PLATFORM", password: "pw" }, { actorId: 1 })
        ).rejects.toMatchObject({ status: 403 });
    });

    it("refuses a wrong password before touching any data", async () => {
        process.env.ALLOW_PLATFORM_DATA_RESET = "true";
        repository.findUserPasswordHash.mockResolvedValue("hash");
        comparePassword.mockResolvedValue(false);
        await expect(
            service.resetPlatform({ testOnly: true, confirmation: "RESET ENTIRE PLATFORM", password: "bad" }, { actorId: 1 })
        ).rejects.toThrow(/password incorrect/i);
        expect(repository.findAllOrderIds).not.toHaveBeenCalled();
    });

    it("cannot be approved by the person who requested it", async () => {
        repository.findUserPasswordHash.mockResolvedValue("hash");
        comparePassword.mockResolvedValue(true);
        repository.findApproval.mockResolvedValue({ id: 3, requested_by: 1, test_only: 1 });
        await expect(
            service.approvePlatformReset(3, { actorId: 1, password: "pw" })
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.approve).not.toHaveBeenCalled();
    });
});
