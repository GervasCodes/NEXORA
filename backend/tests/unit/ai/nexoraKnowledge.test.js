const fs = require("fs");
const path = require("path");

jest.mock("../../../src/utils/logger", () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const logger = require("../../../src/utils/logger");
const {
    SUPPORT_CONTACT,
    SECTIONS,
    buildKnowledgeText
} = require("../../../src/modules/ai/knowledge/nexoraKnowledge");

// Roughly 4 characters per token for English text.
const approxTokens = (text) => Math.round(text.length / 4);

const LIVE_SETTINGS = {
    return_window_days: "10",
    return_window_insured_days: "21",
    dispute_seller_response_hours: "96",
    cod_auto_confirm_hours: "36",
    max_cart_line_items: "80",
    max_quantity_per_cart_line: "400",
    topup_min_amount: "2000",
    topup_max_amount: "2500000",
    escrow_hold_days: "7",
    withdrawal_min_amount: "7000",
    withdrawal_max_amount: "4000000",
    withdrawal_daily_cap_none: "150000",
    withdrawal_daily_cap_id_verified: "1800000",
    withdrawal_daily_cap_business_verified: "9000000",
    withdrawal_new_payout_hold_hours: "12",
    withdrawal_open_dispute_block_threshold: "4",
    commission_rate: "12",
    monetization_commission_enabled: "true",
    monetization_sponsorship_enabled: "true",
    sponsorship_daily_rate: "6000",
    featured_store_daily_rate: "9000"
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe("ai/knowledge/nexoraKnowledge.buildKnowledgeText - role gating", () => {
    it("gives signed-out visitors buyer information and general seller information", () => {
        const text = buildKnowledgeText({ role: null, settings: LIVE_SETTINGS });

        expect(text).toContain("## What NEXORA is");
        expect(text).toContain("## Buying: cart, checkout and payment");
        expect(text).toContain("## Cancelling, returns, disputes and refunds");
        expect(text).toContain("## Selling on NEXORA (general)");
    });

    it("keeps money-sensitive seller details and delivery-agent specifics away from signed-out visitors", () => {
        const text = buildKnowledgeText({ role: null, settings: LIVE_SETTINGS });

        expect(text).not.toContain("## Seller wallet, commission and withdrawals");
        expect(text).not.toContain("## Seller promotion, plans and tools");
        expect(text).not.toContain("## Delivery agents");
        // The live seller numbers must not leak into the public text.
        expect(text).not.toContain("150,000");
        expect(text).not.toContain("1,800,000");
        expect(text).not.toContain("9,000,000");
        expect(text).not.toContain("12%");
    });

    it("treats a buyer like a signed-out visitor for seller and delivery sections", () => {
        const buyer = buildKnowledgeText({ role: "buyer", settings: LIVE_SETTINGS });
        const anonymous = buildKnowledgeText({ role: null, settings: LIVE_SETTINGS });

        expect(buyer).toBe(anonymous);
    });

    it("treats an unknown role like a signed-out visitor (least privilege)", () => {
        const odd = buildKnowledgeText({ role: "something-made-up", settings: LIVE_SETTINGS });
        const anonymous = buildKnowledgeText({ role: null, settings: LIVE_SETTINGS });

        expect(odd).toBe(anonymous);
    });

    it("adds seller money details only for sellers", () => {
        const text = buildKnowledgeText({ role: "seller", settings: LIVE_SETTINGS });

        expect(text).toContain("## Seller wallet, commission and withdrawals");
        expect(text).toContain("## Seller promotion, plans and tools");
        expect(text).not.toContain("## Delivery agents");
    });

    it("adds delivery-agent specifics only for delivery agents", () => {
        const text = buildKnowledgeText({ role: "delivery_agent", settings: LIVE_SETTINGS });

        expect(text).toContain("## Delivery agents");
        expect(text).not.toContain("## Seller wallet, commission and withdrawals");
    });

    it("lets admins see seller and delivery sections", () => {
        const text = buildKnowledgeText({ role: "admin", settings: LIVE_SETTINGS });

        expect(text).toContain("## Seller wallet, commission and withdrawals");
        expect(text).toContain("## Delivery agents");
    });
});

describe("ai/knowledge/nexoraKnowledge.buildKnowledgeText - live numbers", () => {
    it("uses live platform settings instead of hard-coded defaults", () => {
        const text = buildKnowledgeText({ role: "seller", settings: LIVE_SETTINGS });

        expect(text).toContain("within 10 days of delivery");
        expect(text).toContain("21 days if the buyer protection add-on");
        expect(text).toContain("The seller has 96 hours to respond");
        expect(text).toContain("(36 hours)");
        expect(text).toContain("up to 80 different items and up to 400 units");
        expect(text).toContain("between TZS 2,000 and TZS 2,500,000");
        expect(text).toContain("currently 7 days");
        expect(text).toContain("between TZS 7,000 and TZS 4,000,000");
        expect(text).toContain("TZS 150,000 unverified, TZS 1,800,000 ID-verified, TZS 9,000,000 business-verified");
        expect(text).toContain("waits 12 hours");
        expect(text).toContain("4 or more open disputes");
        expect(text).toContain("default platform commission is 12%");
        expect(text).toContain("sponsorship TZS 6,000, featured store TZS 9,000");
    });

    it("never states a commission rate unless commission charging is confirmed on", () => {
        const off = buildKnowledgeText({
            role: "seller",
            settings: { ...LIVE_SETTINGS, monetization_commission_enabled: "false" }
        });
        const missing = buildKnowledgeText({
            role: "seller",
            settings: { commission_rate: "12" }
        });

        expect(off).not.toContain("12%");
        expect(missing).not.toContain("12%");
        expect(off).toContain("check there or ask support rather than assuming");
    });

    it("falls back to number-free wording when no settings can be read, never a placeholder or a guess", () => {
        const text = buildKnowledgeText({ role: "admin", settings: {} });

        expect(text.length).toBeGreaterThan(1000);
        expect(text).not.toMatch(/undefined|NaN|null/);
        expect(text).not.toMatch(/\d+ days of delivery/);
        expect(text).not.toMatch(/TZS \d/);
        expect(text).toContain("within the return window shown in the app");
    });

    it("tolerates garbage settings values without throwing", () => {
        const text = buildKnowledgeText({
            role: "seller",
            settings: { return_window_days: "abc", escrow_hold_days: {}, withdrawal_min_amount: null }
        });

        expect(text).not.toMatch(/undefined|NaN/);
        expect(text).toContain("## Seller wallet, commission and withdrawals");
    });

    it("tolerates a non-object settings argument", () => {
        expect(() => buildKnowledgeText({ role: null, settings: null })).not.toThrow();
        expect(() => buildKnowledgeText()).not.toThrow();
    });

    it("skips only the section that fails to build and logs it", () => {
        const settings = { ...LIVE_SETTINGS };
        Object.defineProperty(settings, "return_window_days", {
            get() {
                throw new Error("boom");
            },
            enumerable: true
        });

        const text = buildKnowledgeText({ role: null, settings });

        expect(text).not.toContain("## Cancelling, returns, disputes and refunds");
        expect(text).toContain("## Buying: cart, checkout and payment");
        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ section: "cancel_returns_disputes" }),
            expect.stringContaining("skipping")
        );
    });
});

describe("ai/knowledge/nexoraKnowledge - facts verified against the code", () => {
    it("says orders can be cancelled while pending or processing (constants/orderStatus.js)", () => {
        const { CANCELLABLE_STATUSES } = require("../../../src/constants/orderStatus");
        const text = buildKnowledgeText({ role: null, settings: {} });

        expect(CANCELLABLE_STATUSES).toEqual(["pending", "processing"]);
        expect(text).toContain("while it is still pending or processing");
    });

    it("says bookings can be cancelled while pending or confirmed (booking.service.js)", () => {
        const source = fs.readFileSync(
            path.join(__dirname, "../../../src/modules/booking/booking.service.js"),
            "utf8"
        );
        const text = buildKnowledgeText({ role: null, settings: {} });

        expect(source).toContain('const CANCELLABLE_STATUSES = ["pending", "confirmed"];');
        expect(text).toContain("cancelled while it is pending or confirmed");
    });
});

describe("ai/knowledge/nexoraKnowledge - public safety", () => {
    const FORBIDDEN = [
        /escrow/i,
        /licens/i,
        /fraud/i,
        /known[- ]issues/i,
        /token cap/i,
        /ai_daily|ai_monthly|ai_enabled/i,
        /jwt|api[_ ]key|webhook secret|\.env/i,
        /BRELA/i,
        /TZ-BRLA/i,
        /171543797/,
        /administrator manual/i,
        /super_admin/i,
        /node_modules|\/src\/|\.jsx?\b/i
    ];

    it.each([null, "buyer", "seller", "delivery_agent", "admin"])(
        "contains no internal terms or identifiers for role %s",
        (role) => {
            const text = buildKnowledgeText({ role, settings: LIVE_SETTINGS });

            for (const pattern of FORBIDDEN) {
                expect(text).not.toMatch(pattern);
            }
        }
    );

    it("exposes the support contact from a single constant", () => {
        const text = buildKnowledgeText({ role: null, settings: {} });

        expect(text).toContain(SUPPORT_CONTACT.email);
        expect(text).toContain(SUPPORT_CONTACT.phone);
        expect(SUPPORT_CONTACT.contactPage).toBe("/contact");
    });

    it("never instructs the assistant to act - every section describes what a person does themselves", () => {
        const text = buildKnowledgeText({ role: "admin", settings: LIVE_SETTINGS });

        expect(text).not.toMatch(/\bI (will|can|have) (place|cancel|refund|approve|pay)\b/i);
        expect(text).not.toMatch(/the assistant (will|can) (place|cancel|refund|approve|pay)/i);
    });
});

describe("ai/knowledge/nexoraKnowledge - size and structure", () => {
    it("stays inside the 3-5k token budget for every role", () => {
        for (const role of [null, "seller", "delivery_agent", "admin"]) {
            const text = buildKnowledgeText({ role, settings: LIVE_SETTINGS });

            expect(approxTokens(text)).toBeLessThanOrEqual(5000);
        }
        expect(approxTokens(buildKnowledgeText({ role: null, settings: LIVE_SETTINGS }))).toBeGreaterThanOrEqual(1500);
    });

    it("has unique section ids and a valid audience on every section", () => {
        const ids = SECTIONS.map((section) => section.id);

        expect(new Set(ids).size).toBe(ids.length);
        for (const section of SECTIONS) {
            expect(["everyone", "seller", "delivery"]).toContain(section.audience);
            expect(typeof section.build).toBe("function");
        }
    });

    it("only references app pages whose first path segment exists in frontend routes", () => {
        const appSource = fs.readFileSync(
            path.join(__dirname, "../../../../frontend/src/App.jsx"),
            "utf8"
        );
        const knownFirstSegments = new Set(
            [...appSource.matchAll(/path="\/([a-z0-9-]+)/g)].map((match) => match[1])
        );
        const text = buildKnowledgeText({ role: "admin", settings: LIVE_SETTINGS });
        // A path counts only when it starts after whitespace or "(" so prose
        // like "stock/sales/expenses" is not mistaken for a route.
        const referenced = [...text.matchAll(/(?:^|[\s(])\/([a-z][a-z0-9-]*)/gm)].map((match) => match[1]);

        expect(knownFirstSegments.size).toBeGreaterThan(10);
        expect(referenced.length).toBeGreaterThan(10);
        for (const segment of new Set(referenced)) {
            expect(knownFirstSegments).toContain(segment);
        }
    });
});
