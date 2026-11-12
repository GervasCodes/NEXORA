import { describe, it, expect } from "vitest";
import { getConfirmationState, getPurchaseEvent, getSummaryItems, isAwaitingOnlinePayment } from "../../src/utils/orderConfirmation";

const NOW = Date.parse("2026-11-07T12:00:00Z");
const base = { id: 9, status: "pending", payment_status: "unpaid", payment_method: "mobile_money", total_amount: 45000, created_at: "2026-11-07T11:50:00Z" };

describe("getConfirmationState", () => {
    it("is confirmed once paid or deposit paid", () => {
        expect(getConfirmationState({ ...base, payment_status: "paid" })).toBe("confirmed");
        expect(getConfirmationState({ ...base, payment_status: "deposit_paid" })).toBe("confirmed");
    });
    it("treats cash on delivery and wallet orders as confirmed (nothing to wait for)", () => {
        expect(getConfirmationState({ ...base, payment_method: "cash_on_delivery" })).toBe("confirmed");
        expect(getConfirmationState({ ...base, payment_method: "wallet" })).toBe("confirmed");
    });
    it("waits for an online payment that has not landed", () => {
        expect(getConfirmationState(base)).toBe("awaiting_payment");
        expect(getConfirmationState({ ...base, payment_method: "card" })).toBe("awaiting_payment");
    });
    it("flags a cancelled order, even if it was paid", () => {
        expect(getConfirmationState({ ...base, status: "cancelled", payment_status: "paid" })).toBe("cancelled");
    });
    it("is loading without an order", () => {
        expect(getConfirmationState(null)).toBe("loading");
    });
});

describe("isAwaitingOnlinePayment", () => {
    it("polls only while an online payment is outstanding", () => {
        expect(isAwaitingOnlinePayment(base)).toBe(true);
        expect(isAwaitingOnlinePayment({ ...base, payment_status: "paid" })).toBe(false);
        expect(isAwaitingOnlinePayment({ ...base, payment_method: "cash_on_delivery" })).toBe(false);
    });
});

describe("getPurchaseEvent", () => {
    it("reports the full amount for a paid order", () => {
        expect(getPurchaseEvent({ ...base, payment_status: "paid" }, NOW)).toEqual({ orderId: 9, value: 45000, currency: "TZS", paymentType: "mobile_money" });
    });
    it("reports a cash-on-delivery order at placement", () => {
        expect(getPurchaseEvent({ ...base, payment_method: "cash_on_delivery" }, NOW)?.value).toBe(45000);
    });
    it("reports only the deposit for a deposit-paid pre-order", () => {
        expect(getPurchaseEvent({ ...base, payment_status: "deposit_paid", deposit_amount: "12000.00" }, NOW)?.value).toBe(12000);
    });
    it("reports nothing while payment is outstanding, for cancelled orders, or without an amount", () => {
        expect(getPurchaseEvent(base, NOW)).toBeNull();
        expect(getPurchaseEvent({ ...base, status: "cancelled", payment_status: "paid" }, NOW)).toBeNull();
        expect(getPurchaseEvent({ ...base, payment_status: "paid", total_amount: 0 }, NOW)).toBeNull();
    });
    it("does not back-fill an old order opened later", () => {
        expect(getPurchaseEvent({ ...base, payment_status: "paid", created_at: "2026-11-05T11:50:00Z" }, NOW)).toBeNull();
    });
});

describe("getSummaryItems", () => {
    it("lists a normal order's items", () => {
        expect(getSummaryItems({ items: [{ id: 1 }, { id: 2 }] })).toHaveLength(2);
    });
    it("combines the items of a multi-vendor order's vendor orders", () => {
        expect(getSummaryItems({ is_parent: 1, children: [{ items: [{ id: 1 }] }, { items: [{ id: 2 }, { id: 3 }] }] })).toHaveLength(3);
    });
    it("copes with no order", () => {
        expect(getSummaryItems(null)).toEqual([]);
    });
});
