jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/dispute/dispute.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/utils/cloudinaryUpload");

const db = require("../../../src/config/db");
const disputeRepository = require("../../../src/modules/dispute/dispute.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const notificationService = require("../../../src/modules/notification/notification.service");
const { uploadToCloudinary } = require("../../../src/utils/cloudinaryUpload");

const disputeService = require("../../../src/modules/dispute/dispute.service");

const connection = db.__mockConnection;

const fullDisputeStubs = () => {
    disputeRepository.findEvidence.mockResolvedValue([]);
    disputeRepository.findMessages.mockResolvedValue([]);
    disputeRepository.findHistory.mockResolvedValue([]);
};

beforeEach(() => {
    notificationService.notify.mockResolvedValue(undefined);
    fullDisputeStubs();
    // Escrow (Phase 9C): reverseSellerEarnings reverses held_balance
    // first, then balance. Default to "nothing held" so existing
    // refund-reversal tests below (written before escrow existed) keep
    // exercising the pre-9C "reverse it all from balance" path
    // unchanged; tests that specifically exercise the held-balance split
    // override this.
    walletRepository.getWalletForUpdate.mockResolvedValue({ held_balance: 0 });
});

describe("dispute.service.createDispute", () => {
    it("rejects an invalid dispute type", async () => {
        await expect(
            disputeService.createDispute(5, { order_id: 1, type: "bogus_type", subject: "s", description: "d" })
        ).rejects.toThrow("Invalid dispute type");
    });

    it("rejects when the order doesn't exist or belongs to a different buyer", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);
        await expect(
            disputeService.createDispute(5, { order_id: 1, type: "damaged_item", subject: "s", description: "d" })
        ).rejects.toThrow("Order not found");

        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999 });
        await expect(
            disputeService.createDispute(5, { order_id: 1, type: "damaged_item", subject: "s", description: "d" })
        ).rejects.toThrow("Order not found");
    });

    it("rejects disputing an order that was never fulfilled (pending/cancelled)", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, status: "cancelled", payment_status: "paid" });
        await expect(
            disputeService.createDispute(5, { order_id: 1, type: "damaged_item", subject: "s", description: "d" })
        ).rejects.toThrow('This order is "cancelled" and can\'t be disputed yet');
    });

    it("rejects an unpaid order that isn't cash-on-delivery", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, status: "processing", payment_status: "pending", payment_method: "mobile_money"
        });
        await expect(
            disputeService.createDispute(5, { order_id: 1, type: "damaged_item", subject: "s", description: "d" })
        ).rejects.toThrow("This order hasn't been paid for yet");
    });

    it("allows an unpaid cash-on-delivery order (payment happens on delivery)", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, status: "delivered", payment_status: "pending", payment_method: "cash_on_delivery", order_number: "ORD-1"
        });
        orderRepository.findOrderSellerId.mockResolvedValue(10);
        disputeRepository.findOpenByOrderAndItem.mockResolvedValue(undefined);
        disputeRepository.create.mockResolvedValue(1);
        disputeRepository.findById.mockResolvedValue({ id: 1, dispute_number: "DSP-1" });

        await expect(
            disputeService.createDispute(5, { order_id: 1, type: "missing_delivery", subject: "s", description: "d" })
        ).resolves.toBeDefined();
    });

    it("rejects an order_item_id that doesn't belong to the order", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, status: "delivered", payment_status: "paid", order_number: "ORD-1"
        });
        orderRepository.findOrderItems.mockResolvedValue([{ id: 1, seller_id: 10 }]);

        await expect(
            disputeService.createDispute(5, { order_id: 1, order_item_id: 999, type: "damaged_item", subject: "s", description: "d" })
        ).rejects.toThrow("That item does not belong to this order");
    });

    it("resolves the seller from the specific item when order_item_id is given", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, status: "delivered", payment_status: "paid", order_number: "ORD-1"
        });
        orderRepository.findOrderItems.mockResolvedValue([{ id: 7, seller_id: 42 }]);
        disputeRepository.findOpenByOrderAndItem.mockResolvedValue(undefined);
        disputeRepository.create.mockResolvedValue(1);
        disputeRepository.findById.mockResolvedValue({ id: 1, dispute_number: "DSP-1" });

        await disputeService.createDispute(5, { order_id: 1, order_item_id: 7, type: "damaged_item", subject: "s", description: "d" });

        expect(disputeRepository.create).toHaveBeenCalledWith(expect.objectContaining({ sellerId: 42, orderItemId: 7 }));
        expect(orderRepository.findOrderSellerId).not.toHaveBeenCalled();
    });

    it("resolves the seller from the whole order when no order_item_id is given", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, status: "delivered", payment_status: "paid", order_number: "ORD-1"
        });
        orderRepository.findOrderSellerId.mockResolvedValue(42);
        disputeRepository.findOpenByOrderAndItem.mockResolvedValue(undefined);
        disputeRepository.create.mockResolvedValue(1);
        disputeRepository.findById.mockResolvedValue({ id: 1, dispute_number: "DSP-1" });

        await disputeService.createDispute(5, { order_id: 1, type: "missing_delivery", subject: "s", description: "d" });

        expect(disputeRepository.create).toHaveBeenCalledWith(expect.objectContaining({ sellerId: 42, orderItemId: null }));
    });

    it("rejects a duplicate open dispute for the same order/item", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, status: "delivered", payment_status: "paid", order_number: "ORD-1"
        });
        orderRepository.findOrderSellerId.mockResolvedValue(42);
        disputeRepository.findOpenByOrderAndItem.mockResolvedValue({ id: 5 });

        await expect(
            disputeService.createDispute(5, { order_id: 1, type: "missing_delivery", subject: "s", description: "d" })
        ).rejects.toThrow("There is already an open dispute for this order/item");
        expect(disputeRepository.create).not.toHaveBeenCalled();
    });

    it("records the opening history entry and notifies the seller", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, status: "delivered", payment_status: "paid", order_number: "ORD-1"
        });
        orderRepository.findOrderSellerId.mockResolvedValue(42);
        disputeRepository.findOpenByOrderAndItem.mockResolvedValue(undefined);
        disputeRepository.create.mockResolvedValue(1);
        disputeRepository.findById.mockResolvedValue({ id: 1, dispute_number: "DSP-1" });

        await disputeService.createDispute(5, { order_id: 1, type: "damaged_item", subject: "s", description: "d" });

        expect(disputeRepository.addHistory).toHaveBeenCalledWith(1, "opened", expect.stringContaining("Damaged item"), 5);
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 42, type: "dispute", relatedOrderId: 1 })
        );
    });
});

describe("dispute.service.addEvidence", () => {
    it("rejects when the dispute doesn't exist", async () => {
        disputeRepository.findById.mockResolvedValue(undefined);
        await expect(disputeService.addEvidence(1, 5, "buyer", { buffer: Buffer.from("x") })).rejects.toThrow("Dispute not found");
    });

    it("rejects a non-participant", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 999, seller_id: 998, status: "open" });
        await expect(disputeService.addEvidence(1, 5, "buyer", { buffer: Buffer.from("x") })).rejects.toThrow(
            "You do not have access to this dispute"
        );
    });

    it("rejects when the dispute is already closed", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 5, status: "resolved" });
        await expect(disputeService.addEvidence(1, 5, "buyer", { buffer: Buffer.from("x") })).rejects.toThrow(
            'Evidence can\'t be added - this dispute is "resolved"'
        );
    });

    it("rejects when no file was uploaded", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 5, status: "open" });
        await expect(disputeService.addEvidence(1, 5, "buyer", null)).rejects.toThrow("No file uploaded");
    });

    it("uploads to cloudinary and records the evidence for an authorized, open dispute", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 5, status: "under_review" });
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn/evidence.jpg" });

        await disputeService.addEvidence(1, 5, "buyer", { buffer: Buffer.from("x") });

        expect(uploadToCloudinary).toHaveBeenCalledWith(expect.any(Buffer), "nexora/disputes", "auto");
        expect(disputeRepository.addEvidence).toHaveBeenCalledWith(1, 5, "https://cdn/evidence.jpg");
    });

    it("admin can add evidence to any dispute regardless of buyer/seller id", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 999, seller_id: 998, status: "open" });
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn/x.jpg" });

        await expect(disputeService.addEvidence(1, 1, "admin", { buffer: Buffer.from("x") })).resolves.toBeDefined();
    });
});

describe("dispute.service.addMessage", () => {
    it("rejects an empty/whitespace-only message", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 5, status: "open" });
        await expect(disputeService.addMessage(1, 5, "buyer", "   ")).rejects.toThrow("Message can't be empty");
    });

    it("rejects messaging on a closed dispute", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 5, status: "withdrawn" });
        await expect(disputeService.addMessage(1, 5, "buyer", "hello")).rejects.toThrow(
            'This dispute is already "withdrawn" and closed for new messages'
        );
    });

    it("a seller's reply to an open dispute auto-moves it to under_review", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, buyer_id: 5, seller_id: 10, status: "open", dispute_number: "DSP-1", order_id: 1
        });

        await disputeService.addMessage(1, 10, "seller", "We'll look into it");

        expect(disputeRepository.updateStatus).toHaveBeenCalledWith(1, "under_review");
        expect(disputeRepository.addHistory).toHaveBeenCalledWith(1, "under_review", "Seller responded", 10);
    });

    it("a buyer's reply does not change dispute status", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, buyer_id: 5, seller_id: 10, status: "open", dispute_number: "DSP-1", order_id: 1
        });

        await disputeService.addMessage(1, 5, "buyer", "Any update?");

        expect(disputeRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("notifies the other party (seller when the buyer messages, buyer when the seller messages)", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, buyer_id: 5, seller_id: 10, status: "under_review", dispute_number: "DSP-1", order_id: 1
        });

        await disputeService.addMessage(1, 5, "buyer", "Any update?");
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 10 }));

        notificationService.notify.mockClear();

        await disputeService.addMessage(1, 10, "seller", "Working on it");
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
    });

    it("trims the message before storing it", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, buyer_id: 5, seller_id: 10, status: "under_review", dispute_number: "DSP-1", order_id: 1
        });

        await disputeService.addMessage(1, 5, "buyer", "  hello there  ");

        expect(disputeRepository.addMessage).toHaveBeenCalledWith(1, 5, "buyer", "hello there");
    });
});

describe("dispute.service read operations", () => {
    it("getDisputeDetail enforces participant access", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 999, seller_id: 998, status: "open" });
        await expect(disputeService.getDisputeDetail(1, 5, "buyer")).rejects.toThrow("You do not have access to this dispute");
    });

    it("getMyDisputes / getSellerDisputes / getAllDisputes delegate to the repository", async () => {
        disputeRepository.findByBuyer.mockResolvedValue([{ id: 1 }]);
        await expect(disputeService.getMyDisputes(5)).resolves.toEqual([{ id: 1 }]);

        disputeRepository.findBySeller.mockResolvedValue([{ id: 2 }]);
        await expect(disputeService.getSellerDisputes(10)).resolves.toEqual([{ id: 2 }]);

        disputeRepository.findAll.mockResolvedValue([{ id: 3 }]);
        await expect(disputeService.getAllDisputes({ status: "open" })).resolves.toEqual([{ id: 3 }]);
        expect(disputeRepository.findAll).toHaveBeenCalledWith({ status: "open" });
    });
});

describe("dispute.service.withdrawDispute", () => {
    it("only the filing buyer can withdraw", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 999, status: "open" });
        await expect(disputeService.withdrawDispute(1, 5)).rejects.toThrow("You do not have access to this dispute");
    });

    it("rejects withdrawing an already-closed dispute", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 5, status: "resolved" });
        await expect(disputeService.withdrawDispute(1, 5)).rejects.toThrow('This dispute is already "resolved"');
    });

    it("withdraws an open dispute", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, buyer_id: 5, status: "open" });
        await disputeService.withdrawDispute(1, 5);
        expect(disputeRepository.updateStatus).toHaveBeenCalledWith(1, "withdrawn");
        expect(disputeRepository.addHistory).toHaveBeenCalledWith(1, "withdrawn", null, 5);
    });
});

describe("dispute.service.markUnderReview", () => {
    it("rejects an unknown dispute", async () => {
        disputeRepository.findById.mockResolvedValue(undefined);
        await expect(disputeService.markUnderReview(1, 99)).rejects.toThrow("Dispute not found");
    });

    it("only an open dispute can be moved to review", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, status: "under_review" });
        await expect(disputeService.markUnderReview(1, 99)).rejects.toThrow(
            'Only an "open" dispute can be moved to review (this one is "under_review")'
        );
    });

    it("moves an open dispute to under_review", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, status: "open" });
        await disputeService.markUnderReview(1, 99);
        expect(disputeRepository.updateStatus).toHaveBeenCalledWith(1, "under_review");
    });
});

describe("dispute.service.resolveDispute", () => {
    it("rejects an invalid resolution type", async () => {
        await expect(
            disputeService.resolveDispute(1, 99, { resolution: "bogus" })
        ).rejects.toThrow("Invalid resolution type");
    });

    it("rejects an unknown dispute", async () => {
        disputeRepository.findById.mockResolvedValue(undefined);
        await expect(
            disputeService.resolveDispute(1, 99, { resolution: "no_action" })
        ).rejects.toThrow("Dispute not found");
    });

    it("rejects resolving an already-closed dispute", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, status: "resolved" });
        await expect(
            disputeService.resolveDispute(1, 99, { resolution: "no_action" })
        ).rejects.toThrow('This dispute is already "resolved"');
    });

    it("resolves with no_action: no refund, no wallet reversal", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });

        await disputeService.resolveDispute(1, 99, { resolution: "no_action", resolution_note: "not eligible" });

        expect(disputeRepository.resolve).toHaveBeenCalledWith(1, expect.objectContaining({
            status: "resolved", resolution: "no_action", refundAmount: null, resolvedBy: 99
        }));
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 5, messageKey: "notifications.dispute.resolved.buyerNoRefund" })
        );
    });

    it("resolves refund_full using the full order total and reverses the seller's earnings", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });
        walletRepository.incrementBalance.mockResolvedValue(5000);

        await disputeService.resolveDispute(1, 99, { resolution: "refund_full", resolution_note: "confirmed damaged" });

        expect(disputeRepository.resolve).toHaveBeenCalledWith(1, expect.objectContaining({ refundAmount: 15000 }));
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -15000, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "debit", amount: 15000, referenceType: "dispute" }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 5, messageKey: "notifications.dispute.resolved.buyerWithRefund" })
        );
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 10, messageKey: "notifications.dispute.resolved.sellerMessage" })
        );
    });

    it("reverses from held_balance first when the order's earnings are still fully held (escrowed, not yet released)", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });
        walletRepository.getWalletForUpdate.mockResolvedValue({ held_balance: 20000 });
        walletRepository.incrementHeldBalance.mockResolvedValue(5000);

        await disputeService.resolveDispute(1, 99, { resolution: "refund_full", resolution_note: "confirmed damaged" });

        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, -15000, connection);
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "debit", amount: 15000, referenceType: "dispute" }),
            connection
        );
    });

    it("splits the reversal across held and available balance when held funds only cover part of the refund", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });
        // Only 4000 still held (e.g. some of this order's items already
        // released); the remaining 11000 of the refund has to come out
        // of the seller's already-withdrawable balance.
        walletRepository.getWalletForUpdate.mockResolvedValue({ held_balance: 4000 });
        walletRepository.incrementHeldBalance.mockResolvedValue(0);
        walletRepository.incrementBalance.mockResolvedValue(-1000);

        await disputeService.resolveDispute(1, 99, { resolution: "refund_full", resolution_note: "confirmed damaged" });

        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, -4000, connection);
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -11000, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "debit", amount: 4000, referenceType: "dispute" }),
            connection
        );
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "debit", amount: 11000, referenceType: "dispute" }),
            connection
        );
    });

    it("resolves refund_partial with a valid amount under the order total", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "under_review", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });
        walletRepository.incrementBalance.mockResolvedValue(5000);

        await disputeService.resolveDispute(1, 99, { resolution: "refund_partial", refund_amount: 5000, resolution_note: "partial" });

        expect(disputeRepository.resolve).toHaveBeenCalledWith(1, expect.objectContaining({ refundAmount: 5000 }));
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -5000, connection);
    });

    it("rejects a zero/negative partial refund amount", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });

        await expect(
            disputeService.resolveDispute(1, 99, { resolution: "refund_partial", refund_amount: 0 })
        ).rejects.toThrow("A positive refund_amount is required for a partial refund");
        expect(disputeRepository.resolve).not.toHaveBeenCalled();
    });

    it("rejects a partial refund amount exceeding the order total", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });

        await expect(
            disputeService.resolveDispute(1, 99, { resolution: "refund_partial", refund_amount: 20000 })
        ).rejects.toThrow("Refund amount can't exceed the order total");
        expect(disputeRepository.resolve).not.toHaveBeenCalled();
    });

    it("does not touch the wallet for non-refund resolutions (replacement/compensation)", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });

        await disputeService.resolveDispute(1, 99, { resolution: "replacement", resolution_note: "sending a new one" });

        expect(orderRepository.findOrderById).not.toHaveBeenCalled();
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(disputeRepository.resolve).toHaveBeenCalledWith(1, expect.objectContaining({ refundAmount: null }));
    });

    it("does not let a wallet-reversal failure fail or block the resolution (fire-and-forget, best-effort)", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });
        walletRepository.ensureWallet.mockRejectedValue(new Error("no wallet row for this seller"));

        await expect(
            disputeService.resolveDispute(1, 99, { resolution: "refund_full", resolution_note: "confirmed" })
        ).resolves.toBeDefined();
    });

    it("rolls back the wallet transaction if crediting fails mid-transaction", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: 10, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });
        walletRepository.insertTransaction.mockRejectedValue(new Error("db write failed"));

        await disputeService.resolveDispute(1, 99, { resolution: "refund_full", resolution_note: "confirmed" });
        // Reversal itself is fire-and-forget from resolveDispute's perspective,
        // but internally it must still roll back rather than leave a half-applied debit.
        await new Promise((resolve) => setImmediate(resolve));

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("skips the wallet reversal entirely when the dispute has no associated seller", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, seller_id: null, dispute_number: "DSP-1", order_id: 1
        });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, total_amount: "15000.00" });

        await disputeService.resolveDispute(1, 99, { resolution: "refund_full", resolution_note: "confirmed" });

        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        // Buyer still gets notified; no seller-side notification since there's no seller
        expect(notificationService.notify).toHaveBeenCalledTimes(1);
    });
});

describe("dispute.service.rejectDispute", () => {
    it("rejects an unknown dispute", async () => {
        disputeRepository.findById.mockResolvedValue(undefined);
        await expect(disputeService.rejectDispute(1, 99, { resolution_note: "n/a" })).rejects.toThrow("Dispute not found");
    });

    it("rejects rejecting an already-closed dispute", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, status: "withdrawn" });
        await expect(disputeService.rejectDispute(1, 99, { resolution_note: "n/a" })).rejects.toThrow(
            'This dispute is already "withdrawn"'
        );
    });

    it("requires a non-empty reason", async () => {
        disputeRepository.findById.mockResolvedValue({ id: 1, status: "open" });
        await expect(disputeService.rejectDispute(1, 99, { resolution_note: "   " })).rejects.toThrow(
            "A reason is required to reject a dispute"
        );
        expect(disputeRepository.resolve).not.toHaveBeenCalled();
    });

    it("rejects the dispute with a no_action resolution and notifies the buyer", async () => {
        disputeRepository.findById.mockResolvedValue({
            id: 1, status: "open", buyer_id: 5, dispute_number: "DSP-1", order_id: 1
        });

        await disputeService.rejectDispute(1, 99, { resolution_note: "insufficient evidence" });

        expect(disputeRepository.resolve).toHaveBeenCalledWith(1, expect.objectContaining({
            status: "rejected", resolution: "no_action", refundAmount: null, resolvedBy: 99
        }));
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 5,
                messageKey: "notifications.dispute.rejected.message",
                messageParams: { disputeNumber: "DSP-1", reason: "insufficient evidence" }
            })
        );
    });
});
