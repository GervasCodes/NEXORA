const { blockWhenPaymentsInMaintenance, blocksUser, statusFor } = require("../../src/middleware/paymentsMaintenance.middleware");

describe("paymentsMaintenance.middleware", () => {
    const OLD = process.env;
    beforeEach(() => { process.env = { ...OLD }; delete process.env.PAYMENTS_MAINTENANCE; delete process.env.PAYMENTS_MAINTENANCE_TESTER_IDS; delete process.env.PAYMENTS_MAINTENANCE_MESSAGE; });
    afterAll(() => { process.env = OLD; });

    const run = (user) => {
        const json = jest.fn();
        const res = { status: jest.fn(() => ({ json })) };
        const next = jest.fn();
        blockWhenPaymentsInMaintenance({ user }, res, next);
        return { res, json, next };
    };

    it("lets everyone through when the switch is off", () => {
        expect(run({ id: 1, role: "buyer" }).next).toHaveBeenCalled();
        expect(statusFor({ id: 1, role: "buyer" }).active).toBe(false);
    });

    it("answers 503 PAYMENTS_MAINTENANCE for a buyer when on", () => {
        process.env.PAYMENTS_MAINTENANCE = "true";
        const { res, json, next } = run({ id: 1, role: "buyer" });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: "PAYMENTS_MAINTENANCE" }));
    });

    it("lets admins and listed tester ids through while on", () => {
        process.env.PAYMENTS_MAINTENANCE = "true";
        process.env.PAYMENTS_MAINTENANCE_TESTER_IDS = "12, 15";
        expect(blocksUser({ id: 99, role: "admin" })).toBe(false);
        expect(blocksUser({ id: 15, role: "buyer" })).toBe(false);
        expect(blocksUser({ id: 16, role: "buyer" })).toBe(true);
    });

    it("uses a custom message when set", () => {
        process.env.PAYMENTS_MAINTENANCE = "true";
        process.env.PAYMENTS_MAINTENANCE_MESSAGE = "Tunaboresha malipo.";
        expect(statusFor({ id: 1, role: "buyer" })).toEqual({ active: true, message: "Tunaboresha malipo." });
    });
});
