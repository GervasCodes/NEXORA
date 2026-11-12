// The dispute SLA sweep (every 15 minutes) alerts admins when a dispute has been open 12h / 20h, and when a
// seller has not answered in time. It used to chain `.catch(...)` onto adminNotificationService.notify(),
// which is fire-and-forget and returns undefined. That threw a TypeError right after the first alert was
// created and BEFORE the dispute was marked as notified, so every run repeated the first dispute's alert
// and never reached the others. These tests use a notify() that behaves like the real one.
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});
jest.mock("../../../src/modules/dispute/dispute.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/adminNotification/adminNotification.service");

const disputeRepository = require("../../../src/modules/dispute/dispute.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const adminNotificationService = require("../../../src/modules/adminNotification/adminNotification.service");
const job = require("../../../src/jobs/disputeSla.job");

const d = (id) => ({ id, order_id: id * 10, dispute_number: `DSP-${id}`, order_number: `NX-${id}`, seller_id: id * 100 });

beforeEach(() => {
    jest.resetAllMocks();
    // Real behaviour: fire-and-forget, returns undefined.
    adminNotificationService.notify.mockReturnValue(undefined);
    disputeRepository.findUnnotifiedAtCheckpoint.mockResolvedValue([]);
    disputeRepository.findOverdueForSellerResponse.mockResolvedValue([]);
    disputeRepository.markCheckpointNotified.mockResolvedValue(undefined);
    disputeRepository.markSellerResponseOverdue.mockResolvedValue(undefined);
    settingsService.getDisputeSellerResponseHours.mockResolvedValue(72);
});

describe("disputeSla.job.run", () => {
    it("does nothing, and says nothing, when no dispute has reached a checkpoint", async () => {
        await job.run();
        expect(adminNotificationService.notify).not.toHaveBeenCalled();
    });

    it("alerts for EVERY dispute at the 12h checkpoint and marks each one as notified", async () => {
        disputeRepository.findUnnotifiedAtCheckpoint.mockImplementation(async (hours) => (hours === 12 ? [d(1), d(2), d(3)] : []));
        await job.run();

        expect(adminNotificationService.notify).toHaveBeenCalledTimes(3);
        expect(adminNotificationService.notify.mock.calls.map(([n]) => n.type)).toEqual(["dispute_sla_12h", "dispute_sla_12h", "dispute_sla_12h"]);
        expect(disputeRepository.markCheckpointNotified.mock.calls).toEqual([[1, "sla_12h_notified_at"], [2, "sla_12h_notified_at"], [3, "sla_12h_notified_at"]]);
    });

    it("does the same at 20h, with warning severity", async () => {
        disputeRepository.findUnnotifiedAtCheckpoint.mockImplementation(async (hours) => (hours === 20 ? [d(4), d(5)] : []));
        await job.run();
        expect(adminNotificationService.notify).toHaveBeenCalledTimes(2);
        expect(adminNotificationService.notify.mock.calls[0][0]).toMatchObject({ type: "dispute_sla_20h", severity: "warning" });
        expect(disputeRepository.markCheckpointNotified).toHaveBeenCalledWith(4, "sla_20h_notified_at");
        expect(disputeRepository.markCheckpointNotified).toHaveBeenCalledWith(5, "sla_20h_notified_at");
    });

    it("flags every dispute where the seller has not responded in time, using the configured number of hours", async () => {
        disputeRepository.findOverdueForSellerResponse.mockResolvedValue([d(6), d(7)]);
        await job.run();
        expect(disputeRepository.findOverdueForSellerResponse).toHaveBeenCalledWith(72);
        expect(disputeRepository.markSellerResponseOverdue.mock.calls).toEqual([[6], [7]]);
        expect(adminNotificationService.notify.mock.calls.map(([n]) => [n.type, n.metadata.seller_id])).toEqual([["dispute_seller_overdue", 600], ["dispute_seller_overdue", 700]]);
    });

    it("uses a different configured response time when the admin changes it", async () => {
        settingsService.getDisputeSellerResponseHours.mockResolvedValue(24);
        await job.run();
        expect(disputeRepository.findOverdueForSellerResponse).toHaveBeenCalledWith(24);
    });

    it("running again after the checkpoints were marked does not alert again (the repository no longer returns them)", async () => {
        disputeRepository.findUnnotifiedAtCheckpoint.mockResolvedValueOnce([d(1)]).mockResolvedValueOnce([]).mockResolvedValue([]);
        await job.run();
        await job.run();
        expect(adminNotificationService.notify).toHaveBeenCalledTimes(1);
    });
});
