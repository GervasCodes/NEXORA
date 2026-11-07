import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ANALYTICS_CONSENT_KEY, getAnalyticsConsent, isPrivatePath, setAnalyticsConsent, trackPageView } from "../../src/utils/analytics";

describe("isPrivatePath", () => {
    it("never reports account, checkout, seller or admin pages", () => {
        for (const p of ["/account", "/cart", "/checkout/pay", "/orders/12", "/seller/products", "/admin", "/login"]) {
            expect(isPrivatePath(p)).toBe(true);
        }
    });

    it("allows public catalog pages", () => {
        for (const p of ["/", "/products", "/products/some-slug", "/services", "/guides/how-to"]) {
            expect(isPrivatePath(p)).toBe(false);
        }
    });
});

describe("consent", () => {
    beforeEach(() => {
        localStorage.clear();
        delete window.gtag;
        window.dataLayer = [];
    });

    it("is null until the visitor answers", () => {
        expect(getAnalyticsConsent()).toBeNull();
    });

    it("stores the visitor's answer", () => {
        setAnalyticsConsent("denied");
        expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
        setAnalyticsConsent("granted");
        expect(getAnalyticsConsent()).toBe("granted");
    });

    it("sends nothing when no measurement id is configured or consent is missing", () => {
        trackPageView("/products");
        expect(window.dataLayer).toEqual([]);
        expect(window.gtag).toBeUndefined();
    });
});

describe("order confirmation privacy", () => {
    it("never reports page views of the confirmation page (its path carries an order id)", () => {
        expect(isPrivatePath("/order-confirmed/55")).toBe(true);
    });
});

describe("trackPurchase", () => {
    const load = async () => {
        vi.resetModules();
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "G-TEST1234");
        return import("../../src/utils/analytics");
    };

    beforeEach(() => {
        localStorage.clear();
        delete window.gtag;
        window.dataLayer = [];
    });
    afterEach(() => vi.unstubAllEnvs());

    it("sends nothing without a configured id or without consent", async () => {
        const noId = await import("../../src/utils/analytics");
        expect(await noId.trackPurchase({ orderId: 5, value: 1000 })).toBe(false);

        const { trackPurchase } = await load();
        expect(await trackPurchase({ orderId: 5, value: 1000 })).toBe(false); // consent never answered
        expect(window.dataLayer).toEqual([]);
    });

    it("sends one minimal purchase event after consent, with a hashed id and no order details", async () => {
        const { trackPurchase, setAnalyticsConsent } = await load();
        setAnalyticsConsent("granted");
        window.dataLayer = [];

        expect(await trackPurchase({ orderId: 55, value: 45000, paymentType: "mobile_money" })).toBe(true);

        const events = window.dataLayer.map((entry) => Array.from(entry)).filter((entry) => entry[0] === "event");
        expect(events).toHaveLength(1);
        const [, name, params] = events[0];
        expect(name).toBe("purchase");
        expect(params).toEqual({ transaction_id: expect.stringMatching(/^[0-9a-f]{8,}$/), value: 45000, currency: "TZS", payment_type: "mobile_money" });
        expect(params.transaction_id).not.toContain("55");
        expect(Object.keys(params)).not.toContain("items");
    });

    it("reports a given order only once", async () => {
        const { trackPurchase, setAnalyticsConsent } = await load();
        setAnalyticsConsent("granted");

        expect(await trackPurchase({ orderId: 7, value: 100 })).toBe(true);
        expect(await trackPurchase({ orderId: 7, value: 100 })).toBe(false);
    });

    it("rejects a missing order id or a non-positive amount", async () => {
        const { trackPurchase, setAnalyticsConsent } = await load();
        setAnalyticsConsent("granted");

        expect(await trackPurchase({ value: 100 })).toBe(false);
        expect(await trackPurchase({ orderId: 8, value: 0 })).toBe(false);
        expect(await trackPurchase({ orderId: 8, value: "abc" })).toBe(false);
    });

    it("sends nothing after the visitor declines", async () => {
        const { trackPurchase, setAnalyticsConsent } = await load();
        setAnalyticsConsent("denied");
        expect(await trackPurchase({ orderId: 9, value: 100 })).toBe(false);
    });
});
