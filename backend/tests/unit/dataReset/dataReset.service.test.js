jest.mock("../../../src/config/db");
jest.mock("../../../src/modules/dataReset/dataReset.repository");
jest.mock("../../../src/modules/audit/audit.repository");
jest.mock("../../../src/modules/audit/audit.service");
jest.mock("../../../src/modules/adminNotification/adminNotification.service");

const db = require("../../../src/config/db");
const dataResetRepository = require("../../../src/modules/dataReset/dataReset.repository");
const auditRepository = require("../../../src/modules/audit/audit.repository");
const auditService = require("../../../src/modules/audit/audit.service");

const dataResetService = require("../../../src/modules/dataReset/dataReset.service");

const seller = {
    id: 7,
    first_name: "Asha",
    last_name: "Mwakalinga",
    email: "asha@example.com",
    role: "seller",
    store_name: "Asha Crochet"
};

let connection;

// Records the order repository calls happen in, so the tests can assert on
// sequencing (audit before delete, RESTRICT dependents before orders)
// rather than just on "it was called at some point".
let callOrder;

const trackCalls = () => {
    callOrder = [];
    const track = (name, impl) => (...args) => {
        callOrder.push(name);
        return impl(...args);
    };

    auditRepository.insertLog.mockImplementation(track("audit.insert", async () => undefined));
    dataResetRepository.deleteOrderTree.mockImplementation(
        track("delete.orders", async (_conn, ids) => ({ orders: ids.length }))
    );
    dataResetRepository.deleteBookingTree.mockImplementation(
        track("delete.bookings", async (_conn, ids) => ({ bookings: ids.length }))
    );
    dataResetRepository.deleteBuyerLedgerForOrders.mockImplementation(
        track("delete.buyerLedger", async () => 0)
    );
};

beforeEach(() => {
    connection = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn()
    };
    db.getConnection = jest.fn().mockResolvedValue(connection);

    dataResetRepository.findSeller.mockResolvedValue(seller);
    dataResetRepository.findSellerOrderIds.mockResolvedValue([11, 12]);
    dataResetRepository.findAllOrderIds.mockResolvedValue([11, 12, 13]);
    dataResetRepository.findSellerBookingIds.mockResolvedValue([21]);
    dataResetRepository.findAllBookingIds.mockResolvedValue([21, 22]);
    dataResetRepository.findParentIdsOf.mockResolvedValue([]);
    dataResetRepository.findOrphanedParentOrderIds.mockResolvedValue([]);
    dataResetRepository.countSellerScope.mockResolvedValue({ orders: 2, bookings: 1, reviews: 1 });
    dataResetRepository.countPlatformScope.mockResolvedValue({ orders: 3, bookings: 2, reviews: 4 });
    dataResetRepository.deleteSellerReviews.mockResolvedValue(1);
    dataResetRepository.deleteSellerConversations.mockResolvedValue(2);
    dataResetRepository.deleteSellerDisputes.mockResolvedValue(0);
    dataResetRepository.deleteSellerReturns.mockResolvedValue(0);
    dataResetRepository.deleteSellerWalletLedger.mockResolvedValue({
        wallet_transactions: 3,
        withdrawal_requests: 0
    });
    dataResetRepository.deleteAllReviews.mockResolvedValue(4);
    dataResetRepository.deleteAllConversations.mockResolvedValue(5);
    dataResetRepository.deleteAllDisputes.mockResolvedValue(0);
    dataResetRepository.deleteAllReturns.mockResolvedValue(0);
    dataResetRepository.deleteAllWalletLedger.mockResolvedValue({
        wallet_transactions: 6,
        withdrawal_requests: 1
    });
    dataResetRepository.deleteAllBuyerLedger.mockResolvedValue(2);
    dataResetRepository.recomputeSellerWallets.mockResolvedValue(1);
    dataResetRepository.recomputeBuyerWallets.mockResolvedValue(1);

    trackCalls();
});

afterEach(() => {
    jest.clearAllMocks();
});

const sellerArgs = (overrides = {}) => ({
    testOnly: true,
    confirmation: "RESET SELLER 7",
    ...overrides
});

const actor = { actorId: 1, req: { ip: "10.0.0.1" } };

describe("confirmation guard", () => {
    it("refuses a seller reset without the exact typed phrase", async () => {
        await expect(
            dataResetService.resetSeller(7, sellerArgs({ confirmation: "yes" }), actor)
        ).rejects.toThrow("RESET SELLER 7");

        expect(db.getConnection).not.toHaveBeenCalled();
        expect(dataResetRepository.deleteOrderTree).not.toHaveBeenCalled();
    });

    it("refuses a seller reset when the phrase names a different seller", async () => {
        await expect(
            dataResetService.resetSeller(7, sellerArgs({ confirmation: "RESET SELLER 8" }), actor)
        ).rejects.toThrow("irreversible");

        expect(dataResetRepository.deleteOrderTree).not.toHaveBeenCalled();
    });

    it("refuses a platform reset without the exact typed phrase", async () => {
        await expect(
            dataResetService.resetPlatform({ testOnly: true, confirmation: "RESET SELLER 7" }, actor)
        ).rejects.toThrow("RESET ENTIRE PLATFORM");

        expect(dataResetRepository.deleteOrderTree).not.toHaveBeenCalled();
    });

    it("accepts the phrase with surrounding whitespace but not a different case", async () => {
        await expect(
            dataResetService.resetSeller(7, sellerArgs({ confirmation: "  RESET SELLER 7  " }), actor)
        ).resolves.toMatchObject({ scope: "seller" });

        await expect(
            dataResetService.resetSeller(7, sellerArgs({ confirmation: "reset seller 7" }), actor)
        ).rejects.toThrow("irreversible");
    });
});

describe("scoping", () => {
    it("refuses to reset an account that is not a seller", async () => {
        dataResetRepository.findSeller.mockResolvedValue({ ...seller, role: "buyer" });

        await expect(dataResetService.resetSeller(7, sellerArgs(), actor)).rejects.toThrow(
            "not a seller"
        );
        expect(dataResetRepository.deleteOrderTree).not.toHaveBeenCalled();
    });

    it("404s on an unknown seller instead of running an empty reset", async () => {
        dataResetRepository.findSeller.mockResolvedValue(null);

        await expect(dataResetService.resetSeller(999, sellerArgs(), actor)).rejects.toMatchObject({
            status: 404
        });
        expect(dataResetRepository.deleteOrderTree).not.toHaveBeenCalled();
    });

    it("only deletes orders resolved for this seller, never all orders", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        expect(dataResetRepository.findSellerOrderIds).toHaveBeenCalledWith(7, { testOnly: true });
        expect(dataResetRepository.findAllOrderIds).not.toHaveBeenCalled();
        expect(dataResetRepository.deleteOrderTree).toHaveBeenCalledWith(connection, [11, 12]);
    });

    it("passes testOnly through to every scoped delete", async () => {
        await dataResetService.resetSeller(7, sellerArgs({ testOnly: true }), actor);

        for (const fn of [
            dataResetRepository.deleteSellerReviews,
            dataResetRepository.deleteSellerConversations,
            dataResetRepository.deleteSellerDisputes,
            dataResetRepository.deleteSellerReturns,
            dataResetRepository.deleteSellerWalletLedger
        ]) {
            expect(fn).toHaveBeenCalledWith(connection, 7, { testOnly: true });
        }
    });

    it("deletes a shared parent order only once it has no children left", async () => {
        dataResetRepository.findParentIdsOf.mockResolvedValue([90, 91]);
        // 90's other child belongs to a different seller and survives, so
        // only 91 comes back as orphaned.
        dataResetRepository.findOrphanedParentOrderIds.mockResolvedValue([91]);

        await dataResetService.resetSeller(7, sellerArgs(), actor);

        // The orphan check runs against the candidates, on the same
        // transaction connection, after the children are deleted.
        expect(dataResetRepository.findOrphanedParentOrderIds).toHaveBeenCalledWith(
            connection,
            [90, 91]
        );
        expect(dataResetRepository.deleteOrderTree).toHaveBeenLastCalledWith(connection, [91]);
    });
});

describe("bookings", () => {
    it("only deletes bookings resolved for this provider, never all bookings", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        expect(dataResetRepository.findSellerBookingIds).toHaveBeenCalledWith(7, { testOnly: true });
        expect(dataResetRepository.findAllBookingIds).not.toHaveBeenCalled();
        expect(dataResetRepository.deleteBookingTree).toHaveBeenCalledWith(connection, [21]);
    });

    it("includes the bookings count in the seller preview and the completed deletion", async () => {
        const preview = await dataResetService.previewSellerReset(7, { testOnly: true });
        expect(preview.counts).toMatchObject({ bookings: 1 });

        const result = await dataResetService.resetSeller(7, sellerArgs(), actor);
        expect(result.deleted).toMatchObject({ bookings: 1 });

        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    deleted_counts: expect.objectContaining({ bookings: 1 })
                })
            })
        );
    });

    it("deletes bookings on the same transaction connection as everything else", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        for (const call of dataResetRepository.deleteBookingTree.mock.calls) {
            expect(call[0]).toBe(connection);
        }
    });

    it("resolves all bookings platform-wide, not scoped to one provider", async () => {
        const result = await dataResetService.resetPlatform(
            { testOnly: false, confirmation: "RESET ENTIRE PLATFORM" },
            actor
        );

        expect(dataResetRepository.findAllBookingIds).toHaveBeenCalledWith({ testOnly: false });
        expect(dataResetRepository.deleteBookingTree).toHaveBeenCalledWith(connection, [21, 22]);
        expect(result.deleted).toMatchObject({ bookings: 2 });
    });

    it("rolls back and does not commit if booking deletion fails", async () => {
        dataResetRepository.deleteBookingTree.mockRejectedValue(new Error("FK constraint fails"));

        await expect(dataResetService.resetSeller(7, sellerArgs(), actor)).rejects.toThrow(
            "FK constraint fails"
        );

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
    });
});

describe("audit logging", () => {
    it("writes the audit entry before any data is deleted", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        expect(callOrder[0]).toBe("audit.insert");
        expect(callOrder.indexOf("audit.insert")).toBeLessThan(callOrder.indexOf("delete.orders"));
    });

    it("records the planned counts, actor, scope and irreversibility", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        expect(auditRepository.insertLog).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 1,
                eventType: "data_reset.seller",
                ipAddress: "10.0.0.1",
                metadata: expect.objectContaining({
                    scope: "seller",
                    seller_id: 7,
                    test_only: true,
                    hard_delete: true,
                    planned_counts: { orders: 2, bookings: 1, reviews: 1 }
                })
            })
        );
    });

    it("does not delete anything if the audit log write fails", async () => {
        auditRepository.insertLog.mockRejectedValue(new Error("audit table unavailable"));

        await expect(dataResetService.resetSeller(7, sellerArgs(), actor)).rejects.toThrow(
            "was not performed"
        );

        expect(db.getConnection).not.toHaveBeenCalled();
        expect(dataResetRepository.deleteOrderTree).not.toHaveBeenCalled();
    });

    it("writes a completion entry with the real deleted counts", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: "data_reset.seller_completed",
                metadata: expect.objectContaining({
                    deleted_counts: expect.objectContaining({
                        orders: 2,
                        reviews: 1,
                        conversations: 2,
                        wallet_transactions: 3
                    })
                })
            })
        );
    });

    it("leaves only the pre-delete entry when the transaction fails", async () => {
        dataResetRepository.deleteSellerReviews.mockRejectedValue(new Error("FK constraint"));

        await expect(dataResetService.resetSeller(7, sellerArgs(), actor)).rejects.toThrow(
            "FK constraint"
        );

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
    });
});

describe("transaction integrity", () => {
    it("rolls back and releases the connection when a delete fails", async () => {
        dataResetRepository.deleteOrderTree.mockRejectedValue(new Error("FK constraint fails"));

        await expect(dataResetService.resetSeller(7, sellerArgs(), actor)).rejects.toThrow(
            "FK constraint fails"
        );

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    it("runs every delete on the single transaction connection", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        expect(db.getConnection).toHaveBeenCalledTimes(1);
        expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(connection.commit).toHaveBeenCalledTimes(1);

        for (const call of dataResetRepository.deleteOrderTree.mock.calls) {
            expect(call[0]).toBe(connection);
        }
    });

    it("clears the buyer-side ledger for deleted orders before the orders go", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        expect(dataResetRepository.deleteBuyerLedgerForOrders).toHaveBeenCalledWith(
            connection,
            [11, 12]
        );
        expect(callOrder.indexOf("delete.buyerLedger")).toBeLessThan(
            callOrder.indexOf("delete.orders")
        );
    });

    it("reconciles wallet balances against the surviving ledger", async () => {
        await dataResetService.resetSeller(7, sellerArgs(), actor);

        expect(dataResetRepository.recomputeSellerWallets).toHaveBeenCalledWith(connection, 7);
        expect(dataResetRepository.recomputeBuyerWallets).toHaveBeenCalledWith(connection);
    });
});

describe("non-reversibility", () => {
    it("reports the result as irreversible", async () => {
        const result = await dataResetService.resetSeller(7, sellerArgs(), actor);
        expect(result.reversible).toBe(false);
    });

    it("previews are read-only - no connection, no deletes", async () => {
        const preview = await dataResetService.previewSellerReset(7, { testOnly: true });

        expect(preview).toMatchObject({
            scope: "seller",
            test_only: true,
            reversible: false,
            confirmation_phrase: "RESET SELLER 7"
        });
        expect(db.getConnection).not.toHaveBeenCalled();
        expect(dataResetRepository.deleteOrderTree).not.toHaveBeenCalled();
        expect(auditRepository.insertLog).not.toHaveBeenCalled();
    });

    it("platform preview reports the platform phrase and does not delete", async () => {
        const preview = await dataResetService.previewPlatformReset({ testOnly: false });

        expect(preview.confirmation_phrase).toBe("RESET ENTIRE PLATFORM");
        expect(preview.test_only).toBe(false);
        expect(dataResetRepository.deleteOrderTree).not.toHaveBeenCalled();
    });
});

describe("platform reset", () => {
    it("deletes across every in-scope table and commits once", async () => {
        const result = await dataResetService.resetPlatform(
            { testOnly: false, confirmation: "RESET ENTIRE PLATFORM" },
            actor
        );

        expect(dataResetRepository.deleteOrderTree).toHaveBeenCalledWith(connection, [11, 12, 13]);
        expect(dataResetRepository.deleteAllBuyerLedger).toHaveBeenCalledWith(connection, {
            testOnly: false
        });
        expect(dataResetRepository.recomputeSellerWallets).toHaveBeenCalledWith(connection, null);
        expect(connection.commit).toHaveBeenCalledTimes(1);

        expect(result.deleted).toMatchObject({
            orders: 3,
            reviews: 4,
            conversations: 5,
            wallet_transactions: 6,
            withdrawal_requests: 1,
            buyer_wallet_transactions: 2
        });
    });

    it("never touches per-seller scoped deletes", async () => {
        await dataResetService.resetPlatform(
            { testOnly: true, confirmation: "RESET ENTIRE PLATFORM" },
            actor
        );

        expect(dataResetRepository.deleteSellerReviews).not.toHaveBeenCalled();
        expect(dataResetRepository.findSellerOrderIds).not.toHaveBeenCalled();
    });

    it("writes its audit entry before deleting", async () => {
        await dataResetService.resetPlatform(
            { testOnly: true, confirmation: "RESET ENTIRE PLATFORM" },
            actor
        );

        expect(callOrder.indexOf("audit.insert")).toBeLessThan(callOrder.indexOf("delete.orders"));
        expect(auditRepository.insertLog).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: "data_reset.platform",
                metadata: expect.objectContaining({ scope: "platform", hard_delete: true })
            })
        );
    });
});
