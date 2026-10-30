// Regression test for the "checkout shows Mobile Money but payment fails with
// 'Mobile money is not configured'" bug: registry.js must reflect the SELECTED
// gateway's own isConfigured() (real credentials), not just whether a name is
// set. Same for the card rail and CARD_PROVIDER.
jest.mock("../../../src/modules/payment/providers/selcom.provider", () => ({
    isConfigured: jest.fn(), initiate: jest.fn(), disburse: jest.fn(), refund: jest.fn(), createCheckoutSession: jest.fn()
}));
jest.mock("../../../src/modules/payment/providers/azampay.provider", () => ({
    isConfigured: jest.fn(), supportsCheckout: jest.fn(), initiate: jest.fn(), disburse: jest.fn(), refund: jest.fn(), createCheckoutSession: jest.fn()
}));
jest.mock("../../../src/modules/payment/providers/pawapay.provider", () => ({
    isConfigured: jest.fn(), initiate: jest.fn(), disburse: jest.fn(), refund: jest.fn()
}));
jest.mock("../../../src/modules/payment/providers/paypal.provider", () => ({
    isConfigured: jest.fn(() => false)
}));

const selcom = require("../../../src/modules/payment/providers/selcom.provider");
const azampay = require("../../../src/modules/payment/providers/azampay.provider");
const pawapay = require("../../../src/modules/payment/providers/pawapay.provider");
const paypal = require("../../../src/modules/payment/providers/paypal.provider");
const registry = require("../../../src/modules/payment/providers/registry");

const find = (key) => registry.listProviders().find((p) => p.key === key);

describe("payment providers/registry.js", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...ORIGINAL_ENV };
        delete process.env.MOBILE_MONEY_PROVIDER;
        delete process.env.CARD_PROVIDER;
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    describe("mobile_money", () => {
        it.each([["azampay", azampay], ["selcom", selcom], ["pawapay", pawapay]])(
            "in production follows %s's own isConfigured()",
            (name, gateway) => {
                process.env.NODE_ENV = "production";
                process.env.MOBILE_MONEY_PROVIDER = name;

                gateway.isConfigured.mockReturnValue(false);
                expect(find("mobile_money").configured).toBe(false);
                expect(registry.listConfiguredProviders().some((p) => p.key === "mobile_money")).toBe(false);

                gateway.isConfigured.mockReturnValue(true);
                expect(find("mobile_money").configured).toBe(true);
                expect(find("mobile_money").gateway).toBe(name);
            }
        );

        it("is not configured in production when MOBILE_MONEY_PROVIDER names nothing known", () => {
            process.env.NODE_ENV = "production";
            process.env.MOBILE_MONEY_PROVIDER = "malipopay";
            expect(find("mobile_money").configured).toBe(false);
        });

        it("is always configured outside production (simulator fallback)", () => {
            process.env.NODE_ENV = "test";
            process.env.MOBILE_MONEY_PROVIDER = "azampay";
            azampay.isConfigured.mockReturnValue(false);
            expect(find("mobile_money").configured).toBe(true);
        });
    });

    describe("card", () => {
        it("follows the selected gateway and is typed as a card rail", () => {
            process.env.CARD_PROVIDER = "selcom";
            selcom.isConfigured.mockReturnValue(true);

            const card = find("card");
            expect(card.configured).toBe(true);
            expect(card.type).toBe("card");
            expect(card.gateway).toBe("selcom");
        });

        it("azampay needs hosted-checkout config (vendor id), not just login credentials", () => {
            process.env.CARD_PROVIDER = "azampay";
            azampay.isConfigured.mockReturnValue(true);
            azampay.supportsCheckout.mockReturnValue(false);
            expect(find("card").configured).toBe(false);

            azampay.supportsCheckout.mockReturnValue(true);
            expect(find("card").configured).toBe(true);
        });

        it("pawapay cannot take cards: card is off and the registry reports the misconfiguration", () => {
            process.env.CARD_PROVIDER = "pawapay";
            pawapay.isConfigured.mockReturnValue(true);

            expect(find("card").configured).toBe(false);
            const problems = registry.validateRegistry({ warn: jest.fn() });
            expect(problems.some((p) => /CARD_PROVIDER="pawapay"/.test(p))).toBe(true);
        });

        it("is off when CARD_PROVIDER is unset", () => {
            expect(find("card").configured).toBe(false);
        });
    });

    describe("paypal", () => {
        it("is listed as soon as its credentials are present (no opt-in flag)", () => {
            paypal.isConfigured.mockReturnValue(true);
            expect(find("paypal").configured).toBe(true);
        });
    });

    it("lists no retired gateways", () => {
        expect(registry.listProviders().map((p) => p.key).sort()).toEqual(["card", "mobile_money", "paypal"]);
    });
});
