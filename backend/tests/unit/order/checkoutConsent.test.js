// Phase 2 (Legal & Consumer Trust) — checkout consent.
//
// WRITTEN BUT NOT RUN, per the phase's ground rules. Two layers are
// covered because two layers enforce this independently:
//
//   1. order.validator.js#checkoutValidation — the HTTP-layer gate.
//   2. order.repository.js#insertOrderRow — which STAMPS
//      checkout_terms_accepted_at / checkout_terms_version onto the
//      top-level order row. It deliberately does not throw: it is shared
//      with the group-buy claim path, which has no consent field. See
//      that function's comment and PHASE_2_NOTES.md.
//
// Mocking style follows backend/tests/unit/order/order.repository.test.js
// and order.service.test.js: the db module is mocked, and a fake
// connection object stands in for the pooled connection insertOrderRow
// receives.

jest.mock("../../../src/config/db");

const { validationResult } = require("express-validator");

const db = require("../../../src/config/db");
const orderRepository = require("../../../src/modules/order/order.repository");
const { checkoutValidation } = require("../../../src/modules/order/order.validator");

// --- helpers ---------------------------------------------------------

// A body that satisfies every OTHER rule in checkoutValidation, so any
// error these tests see is attributable to the consent field alone.
const validCheckoutBody = (overrides = {}) => ({
    payment_method: "mobile_money",
    shipping_address: "12 Example St",
    shipping_city: "Dar es Salaam",
    shipping_region: "Dar es Salaam",
    shipping_phone: "+255700000000",
    checkout_terms_accepted: true,
    ...overrides
});

// Runs the whole checkoutValidation chain array against a fake request
// (the same way the route's middleware stack would) and returns the
// error message for `checkout_terms_accepted`, or null if that field
// passed. Running the full array rather than reaching for one chain's
// internals keeps this independent of express-validator's private shape.
const consentError = async (body) => {
    const req = { body, cookies: {}, headers: {}, query: {}, params: {} };

    for (const chain of checkoutValidation) {
        await chain.run(req);
    }

    const failure = validationResult(req)
        .array()
        .find((error) => error.path === "checkout_terms_accepted");

    return failure ? failure.msg : null;
};

const shippingInfo = (overrides = {}) => ({
    payment_method: "mobile_money",
    shipping_address: "12 Example St",
    shipping_city: "Dar es Salaam",
    shipping_region: "Dar es Salaam",
    shipping_phone: "+255700000000",
    checkout_terms_accepted: true,
    ...overrides
});

// Minimal stand-in for a pooled mysql2 connection.
const fakeConnection = () => ({
    query: jest.fn().mockResolvedValue([{ insertId: 42 }]),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn()
});

// Pulls the params array out of the INSERT INTO orders call.
const insertParams = (connection) => {
    const call = connection.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO orders"));
    return call ? call[1] : null;
};

// The two consent columns are the last two placeholders in the INSERT.
const consentColumns = (params) => ({
    acceptedAt: params[params.length - 2],
    version: params[params.length - 1]
});

// --- validator -------------------------------------------------------

describe("order.validator checkoutValidation — checkout_terms_accepted", () => {
    it("accepts a real boolean true (JSON body)", async () => {
        expect(await consentError(validCheckoutBody({ checkout_terms_accepted: true }))).toBeNull();
    });

    it('accepts the string "true" (multipart/older clients), same as signup consent', async () => {
        expect(await consentError(validCheckoutBody({ checkout_terms_accepted: "true" }))).toBeNull();
    });

    it("rejects false", async () => {
        expect(await consentError(validCheckoutBody({ checkout_terms_accepted: false }))).toMatch(/must accept/i);
    });

    it("rejects a missing field — consent is not optional", async () => {
        const body = validCheckoutBody();
        delete body.checkout_terms_accepted;
        expect(await consentError(body)).toMatch(/must accept/i);
    });

    it('rejects truthy-but-not-consent values like "yes" or 1', async () => {
        expect(await consentError(validCheckoutBody({ checkout_terms_accepted: "yes" }))).toMatch(/must accept/i);
        expect(await consentError(validCheckoutBody({ checkout_terms_accepted: 1 }))).toMatch(/must accept/i);
    });
});

// --- repository ------------------------------------------------------

describe("order.repository createOrder — consent persistence", () => {
    let connection;

    beforeEach(() => {
        connection = fakeConnection();
        db.getConnection.mockResolvedValue(connection);
    });

    it("stamps checkout_terms_accepted_at and the current version on a standalone order", async () => {
        await orderRepository.createOrder(1, "ORD-TEST-1", shippingInfo(), [], 1000);

        const { acceptedAt, version } = consentColumns(insertParams(connection));

        expect(acceptedAt).toBeInstanceOf(Date);
        expect(version).toBe(orderRepository.CURRENT_CHECKOUT_TERMS_VERSION);
    });

    it("timestamps server-side rather than trusting a client-supplied value", async () => {
        const forged = new Date("2001-01-01T00:00:00.000Z");

        await orderRepository.createOrder(
            1,
            "ORD-TEST-2",
            shippingInfo({ checkout_terms_accepted_at: forged }),
            [],
            1000
        );

        const { acceptedAt } = consentColumns(insertParams(connection));
        expect(acceptedAt.getTime()).not.toBe(forged.getTime());
    });

    it("leaves both columns NULL when no consent was captured, rather than fabricating one", async () => {
        // This is the group-buy claim shape: groupBuy.service.js#claim
        // calls createOrder directly with shippingInfo that has no
        // consent field. It must still succeed — the checkout consent
        // gate is enforced at the HTTP layer on the /orders route, not
        // here — but it must not invent a consent record.
        const info = shippingInfo();
        delete info.checkout_terms_accepted;

        await orderRepository.createOrder(1, "ORD-TEST-3", info, [], 1000);

        const { acceptedAt, version } = consentColumns(insertParams(connection));

        expect(acceptedAt).toBeNull();
        expect(version).toBeNull();
        expect(connection.commit).toHaveBeenCalled();
    });

    it("treats an explicit false the same as absent — no consent record", async () => {
        await orderRepository.createOrder(
            1,
            "ORD-TEST-4",
            shippingInfo({ checkout_terms_accepted: false }),
            [],
            1000
        );

        const { acceptedAt, version } = consentColumns(insertParams(connection));

        expect(acceptedAt).toBeNull();
        expect(version).toBeNull();
    });

    it('accepts the string "true" as consent, matching the validator', async () => {
        await orderRepository.createOrder(
            1,
            "ORD-TEST-4b",
            shippingInfo({ checkout_terms_accepted: "true" }),
            [],
            1000
        );

        const { acceptedAt, version } = consentColumns(insertParams(connection));

        expect(acceptedAt).toBeInstanceOf(Date);
        expect(version).toBe(orderRepository.CURRENT_CHECKOUT_TERMS_VERSION);
    });
});

describe("order.repository createSplitOrder — consent on the parent only", () => {
    let connection;

    beforeEach(() => {
        connection = fakeConnection();
        db.getConnection.mockResolvedValue(connection);
    });

    it("records consent once on the parent, leaving per-vendor child orders NULL", async () => {
        const sellerGroups = [
            { sellerId: 10, items: [], subtotal: 600 },
            { sellerId: 11, items: [], subtotal: 400 }
        ];

        await orderRepository.createSplitOrder(1, "ORD-TEST-5", shippingInfo(), sellerGroups, 1000);

        const orderInserts = connection.query.mock.calls
            .filter(([sql]) => sql.includes("INSERT INTO orders"))
            .map(([, params]) => consentColumns(params));

        // One parent + one row per vendor.
        expect(orderInserts).toHaveLength(3);

        // Parent carries the consent record...
        expect(orderInserts[0].acceptedAt).toBeInstanceOf(Date);
        expect(orderInserts[0].version).toBe(orderRepository.CURRENT_CHECKOUT_TERMS_VERSION);

        // ...the children do not. A multi-vendor cart is one purchase the
        // buyer consented to once, not one consent per vendor.
        orderInserts.slice(1).forEach(({ acceptedAt, version }) => {
            expect(acceptedAt).toBeNull();
            expect(version).toBeNull();
        });
    });
});
