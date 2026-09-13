jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const adminRepository = require("../../../src/modules/admin/admin.repository");

// New sort option added alongside a deep-dive UI/UX pass on order lists -
// verifies the whitelist-based ORDER BY is actually reaching the SQL string,
// and that an unrecognized value can't be smuggled into the query.
describe("admin.repository.findAllOrders sorting", () => {
    beforeEach(() => db.query.mockReset());

    it("defaults to newest-first when no sort is given", async () => {
        db.query.mockResolvedValue([[]]);

        await adminRepository.findAllOrders();

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY o.created_at DESC");
        expect(sql).toContain("primary_item_name");
    });

    it("sorts by item name (nulls last) when sort=item_name", async () => {
        db.query.mockResolvedValue([[]]);

        await adminRepository.findAllOrders({ sort: "item_name" });

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY primary_item_name IS NULL, primary_item_name ASC");
    });

    it("falls back to the default sort for an unrecognized sort value", async () => {
        db.query.mockResolvedValue([[]]);

        await adminRepository.findAllOrders({ sort: "drop table orders" });

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY o.created_at DESC");
        expect(sql).not.toContain("drop table");
    });
});
