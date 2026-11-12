// The return workflow moves money (refund + seller wallet reversal) and had no tests at all.
// State machine: requested -> approved -> shipped_back -> received -> refunded;
//                requested/approved -> rejected (seller/admin) or cancelled (buyer).
jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});
jest.mock("../../../src/modules/return/return.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/delivery/delivery.repository");
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/refund/refund.service");
jest.mock("../../../src/modules/refund/refundCap.service");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/utils/cloudinaryUpload", () => ({ uploadToCloudinary: jest.fn() }));

const db = require("../../../src/config/db");
const returnRepository = require("../../../src/modules/return/return.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const deliveryRepository = require("../../../src/modules/delivery/delivery.repository");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const notificationService = require("../../../src/modules/notification/notification.service");
const refundService = require("../../../src/modules/refund/refund.service");
const refundCapService = require("../../../src/modules/refund/refundCap.service");
const settingsService = require("../../../src/modules/settings/settings.service");
const service = require("../../../src/modules/return/return.service");

const DAY = 24 * 60 * 60 * 1000;
const BUYER = 10;
const SELLER = 20;

const deliveredOrder = (extra = {}) => ({ id: 1, buyer_id: BUYER, status: "delivered", order_number: "NX-1", total_amount: "50000.00", updated_at: new Date(), buyer_protection_addon: 0, ...extra });
const returnRow = (status, extra = {}) => ({ id: 5, order_id: 1, order_item_id: null, buyer_id: BUYER, seller_id: SELLER, status, ...extra });

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    jest.resetAllMocks();
    db.getConnection.mockResolvedValue(db.__mockConnection);
    returnRepository.create.mockResolvedValue(5);
    returnRepository.findHistory.mockResolvedValue([]);
    returnRepository.findEvidence.mockResolvedValue([]);
    returnRepository.findOpenByOrderAndItem.mockResolvedValue(null);
    returnRepository.findById.mockResolvedValue(returnRow("requested"));
    orderRepository.findOrderById.mockResolvedValue(deliveredOrder());
    orderRepository.findOrderItems.mockResolvedValue([{ id: 100, seller_id: SELLER, subtotal: "20000.00" }]);
    deliveryRepository.findByOrderId.mockResolvedValue({ delivered_at: new Date() });
    settingsService.getReturnWindowDays.mockResolvedValue(7);
    settingsService.getReturnWindowInsuredDays.mockResolvedValue(14);
    notificationService.notify.mockResolvedValue(undefined);
    refundCapService.withTransaction.mockImplementation(async (fn) => fn({}));
    refundCapService.reserveRefund.mockResolvedValue(undefined);
    refundService.autoRefundForReturn.mockResolvedValue(undefined);
    db.__mockConnection.beginTransaction.mockResolvedValue(undefined);
    db.__mockConnection.commit.mockResolvedValue(undefined);
    db.__mockConnection.rollback.mockResolvedValue(undefined);
    walletRepository.ensureWallet.mockResolvedValue(undefined);
});

describe("return.service.requestReturn", () => {
    const request = (extra = {}) => service.requestReturn(BUYER, { order_id: 1, reason: "damaged_item", description: "cracked", ...extra });

    it("opens a return on a delivered order, records history and tells the seller", async () => {
        const result = await request();
        expect(returnRepository.create).toHaveBeenCalledWith(expect.objectContaining({ orderId: 1, buyerId: BUYER, sellerId: SELLER, reason: "damaged_item", returnWindowDays: 7 }));
        expect(returnRepository.addHistory).toHaveBeenCalledWith(5, "requested", "Reason: damaged_item", BUYER);
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: SELLER, type: "return_requested" }));
        expect(result.id).toBe(5);
    });

    it("rejects an unknown reason before touching anything", async () => {
        await expect(request({ reason: "because" })).rejects.toThrow("Invalid return reason");
        expect(orderRepository.findOrderById).not.toHaveBeenCalled();
    });

    it("does not reveal or allow another buyer's order", async () => {
        orderRepository.findOrderById.mockResolvedValue(deliveredOrder({ buyer_id: 999 }));
        await expect(request()).rejects.toThrow("Order not found");
        orderRepository.findOrderById.mockResolvedValue(null);
        await expect(request()).rejects.toThrow("Order not found");
        expect(returnRepository.create).not.toHaveBeenCalled();
    });

    it.each(["pending", "processing", "shipped", "cancelled"])("refuses an order that is %s (only delivered orders can be returned)", async (status) => {
        orderRepository.findOrderById.mockResolvedValue(deliveredOrder({ status }));
        await expect(request()).rejects.toThrow("Only a delivered order can be returned");
    });

    it("refuses a second open return for the same order", async () => {
        returnRepository.findOpenByOrderAndItem.mockResolvedValue({ id: 4 });
        await expect(request()).rejects.toThrow("already an open return");
    });

    describe("return window", () => {
        it("accepts a return 6 days after delivery (default window 7 days)", async () => {
            deliveryRepository.findByOrderId.mockResolvedValue({ delivered_at: new Date(Date.now() - 6 * DAY) });
            await expect(request()).resolves.toBeDefined();
        });

        it("refuses a return 8 days after delivery", async () => {
            deliveryRepository.findByOrderId.mockResolvedValue({ delivered_at: new Date(Date.now() - 8 * DAY) });
            await expect(request()).rejects.toThrow("7-day return window");
            expect(returnRepository.create).not.toHaveBeenCalled();
        });

        it("gives an order with the buyer-protection add-on the longer (14-day) window", async () => {
            orderRepository.findOrderById.mockResolvedValue(deliveredOrder({ buyer_protection_addon: 1 }));
            deliveryRepository.findByOrderId.mockResolvedValue({ delivered_at: new Date(Date.now() - 10 * DAY) });
            await request();
            expect(returnRepository.create).toHaveBeenCalledWith(expect.objectContaining({ returnWindowDays: 14 }));
            deliveryRepository.findByOrderId.mockResolvedValue({ delivered_at: new Date(Date.now() - 15 * DAY) });
            await expect(request()).rejects.toThrow("14-day return window");
        });

        it("uses the admin-configured window, and falls back to 7/14 if the setting cannot be read", async () => {
            settingsService.getReturnWindowDays.mockResolvedValue(3);
            deliveryRepository.findByOrderId.mockResolvedValue({ delivered_at: new Date(Date.now() - 4 * DAY) });
            await expect(request()).rejects.toThrow("3-day return window");

            settingsService.getReturnWindowDays.mockRejectedValue(new Error("db down"));
            deliveryRepository.findByOrderId.mockResolvedValue({ delivered_at: new Date(Date.now() - 6 * DAY) });
            await expect(request()).resolves.toBeDefined();
        });

        it("counts from the order's last update when there is no delivery record", async () => {
            deliveryRepository.findByOrderId.mockResolvedValue(null);
            orderRepository.findOrderById.mockResolvedValue(deliveredOrder({ updated_at: new Date(Date.now() - 9 * DAY) }));
            await expect(request()).rejects.toThrow("return window");
        });
    });

    it("returns one item of a multi-item order against that item's seller", async () => {
        orderRepository.findOrderItems.mockResolvedValue([{ id: 100, seller_id: SELLER, subtotal: "1" }, { id: 101, seller_id: 77, subtotal: "2" }]);
        await request({ order_item_id: 101 });
        expect(returnRepository.create).toHaveBeenCalledWith(expect.objectContaining({ orderItemId: 101, sellerId: 77 }));
    });

    it("refuses an item that is not on the order", async () => {
        await expect(request({ order_item_id: 555 })).rejects.toThrow("Order item not found");
    });

    it("leaves the seller empty for a whole-order return spanning several sellers (each slice is returned separately)", async () => {
        orderRepository.findOrderItems.mockResolvedValue([{ id: 100, seller_id: 1 }, { id: 101, seller_id: 2 }]);
        await request();
        expect(returnRepository.create).toHaveBeenCalledWith(expect.objectContaining({ sellerId: null }));
        expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it("still succeeds when the seller notification fails", async () => {
        notificationService.notify.mockRejectedValue(new Error("smtp"));
        await expect(request()).resolves.toBeDefined();
    });
});

describe("return.service: moving through the states", () => {
    it("the buyer can cancel a requested or approved return, nothing later", async () => {
        for (const status of ["requested", "approved"]) {
            returnRepository.findById.mockResolvedValue(returnRow(status));
            await service.cancelReturn(5, BUYER);
            expect(returnRepository.updateStatus).toHaveBeenLastCalledWith(5, "cancelled");
        }
        for (const status of ["shipped_back", "received", "refunded", "rejected", "cancelled"]) {
            returnRepository.findById.mockResolvedValue(returnRow(status));
            await expect(service.cancelReturn(5, BUYER)).rejects.toThrow("can no longer be cancelled");
        }
    });

    it("only the buyer who owns the return can cancel it", async () => {
        await expect(service.cancelReturn(5, 999)).rejects.toThrow("Return not found");
        returnRepository.findById.mockResolvedValue(null);
        await expect(service.cancelReturn(5, BUYER)).rejects.toThrow("Return not found");
    });

    it("the seller or an admin approves a requested return and the buyer is told", async () => {
        await service.approveReturn(5, SELLER, "seller");
        expect(returnRepository.updateStatus).toHaveBeenCalledWith(5, "approved", { decidedBy: SELLER });
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: BUYER }));
        await service.approveReturn(5, 1, "admin");
        expect(returnRepository.updateStatus).toHaveBeenCalledTimes(2);
    });

    it("approving is only possible from 'requested'", async () => {
        for (const status of ["approved", "shipped_back", "rejected", "cancelled"]) {
            returnRepository.findById.mockResolvedValue(returnRow(status));
            await expect(service.approveReturn(5, SELLER, "seller")).rejects.toThrow('Only a "requested" return can be approved');
        }
    });

    it("another seller, the buyer, or a delivery agent cannot decide on someone else's return", async () => {
        await expect(service.approveReturn(5, 999, "seller")).rejects.toThrow("Return not found");
        await expect(service.approveReturn(5, BUYER, "buyer")).rejects.toThrow("Return not found");
        await expect(service.rejectReturn(5, 3, "delivery_agent", "no")).rejects.toThrow("Return not found");
        expect(returnRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("the buyer who owns the return cannot approve, reject or confirm receipt of it (decisions are for seller/admin)", async () => {
        await expect(service.approveReturn(5, BUYER, "buyer")).rejects.toThrow("Return not found");
        await expect(service.rejectReturn(5, BUYER, "buyer", "mine")).rejects.toThrow("Return not found");
        returnRepository.findById.mockResolvedValue(returnRow("shipped_back"));
        await expect(service.markReceived(5, BUYER, "buyer")).rejects.toThrow("Return not found");
        expect(returnRepository.updateStatus).not.toHaveBeenCalled();
        expect(refundService.autoRefundForReturn).not.toHaveBeenCalled();
    });

    it("rejecting needs a reason (blank is not a reason) and works from requested or approved", async () => {
        await expect(service.rejectReturn(5, SELLER, "seller", "")).rejects.toThrow("A rejection reason is required");
        await expect(service.rejectReturn(5, SELLER, "seller", "   ")).rejects.toThrow("A rejection reason is required");
        await service.rejectReturn(5, SELLER, "seller", "Worn, not defective");
        expect(returnRepository.updateStatus).toHaveBeenCalledWith(5, "rejected", { rejectionReason: "Worn, not defective", decidedBy: SELLER });
        returnRepository.findById.mockResolvedValue(returnRow("approved"));
        await expect(service.rejectReturn(5, SELLER, "seller", "late")).resolves.toBeDefined();
    });

    it("cannot reject once the item is on its way back or later", async () => {
        returnRepository.findById.mockResolvedValue(returnRow("shipped_back"));
        await expect(service.rejectReturn(5, SELLER, "seller", "no")).rejects.toThrow("can no longer be rejected");
    });

    it("shipping back needs an approved return and a tracking number", async () => {
        returnRepository.findById.mockResolvedValue(returnRow("requested"));
        await expect(service.markShippedBack(5, BUYER, { tracking_number: "T1" })).rejects.toThrow("must be approved before shipping");
        returnRepository.findById.mockResolvedValue(returnRow("approved"));
        await expect(service.markShippedBack(5, BUYER, { tracking_number: " " })).rejects.toThrow("A tracking number is required");
        await expect(service.markShippedBack(5, 999, { tracking_number: "T1" })).rejects.toThrow("Return not found");
        await service.markShippedBack(5, BUYER, { tracking_number: "T1", carrier: "DHL" });
        expect(returnRepository.updateStatus).toHaveBeenCalledWith(5, "shipped_back", { trackingNumber: "T1", carrier: "DHL" });
    });
});

describe("return.service.markReceived (this is where the money moves)", () => {
    beforeEach(() => {
        returnRepository.findById.mockResolvedValue(returnRow("shipped_back"));
        walletRepository.getWalletForUpdate.mockResolvedValue({ held_balance: "0", balance: "100000" });
        walletRepository.incrementBalance.mockResolvedValue(80000);
        walletRepository.incrementHeldBalance.mockResolvedValue(0);
    });

    it("is only possible after the item was shipped back", async () => {
        for (const status of ["requested", "approved", "received", "refunded"]) {
            returnRepository.findById.mockResolvedValue(returnRow(status));
            await expect(service.markReceived(5, SELLER, "seller")).rejects.toThrow("hasn't been shipped back yet");
        }
        expect(refundCapService.reserveRefund).not.toHaveBeenCalled();
        expect(refundService.autoRefundForReturn).not.toHaveBeenCalled();
    });

    it("refunds the whole order total for a whole-order return and starts the automatic refund", async () => {
        await service.markReceived(5, SELLER, "seller");
        expect(refundCapService.reserveRefund).toHaveBeenCalledWith({}, { orderId: 1, orderItemId: null, amount: 50000 });
        expect(returnRepository.updateStatus).toHaveBeenCalledWith(5, "received", { markReceived: true, refundAmount: 50000 });
        expect(refundService.autoRefundForReturn).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000, requestedBy: SELLER }));
    });

    it("refunds only that item's subtotal for an item return", async () => {
        returnRepository.findById.mockResolvedValue(returnRow("shipped_back", { order_item_id: 100 }));
        await service.markReceived(5, SELLER, "seller");
        expect(refundCapService.reserveRefund).toHaveBeenCalledWith({}, { orderId: 1, orderItemId: 100, amount: 20000 });
        expect(refundService.autoRefundForReturn).toHaveBeenCalledWith(expect.objectContaining({ amount: 20000 }));
    });

    it("does not refund anything when the refund cap would be exceeded (and nothing is marked received)", async () => {
        refundCapService.reserveRefund.mockRejectedValue(new Error("Refund exceeds what is left to refund"));
        await expect(service.markReceived(5, SELLER, "seller")).rejects.toThrow("exceeds");
        expect(returnRepository.updateStatus).not.toHaveBeenCalled();
        expect(refundService.autoRefundForReturn).not.toHaveBeenCalled();
    });

    it("reverses the seller's earnings: held balance first, then available balance, each as a debit", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ held_balance: "30000", balance: "100000" });
        walletRepository.incrementHeldBalance.mockResolvedValue(0);
        walletRepository.incrementBalance.mockResolvedValue(80000);
        await service.markReceived(5, SELLER, "seller");

        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(SELLER, -30000, db.__mockConnection);
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(SELLER, -20000, db.__mockConnection);
        const debits = walletRepository.insertTransaction.mock.calls.map(([tx]) => [tx.type, tx.amount, tx.referenceType, tx.referenceId]);
        expect(debits).toEqual([["debit", 30000, "return", 5], ["debit", 20000, "return", 5]]);
        expect(db.__mockConnection.commit).toHaveBeenCalled();
        expect(db.__mockConnection.release).toHaveBeenCalled();
    });

    it("takes the whole reversal from the available balance when nothing is held", async () => {
        await service.markReceived(5, SELLER, "seller");
        expect(walletRepository.incrementHeldBalance).not.toHaveBeenCalled();
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(SELLER, -50000, db.__mockConnection);
    });

    it("a failed wallet reversal is rolled back and reported but does not undo the return", async () => {
        walletRepository.incrementBalance.mockRejectedValue(new Error("deadlock"));
        const Sentry = require("../../../src/config/sentry");
        const result = await service.markReceived(5, SELLER, "seller");
        await flush();
        expect(db.__mockConnection.rollback).toHaveBeenCalled();
        expect(db.__mockConnection.release).toHaveBeenCalled();
        expect(Sentry.captureException).toHaveBeenCalled();
        expect(returnRepository.updateStatus).toHaveBeenCalledWith(5, "received", expect.any(Object));
        expect(result).toBeDefined();
    });

    it("a failed automatic refund is reported but the return is still marked received", async () => {
        refundService.autoRefundForReturn.mockRejectedValue(new Error("provider down"));
        const Sentry = require("../../../src/config/sentry");
        await expect(service.markReceived(5, SELLER, "seller")).resolves.toBeDefined();
        await flush();
        expect(Sentry.captureException).toHaveBeenCalled();
    });

    it("skips the wallet reversal when no seller is attached (split-cart parent order)", async () => {
        returnRepository.findById.mockResolvedValue(returnRow("shipped_back", { seller_id: null }));
        await service.markReceived(5, 1, "admin");
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("another seller cannot confirm receipt", async () => {
        await expect(service.markReceived(5, 999, "seller")).rejects.toThrow("Return not found");
    });
});

describe("return.service.markRefunded / getDetail", () => {
    it("markRefunded records the refunded status and history", async () => {
        await service.markRefunded(5);
        expect(returnRepository.updateStatus).toHaveBeenCalledWith(5, "refunded");
        expect(returnRepository.addHistory).toHaveBeenCalledWith(5, "refunded", null, null);
    });

    it("getDetail only shows a return to its buyer, its seller or an admin", async () => {
        await expect(service.getDetail(5, BUYER, "buyer")).resolves.toMatchObject({ id: 5 });
        await expect(service.getDetail(5, SELLER, "seller")).resolves.toMatchObject({ id: 5 });
        await expect(service.getDetail(5, 1, "admin")).resolves.toMatchObject({ id: 5 });
        await expect(service.getDetail(5, 999, "buyer")).rejects.toThrow("Return not found");
        await expect(service.getDetail(5, 999, "seller")).rejects.toThrow("Return not found");
        await expect(service.getDetail(5, 2, "delivery_agent")).rejects.toThrow("Return not found");
    });

    it("exposes the documented reasons and windows", () => {
        expect(service.REASONS).toEqual(["damaged_item", "wrong_item", "defective_product", "not_as_described", "changed_mind", "other"]);
        expect(service.DEFAULT_WINDOW_DAYS).toBe(7);
        expect(service.INSURED_WINDOW_DAYS).toBe(14);
    });
});

describe("return routes: who may call what (route guards)", () => {
    const { buildInventory } = require("../../../scripts/routeInventory");
    const routes = buildInventory().filter((r) => r.path.startsWith("/api/v1/returns"));
    const rolesOf = (r) => r.guards.filter((g) => g.startsWith("role:")).map((g) => g.slice(5)).sort();
    const find = (method, suffix) => routes.find((r) => r.method === method && r.path.endsWith(suffix));

    it("finds the return routes", () => {
        expect(routes.length).toBeGreaterThanOrEqual(12);
    });

    it.each([["PUT", "/seller/{id}/approve", ["seller"]], ["PUT", "/seller/{id}/reject", ["seller"]], ["PUT", "/seller/{id}/received", ["seller"]],
        ["PUT", "/admin/{id}/approve", ["admin"]], ["PUT", "/admin/{id}/reject", ["admin"]], ["PUT", "/admin/{id}/received", ["admin"]],
        ["PUT", "/{id}/cancel", ["buyer"]], ["PUT", "/{id}/ship-back", ["buyer"]], ["POST", "/returns", ["buyer"]]])("%s ...%s is limited to %j", (method, suffix, roles) => {
        const route = find(method, suffix);
        expect(route).toBeDefined();
        expect(rolesOf(route)).toEqual(roles);
    });

    it("every return route requires a signed-in user", () => {
        routes.forEach((r) => expect(r.guards).toContain("auth"));
    });
});
