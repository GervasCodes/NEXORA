// A provider declining a booking request. If it was already paid, the provider's escrowed earnings are
// reversed and the customer is refunded. When the reversal FAILS, an admin must be told to reconcile it by
// hand; that error handler used to chain `.catch` onto the fire-and-forget adminNotificationService.notify()
// (which returns undefined), throwing a TypeError inside the handler and surfacing as an unhandled rejection.
jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});
jest.mock("../../../src/modules/booking/booking.repository");
jest.mock("../../../src/modules/availability/availability.repository");
jest.mock("../../../src/modules/service/service.repository");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/wallet/wallet.service");
jest.mock("../../../src/modules/refund/refund.service");
jest.mock("../../../src/modules/adminNotification/adminNotification.service");
jest.mock("../../../src/modules/review/review.repository");

const Sentry = require("../../../src/config/sentry");
const bookingRepository = require("../../../src/modules/booking/booking.repository");
const notificationService = require("../../../src/modules/notification/notification.service");
const walletService = require("../../../src/modules/wallet/wallet.service");
const refundService = require("../../../src/modules/refund/refund.service");
const adminNotificationService = require("../../../src/modules/adminNotification/adminNotification.service");
const service = require("../../../src/modules/booking/booking.service");

const PROVIDER = 50;
const booking = (extra = {}) => ({ id: 8, provider_id: PROVIDER, customer_id: 11, service_id: 3, status: "pending", payment_status: "unpaid", amount: "40000.00", booking_reference: "BK-8", ...extra });
const flush = () => new Promise((resolve) => setImmediate(resolve));

let unhandled;
const onUnhandled = (reason) => unhandled.push(reason);

beforeEach(() => {
    jest.resetAllMocks();
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);
    bookingRepository.findById.mockResolvedValue(booking());
    bookingRepository.findItemsByBookingId.mockResolvedValue([{ id: 1 }]);
    bookingRepository.cancelBooking.mockResolvedValue(true);
    notificationService.notify.mockResolvedValue(undefined);
    walletService.reverseProviderEarningsForBooking.mockResolvedValue(undefined);
    refundService.autoRefundForBooking.mockResolvedValue(undefined);
    adminNotificationService.notify.mockReturnValue(undefined); // the real one is fire-and-forget
});
afterEach(() => process.off("unhandledRejection", onUnhandled));

describe("booking.service.rejectBooking", () => {
    it("lets only the booking's own provider decline it, and reports others as 'not found'", async () => {
        await expect(service.rejectBooking(8, 999)).rejects.toThrow("Booking not found");
        bookingRepository.findById.mockResolvedValue(null);
        await expect(service.rejectBooking(8, PROVIDER)).rejects.toThrow("Booking not found");
        expect(bookingRepository.cancelBooking).not.toHaveBeenCalled();
    });

    it.each(["confirmed", "active", "completed", "cancelled", "refunded", "rejected"])("only a pending booking can be declined (not %s)", async (status) => {
        bookingRepository.findById.mockResolvedValue(booking({ status }));
        await expect(service.rejectBooking(8, PROVIDER)).rejects.toThrow("can no longer be rejected");
        expect(bookingRepository.cancelBooking).not.toHaveBeenCalled();
    });

    it("an unpaid booking becomes 'rejected', is not refunded, and the customer is told", async () => {
        await service.rejectBooking(8, PROVIDER);
        expect(bookingRepository.cancelBooking).toHaveBeenCalledWith(8, 3, [{ id: 1 }], "rejected");
        expect(walletService.reverseProviderEarningsForBooking).not.toHaveBeenCalled();
        expect(refundService.autoRefundForBooking).not.toHaveBeenCalled();
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 11, type: "booking_rejected", message: "Booking BK-8 was declined by the provider." }));
    });

    it("a paid booking becomes 'refunded': earnings reversed, customer refunded in full, customer told", async () => {
        bookingRepository.findById.mockResolvedValue(booking({ payment_status: "paid" }));
        await service.rejectBooking(8, PROVIDER);
        expect(bookingRepository.cancelBooking).toHaveBeenCalledWith(8, 3, [{ id: 1 }], "refunded");
        expect(walletService.reverseProviderEarningsForBooking).toHaveBeenCalledWith(PROVIDER, 40000, 8);
        expect(refundService.autoRefundForBooking).toHaveBeenCalledWith({ booking: expect.objectContaining({ id: 8 }), amount: 40000, requestedBy: null });
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("refunded") }));
    });

    it("does nothing further if another request already changed the booking (race)", async () => {
        bookingRepository.cancelBooking.mockResolvedValue(false);
        await expect(service.rejectBooking(8, PROVIDER)).rejects.toThrow("can no longer be rejected");
        expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it("a FAILED wallet reversal tells an admin to reconcile it by hand, with no unhandled rejection", async () => {
        bookingRepository.findById.mockResolvedValue(booking({ payment_status: "paid" }));
        walletService.reverseProviderEarningsForBooking.mockRejectedValue(new Error("deadlock"));

        await service.rejectBooking(8, PROVIDER);
        await flush();
        await flush();

        expect(Sentry.captureException).toHaveBeenCalled();
        expect(adminNotificationService.notify).toHaveBeenCalledWith(expect.objectContaining({
            type: "booking_wallet_reversal_failed", category: "finance", severity: "error", metadata: { bookingId: 8 }
        }));
        expect(unhandled).toEqual([]);
        // The customer is still refunded and told, even though the reversal needs manual follow-up.
        expect(refundService.autoRefundForBooking).toHaveBeenCalled();
        expect(notificationService.notify).toHaveBeenCalled();
    });

    it("a failed refund is reported to Sentry but does not undo the rejection", async () => {
        bookingRepository.findById.mockResolvedValue(booking({ payment_status: "paid" }));
        refundService.autoRefundForBooking.mockRejectedValue(new Error("provider down"));
        await expect(service.rejectBooking(8, PROVIDER)).resolves.toBeUndefined();
        await flush();
        expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ tags: expect.objectContaining({ stage: "refund" }) }));
        expect(unhandled).toEqual([]);
    });
});
