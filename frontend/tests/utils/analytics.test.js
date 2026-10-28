import { describe, it, expect, beforeEach } from "vitest";
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
