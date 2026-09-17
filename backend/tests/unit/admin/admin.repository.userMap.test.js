jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const adminRepository = require("../../../src/modules/admin/admin.repository");

// Phase 5 (map showing users) - the admin map's whole privacy guarantee
// (an opted-out buyer/seller never appears, per PHASE1_DECISIONS.md #4's
// override) lives in this one query's WHERE clause. Asserting on the
// generated SQL directly, the same way admin.repository.orders.test.js
// already does for its ORDER BY whitelist, rather than mocking rows back
// (which would only prove the mapping works, not that the filter is
// actually being applied).
describe("admin.repository.findUserMapPoints", () => {
    beforeEach(() => db.query.mockReset());

    it("only selects buyers/sellers with sharing enabled, active, and an actual position on file", async () => {
        db.query.mockResolvedValue([[]]);

        await adminRepository.findUserMapPoints();

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("role IN ('buyer', 'seller')");
        expect(sql).toContain("location_sharing_enabled = 1");
        expect(sql).toContain("is_active = TRUE");
        expect(sql).toContain("deleted_at IS NULL");
        expect(sql).toContain("location_lat IS NOT NULL");
        expect(sql).toContain("location_lng IS NOT NULL");
    });

    it("returns whatever rows the (already-filtered) query yields", async () => {
        const row = { id: 1, first_name: "A", last_name: "B", role: "seller", location_lat: -6.79, location_lng: 39.2 };
        db.query.mockResolvedValue([[row]]);

        await expect(adminRepository.findUserMapPoints()).resolves.toEqual([row]);
    });
});
