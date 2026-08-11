jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const adminRepository = require("../../../src/modules/admin/admin.repository");

beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
});

// Security regression test: auth.middleware.js only re-checks
// is_active/suspended_at/token_version fresh from the DB on every
// request - role and admin_level are baked into the JWT at login and
// otherwise trusted as-is. That means a permission change ONLY takes
// effect immediately if it also bumps token_version (the same
// invalidation mechanism account.repository.js#updatePassword uses) -
// otherwise a demoted/removed admin keeps their old JWT's access for
// the rest of its 7-day life. See requireSuperAdmin.middleware.js and
// authorize.middleware.js, which trust req.user.role/admin_level with
// no independent DB check of their own.
describe("admin.repository - permission changes invalidate existing sessions", () => {
    it("updateAdminLevel bumps token_version in the same query", async () => {
        await adminRepository.updateAdminLevel(1, "admin");

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/);
        expect(sql).toMatch(/admin_level\s*=\s*\?/);
        expect(params).toEqual(["admin", 1]);
    });

    it("revokeAdmin bumps token_version in the same query", async () => {
        await adminRepository.revokeAdmin(1);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/);
        expect(sql).toMatch(/role\s*=\s*'buyer'/);
        expect(params).toEqual([1]);
    });
});
