jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const categoryRepository = require("../../../src/modules/category/category.repository");

// The 'services' category row (migration 065) only exists so
// /departments/services resolves - it isn't a real admin-manageable
// department (the homepage renders its own hardcoded Services tile
// regardless of this row's is_active/cover_image_url). It should never
// appear in the admin category-management list, which also feeds the
// Maintenance Management overview.
describe("category.repository.findAllForAdmin", () => {
    beforeEach(() => db.query.mockReset());

    it("excludes the 'services' row from the admin category list", async () => {
        db.query.mockResolvedValue([[]]);

        await categoryRepository.findAllForAdmin();

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("slug != 'services'");
    });
});
