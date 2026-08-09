// Regression test for the "checkout shows Mobile Money but payment
// fails with 'Mobile money is not configured'" bug (Phase: Monetization
// Master Switch & Payment Reliability).
//
// Root cause: providers/registry.js's mobile_money.isConfigured() only
// checked that MOBILE_MONEY_PROVIDER named something other than
// "simulate" - it never asked the actually-selected rail (malipopay /
// selcom / azampay) whether IT was really configured (API credentials
// present). So an admin could set MOBILE_MONEY_PROVIDER=malipopay with
// no MalipoPay credentials in .env, and checkout would list Mobile
// Money as available anyway.
//
// This suite mocks the underlying malipopay/selcom/azampay provider
// modules (not the router) so it can assert on the exact scenario that
// broke: registry.listConfiguredProviders() must reflect the selected
// rail's OWN isConfigured() result, not just whether a name was set.
jest.mock("../../../src/modules/payment/providers/malipopay.provider", () => ({
    isConfigured: jest.fn(),
    initiate: jest.fn(),
    disburse: jest.fn(),
    refund: jest.fn()
}));
jest.mock("../../../src/modules/payment/providers/selcom.provider", () => ({
    isConfigured: jest.fn(),
    initiate: jest.fn(),
    disburse: jest.fn(),
    refund: jest.fn()
}));
jest.mock("../../../src/modules/payment/providers/azampay.provider", () => ({
    isConfigured: jest.fn(),
    initiate: jest.fn(),
    disburse: jest.fn(),
    refund: jest.fn()
}));
jest.mock("../../../src/modules/payment/providers/snippe.provider", () => ({
    isConfigured: jest.fn(() => false),
    createCheckoutSession: jest.fn()
}));
jest.mock("../../../src/modules/payment/providers/malipopayCard.provider", () => ({
    isConfigured: jest.fn(() => false),
    getEnabledBrands: jest.fn(() => []),
    createCheckoutSession: jest.fn()
}));
jest.mock("../../../src/modules/payment/providers/paypal.provider", () => ({
    isConfigured: jest.fn(() => false)
}));

const malipopayProvider = require("../../../src/modules/payment/providers/malipopay.provider");
const registry = require("../../../src/modules/payment/providers/registry");

describe("payment providers/registry.js - mobile_money availability", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        // Deliberately NOT calling jest.resetModules() here: registry.js's
        // isConfigured() functions read process.env live at call time
        // (not cached at require time), so a single top-level require of
        // both registry and malipopayProvider works fine across tests -
        // resetModules() would instead re-run the jest.mock() factories on
        // every require() inside a test, producing a NEW mock object
        // disconnected from the `malipopayProvider` reference captured
        // above, so mockReturnValue() calls below would silently apply to
        // the wrong (discarded) instance. clearAllMocks() alone is safe
        // here: it resets call history without changing object identity.
        jest.clearAllMocks();
        process.env = { ...ORIGINAL_ENV };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it("reports mobile_money as NOT configured in production when the selected rail's own isConfigured() is false, even though MOBILE_MONEY_PROVIDER names a real rail", () => {
        process.env.NODE_ENV = "production";
        process.env.MOBILE_MONEY_PROVIDER = "malipopay";
        malipopayProvider.isConfigured.mockReturnValue(false); // credentials missing

        const providers = registry.listProviders();
        const mobileMoney = providers.find((p) => p.key === "mobile_money");

        expect(mobileMoney.configured).toBe(false);
        expect(registry.listConfiguredProviders().some((p) => p.key === "mobile_money")).toBe(false);
    });

    it("reports mobile_money as configured in production when the selected rail's own isConfigured() is true", () => {
        process.env.NODE_ENV = "production";
        process.env.MOBILE_MONEY_PROVIDER = "malipopay";
        malipopayProvider.isConfigured.mockReturnValue(true); // real credentials present

        const providers = registry.listProviders();
        const mobileMoney = providers.find((p) => p.key === "mobile_money");

        expect(mobileMoney.configured).toBe(true);
        expect(registry.listConfiguredProviders().some((p) => p.key === "mobile_money")).toBe(true);
    });

    it("always reports mobile_money as configured outside production, regardless of the underlying rail's credentials", () => {
        process.env.NODE_ENV = "test";
        process.env.MOBILE_MONEY_PROVIDER = "malipopay";
        malipopayProvider.isConfigured.mockReturnValue(false);

        const mobileMoney = registry.listProviders().find((p) => p.key === "mobile_money");

        expect(mobileMoney.configured).toBe(true);
    });
});
