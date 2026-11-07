const { classifyStatus, classifyMalipopay, classifySelcom, classifyCheckoutEvent, amountsMatch, usdAmountsMatch } = require("../../../src/modules/payment/providerStatus");

describe("providerStatus.classifyStatus", () => {
    it.each(["SUCCESS", "successful", "COMPLETED", "paid"])("%s is a success", (word) => {
        expect(classifyStatus(word)).toBe("success");
    });

    it.each(["FAILED", "cancelled", "EXPIRED", "declined", "TIMEOUT"])("%s is a terminal failure", (word) => {
        expect(classifyStatus(word)).toBe("failed");
    });

    it.each(["PENDING", "PROCESSING", "INITIATED", "", null, undefined, "SOMETHING_NEW"])("%s is NOT terminal - it must be ignored", (word) => {
        expect(classifyStatus(word)).toBe("pending");
    });
});

describe("providerStatus - provider payload classifiers", () => {
    it("malipopay: reads payload.status", () => {
        expect(classifyMalipopay({ status: "SUCCESS" })).toBe("success");
        expect(classifyMalipopay({ status: "PENDING" })).toBe("pending");
        expect(classifyMalipopay({ status: "FAILED" })).toBe("failed");
    });

    it("selcom: 000 / SUCCESS is success, anything not clearly failed stays pending", () => {
        expect(classifySelcom({ resultcode: "000" })).toBe("success");
        expect(classifySelcom({ result: "SUCCESS" })).toBe("success");
        expect(classifySelcom({ resultcode: "111", result: "FAIL" })).toBe("failed");
        expect(classifySelcom({ resultcode: "111", result: "PENDING" })).toBe("pending");
        expect(classifySelcom({})).toBe("pending");
    });
});

describe("providerStatus.classifyCheckoutEvent", () => {
    const base = { reference: "ORDER-1-AAAAAAAAAAAA", id: "s1" };

    it("paid completed session -> success, with the reported amount", () => {
        const out = classifyCheckoutEvent({ type: "checkout.session.completed", data: { ...base, payment_status: "paid", amount_total: "5000", currency: "tzs" } });
        expect(out).toMatchObject({ kind: "success", reference: base.reference, reportedAmount: 5000, reportedCurrency: "TZS" });
    });

    it("completed session that is not paid yet -> ignore", () => {
        expect(classifyCheckoutEvent({ type: "checkout.session.completed", data: { ...base, payment_status: "unpaid" } }).kind).toBe("ignore");
    });

    it("expired / failed events -> failed", () => {
        expect(classifyCheckoutEvent({ type: "checkout.session.expired", data: base }).kind).toBe("failed");
        expect(classifyCheckoutEvent({ type: "payment.failed", data: base }).kind).toBe("failed");
    });

    it("dispute / chargeback events -> chargeback", () => {
        expect(classifyCheckoutEvent({ type: "payment.dispute.created", data: { ...base, reason: "fraud" } })).toMatchObject({ kind: "chargeback", reason: "fraud" });
        expect(classifyCheckoutEvent({ type: "charge.chargeback", data: base }).kind).toBe("chargeback");
    });

    it("unknown event types -> ignore", () => {
        expect(classifyCheckoutEvent({ type: "customer.updated", data: base }).kind).toBe("ignore");
    });
});

describe("providerStatus - amount tolerance", () => {
    it("accepts exact and near-exact TZS amounts, rejects real differences", () => {
        expect(amountsMatch(10000, 10000)).toBe(true);
        expect(amountsMatch("10000.00", 10001)).toBe(true);
        expect(amountsMatch(10000, 9000)).toBe(false);
        expect(amountsMatch(10000, undefined)).toBe(false);
        expect(amountsMatch(10000, "abc")).toBe(false);
    });

    it("USD amounts allow a couple of cents", () => {
        expect(usdAmountsMatch(10, 10.01)).toBe(true);
        expect(usdAmountsMatch(10, 9.5)).toBe(false);
    });
});
