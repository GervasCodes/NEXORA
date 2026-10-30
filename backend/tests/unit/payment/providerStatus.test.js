const { classifyStatus, classifySelcom, classifyAzampay, classifyPawapay, amountsMatch, usdAmountsMatch } = require("../../../src/modules/payment/providerStatus");

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
    it("selcom: 000 / SUCCESS is success, anything not clearly failed stays pending", () => {
        expect(classifySelcom({ resultcode: "000" })).toBe("success");
        expect(classifySelcom({ result: "SUCCESS" })).toBe("success");
        expect(classifySelcom({ resultcode: "111", result: "FAIL" })).toBe("failed");
        expect(classifySelcom({ resultcode: "111", result: "PENDING" })).toBe("pending");
        expect(classifySelcom({})).toBe("pending");
    });

    it("selcom checkout notifications: payment_status wins", () => {
        expect(classifySelcom({ payment_status: "COMPLETED", resultcode: "000" })).toBe("success");
        expect(classifySelcom({ payment_status: "USERCANCELLED" })).toBe("failed");
        expect(classifySelcom({ payment_status: "PENDING", resultcode: "000" })).toBe("pending");
    });

    it("azampay: reads transactionstatus", () => {
        expect(classifyAzampay({ transactionstatus: "success" })).toBe("success");
        expect(classifyAzampay({ transactionstatus: "failure" })).toBe("failed");
        expect(classifyAzampay({})).toBe("pending");
    });

    it("pawapay: COMPLETED / FAILED, anything else is still in flight", () => {
        expect(classifyPawapay({ status: "COMPLETED" })).toBe("success");
        expect(classifyPawapay({ status: "FAILED" })).toBe("failed");
        expect(classifyPawapay({ status: "IN_RECONCILIATION" })).toBe("pending");
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
