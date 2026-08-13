// Real-database integration tests for booking.repository.js's
// createBooking / cancelBooking - added in Phase RF3 of the red-flag
// remediation plan, since the booking module had no test coverage at
// all before this (see NEXORA_Technical_Analysis_Report.pdf and the
// RF2 audit). Exists specifically to validate the batched
// availability-decrement/restore rewrite (one UPDATE covering every
// date in a booking's range, instead of one per date) against real
// MySQL semantics - CASE-based multi-row UPDATEs and multi-row INSERTs
// are exactly the kind of SQL that passes against a mock but can still
// be subtly wrong against a real engine.
//
// Scope is booking.repository.js + availability.repository.js only
// (the two files this phase actually changed) - not the full
// booking.service.js flow (pricing, notifications, etc.).

const db = require("../../src/config/db");
const bookingRepository = require("../../src/modules/booking/booking.repository");
const availabilityRepository = require("../../src/modules/availability/availability.repository");
const fixtures = require("./helpers/dbFixtures");

const createService = async (providerId, overrides = {}) => {
    const slug = `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [result] = await db.query(
        `INSERT INTO services
        (provider_id, category_id, title, slug, pricing_model, base_price, status, is_active)
        VALUES (?, NULL, ?, ?, ?, ?, 'published', 1)`,
        [
            providerId,
            overrides.title || "Test Service",
            slug,
            overrides.pricing_model || "per_night",
            overrides.base_price ?? 1000
        ]
    );
    return { id: result.insertId };
};

const createAvailability = async (serviceId, date, overrides = {}) => {
    await db.query(
        `INSERT INTO service_availability (service_id, date, available_units, status)
        VALUES (?, ?, ?, ?)`,
        [serviceId, date, overrides.available_units ?? 5, overrides.status || "open"]
    );
};

const getAvailability = async (serviceId, date) => {
    const [rows] = await db.query(
        "SELECT available_units, status FROM service_availability WHERE service_id = ? AND date = ?",
        [serviceId, date]
    );
    return rows[0];
};

describe("booking.repository (real database)", () => {
    let providerId;
    let customerId;
    let serviceId;

    beforeEach(async () => {
        await fixtures.resetTables();
        const provider = await fixtures.createUser({ role: "seller" });
        const customer = await fixtures.createUser({ role: "buyer" });
        providerId = provider.id;
        customerId = customer.id;
        const service = await createService(providerId);
        serviceId = service.id;
    });

    afterAll(async () => {
        await db.end();
    });

    describe("createBooking", () => {
        it("decrements availability for every date in the range and inserts one booking_items row per date", async () => {
            await createAvailability(serviceId, "2026-09-01", { available_units: 5 });
            await createAvailability(serviceId, "2026-09-02", { available_units: 3 });
            await createAvailability(serviceId, "2026-09-03", { available_units: 4 });

            const dateItems = [
                { date: "2026-09-01", unitPrice: 1000, subtotal: 2000 },
                { date: "2026-09-02", unitPrice: 1000, subtotal: 2000 },
                { date: "2026-09-03", unitPrice: 1000, subtotal: 2000 }
            ];

            const bookingId = await bookingRepository.createBooking({
                bookingReference: "BK-TEST-001",
                serviceId,
                providerId,
                customerId,
                startDate: "2026-09-01",
                endDate: "2026-09-03",
                quantity: 2,
                amount: 6000,
                dateItems
            });

            expect(bookingId).toBeGreaterThan(0);

            const items = await bookingRepository.findItemsByBookingId(bookingId);
            expect(items).toHaveLength(3);
            expect(items.map((i) => Number(i.subtotal))).toEqual([2000, 2000, 2000]);

            expect((await getAvailability(serviceId, "2026-09-01")).available_units).toBe(3);
            expect((await getAvailability(serviceId, "2026-09-02")).available_units).toBe(1);
            expect((await getAvailability(serviceId, "2026-09-03")).available_units).toBe(2);
        });

        it("rolls back the whole booking (no row created, no availability touched) when one date has insufficient units", async () => {
            await createAvailability(serviceId, "2026-09-10", { available_units: 5 });
            await createAvailability(serviceId, "2026-09-11", { available_units: 1 }); // not enough for quantity 2

            const dateItems = [
                { date: "2026-09-10", unitPrice: 1000, subtotal: 2000 },
                { date: "2026-09-11", unitPrice: 1000, subtotal: 2000 }
            ];

            await expect(bookingRepository.createBooking({
                bookingReference: "BK-TEST-002",
                serviceId,
                providerId,
                customerId,
                startDate: "2026-09-10",
                endDate: "2026-09-11",
                quantity: 2,
                amount: 4000,
                dateItems
            })).rejects.toThrow("No longer enough availability on 2026-09-11");

            // The first date must NOT have been decremented - the whole
            // transaction rolls back, batched or not.
            expect((await getAvailability(serviceId, "2026-09-10")).available_units).toBe(5);
            expect((await getAvailability(serviceId, "2026-09-11")).available_units).toBe(1);

            const [bookingRows] = await db.query(
                "SELECT id FROM bookings WHERE booking_reference = ?", ["BK-TEST-002"]
            );
            expect(bookingRows).toHaveLength(0);
        });

        it("rolls back when a date has no availability row at all", async () => {
            await createAvailability(serviceId, "2026-09-20", { available_units: 5 });
            // 2026-09-21 has no service_availability row.

            const dateItems = [
                { date: "2026-09-20", unitPrice: 1000, subtotal: 1000 },
                { date: "2026-09-21", unitPrice: 1000, subtotal: 1000 }
            ];

            await expect(bookingRepository.createBooking({
                bookingReference: "BK-TEST-003",
                serviceId,
                providerId,
                customerId,
                startDate: "2026-09-20",
                endDate: "2026-09-21",
                quantity: 1,
                amount: 2000,
                dateItems
            })).rejects.toThrow("No longer enough availability on 2026-09-21");

            expect((await getAvailability(serviceId, "2026-09-20")).available_units).toBe(5);
        });

        it("rolls back when a date is closed", async () => {
            await createAvailability(serviceId, "2026-09-25", { available_units: 5, status: "closed" });

            const dateItems = [{ date: "2026-09-25", unitPrice: 1000, subtotal: 1000 }];

            await expect(bookingRepository.createBooking({
                bookingReference: "BK-TEST-004",
                serviceId,
                providerId,
                customerId,
                startDate: "2026-09-25",
                endDate: "2026-09-25",
                quantity: 1,
                amount: 1000,
                dateItems
            })).rejects.toThrow("No longer enough availability on 2026-09-25");
        });
    });

    describe("cancelBooking", () => {
        it("restores availability for every date and sets the booking to cancelled", async () => {
            await createAvailability(serviceId, "2026-10-01", { available_units: 5 });
            await createAvailability(serviceId, "2026-10-02", { available_units: 5 });

            const dateItems = [
                { date: "2026-10-01", unitPrice: 1000, subtotal: 3000 },
                { date: "2026-10-02", unitPrice: 1000, subtotal: 3000 }
            ];

            const bookingId = await bookingRepository.createBooking({
                bookingReference: "BK-TEST-CANCEL-1",
                serviceId,
                providerId,
                customerId,
                startDate: "2026-10-01",
                endDate: "2026-10-02",
                quantity: 3,
                amount: 6000,
                dateItems
            });

            expect((await getAvailability(serviceId, "2026-10-01")).available_units).toBe(2);
            expect((await getAvailability(serviceId, "2026-10-02")).available_units).toBe(2);

            const bookingItems = await bookingRepository.findItemsByBookingId(bookingId);
            const cancelItems = bookingItems.map((item) => ({
                service_date: item.service_date instanceof Date
                    ? item.service_date.toISOString().slice(0, 10)
                    : item.service_date,
                quantity: item.quantity
            }));

            await bookingRepository.cancelBooking(bookingId, serviceId, cancelItems);

            expect((await getAvailability(serviceId, "2026-10-01")).available_units).toBe(5);
            expect((await getAvailability(serviceId, "2026-10-02")).available_units).toBe(5);

            const booking = await bookingRepository.findById(bookingId);
            expect(booking.status).toBe("cancelled");
        });

        it("restores each date's own quantity correctly, not a shared/last-write value", async () => {
            await createAvailability(serviceId, "2026-11-01", { available_units: 10 });
            await createAvailability(serviceId, "2026-11-02", { available_units: 10 });

            // Simulate two different per-date quantities directly (bypasses
            // createBooking, which always uses one quantity for every date -
            // this exercises restoreUnitsForDates' CASE branching itself).
            const [bookingResult] = await db.query(
                `INSERT INTO bookings
                (booking_reference, service_id, provider_id, customer_id, start_date, end_date, quantity, amount, status, payment_status)
                VALUES ('BK-TEST-CANCEL-2', ?, ?, ?, '2026-11-01', '2026-11-02', 1, 1000, 'confirmed', 'paid')`,
                [serviceId, providerId, customerId]
            );
            const bookingId = bookingResult.insertId;

            await bookingRepository.cancelBooking(bookingId, serviceId, [
                { service_date: "2026-11-01", quantity: 2 },
                { service_date: "2026-11-02", quantity: 7 }
            ]);

            expect((await getAvailability(serviceId, "2026-11-01")).available_units).toBe(12);
            expect((await getAvailability(serviceId, "2026-11-02")).available_units).toBe(17);
        });
    });

    describe("availability.repository batched helpers", () => {
        it("decrementUnitsForDates never oversells: a date failing its guard is left untouched even when batched with passing dates", async () => {
            await createAvailability(serviceId, "2026-12-01", { available_units: 5 });
            await createAvailability(serviceId, "2026-12-02", { available_units: 1 });

            const connection = await db.getConnection();
            try {
                const affected = await availabilityRepository.decrementUnitsForDates(
                    connection, serviceId, ["2026-12-01", "2026-12-02"], 2
                );
                // Only 2026-12-01 has enough units for quantity 2.
                expect(affected).toBe(1);
            } finally {
                connection.release();
            }

            expect((await getAvailability(serviceId, "2026-12-01")).available_units).toBe(3);
            expect((await getAvailability(serviceId, "2026-12-02")).available_units).toBe(1); // untouched
        });
    });
});
