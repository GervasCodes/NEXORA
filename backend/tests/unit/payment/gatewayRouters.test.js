const mockGateway = () => ({
    isConfigured: jest.fn(() => true),
    supportsCheckout: jest.fn(() => true),
    initiate: jest.fn(async () => ({ success: true, transactionReference: "TX" })),
    refund: jest.fn(async () => ({ success: true })),
    disburse: jest.fn(async () => ({ success: true })),
    checkStatus: jest.fn(async () => ({ state: "pending" })),
    createCheckoutSession: jest.fn(async () => ({ success: true, sessionId: "S", url: "https://pay.example" }))
});

jest.mock("../../../src/modules/payment/providers/selcom.provider", () => mockGateway());
jest.mock("../../../src/modules/payment/providers/azampay.provider", () => mockGateway());
jest.mock("../../../src/modules/payment/providers/pawapay.provider", () => mockGateway());

const selcom = require("../../../src/modules/payment/providers/selcom.provider");
const azampay = require("../../../src/modules/payment/providers/azampay.provider");
const pawapay = require("../../../src/modules/payment/providers/pawapay.provider");
const mobileMoney = require("../../../src/modules/payment/providers/mobileMoney.provider");
const card = require("../../../src/modules/payment/providers/card.provider");

const ENV = process.env;
beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV, NODE_ENV: "production" };
    delete process.env.MOBILE_MONEY_PROVIDER;
    delete process.env.CARD_PROVIDER;
});
afterAll(() => { process.env = ENV; });

describe("mobileMoney router", () => {
    it.each([["azampay", azampay], ["selcom", selcom], ["pawapay", pawapay]])("routes to %s and reports which gateway handled it", async (name, gateway) => {
        process.env.MOBILE_MONEY_PROVIDER = name;
        const result = await mobileMoney.initiate("0755123456", 1000, { reference: "R" });
        expect(gateway.initiate).toHaveBeenCalled();
        expect(result).toEqual({ success: true, transactionReference: "TX", provider: name });
    });

    it("refunds through the gateway stored on the payment, not the currently active one", async () => {
        process.env.MOBILE_MONEY_PROVIDER = "azampay";
        await mobileMoney.refund("0755123456", 500, { provider: "pawapay", depositId: "d" });
        expect(pawapay.refund).toHaveBeenCalled();
        expect(azampay.refund).not.toHaveBeenCalled();
    });

    it("checks status through the stored gateway", async () => {
        process.env.MOBILE_MONEY_PROVIDER = "azampay";
        await mobileMoney.checkStatus("R", "selcom");
        expect(selcom.checkStatus).toHaveBeenCalledWith("R");
    });

    it("throws in production when nothing usable is configured", async () => {
        process.env.MOBILE_MONEY_PROVIDER = "malipopay";
        await expect(mobileMoney.initiate("0755123456", 1, {})).rejects.toThrow("Mobile money is not configured");
    });

    it("falls back to the simulator outside production", async () => {
        process.env.NODE_ENV = "development";
        const result = await mobileMoney.initiate("0755123456", 1, {});
        expect(result.transactionReference).toMatch(/^SIMULATED-/);
    });
});

describe("card router", () => {
    it.each([["selcom", selcom], ["azampay", azampay]])("creates a hosted session through %s", async (name, gateway) => {
        process.env.CARD_PROVIDER = name;
        const session = await card.createCheckoutSession({ amountTzs: 1000, reference: "R" });
        expect(gateway.createCheckoutSession).toHaveBeenCalled();
        expect(session).toMatchObject({ url: "https://pay.example", provider: name });
    });

    it("refuses pawapay (mobile money only) and unset providers", async () => {
        process.env.CARD_PROVIDER = "pawapay";
        expect(card.isConfigured()).toBe(false);
        expect(card.misconfiguredName()).toBe("pawapay");
        await expect(card.createCheckoutSession({})).rejects.toThrow("Card payments are not configured");

        delete process.env.CARD_PROVIDER;
        await expect(card.createCheckoutSession({})).rejects.toThrow("Card payments are not configured");
    });

    it("only Selcom has a status lookup", async () => {
        process.env.CARD_PROVIDER = "azampay";
        expect(await card.checkStatus("R", "azampay")).toEqual({ state: "unknown" });
        await card.checkStatus("R", "selcom");
        expect(selcom.checkStatus).toHaveBeenCalledWith("R");
    });
});
