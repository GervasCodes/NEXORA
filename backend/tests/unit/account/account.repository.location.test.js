jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const accountRepository = require("../../../src/modules/account/account.repository");

// Phase 5 (map showing users) - this is the actual enforcement point for
// the opt-out decision (PHASE1_DECISIONS.md #4's override): every other
// layer (socket.js, account.service.js) just relays what this query
// reports. If this guard clause is ever weakened, an opted-out account's
// position could still get written and broadcast to the admin map.
describe("account.repository.updateLocation", () => {
    beforeEach(() => db.query.mockReset());

    it("guards the UPDATE on location_sharing_enabled = 1 and role IN ('buyer','seller')", async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);

        await accountRepository.updateLocation(1, -6.79, 39.2);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("location_sharing_enabled = 1");
        expect(sql).toContain("role IN ('buyer', 'seller')");
        expect(params).toEqual([-6.79, 39.2, 1]);
    });

    it("returns true when the row was actually updated (opted in)", async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        await expect(accountRepository.updateLocation(1, -6.79, 39.2)).resolves.toBe(true);
    });

    it("returns false when no row was affected (opted out, wrong role, or unknown user)", async () => {
        db.query.mockResolvedValue([{ affectedRows: 0 }]);
        await expect(accountRepository.updateLocation(1, -6.79, 39.2)).resolves.toBe(false);
    });
});

// Turning the toggle off has to make an opted-out account disappear
// from the map immediately, not just stop it from updating further -
// see the comment on this in account.repository.js#updateSettings.
describe("account.repository.updateSettings location clearing", () => {
    beforeEach(() => db.query.mockReset());

    it("clears location_lat/lng/updated_at in the same UPDATE when opting out", async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);

        await accountRepository.updateSettings(1, { locationSharingEnabled: false });

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("location_sharing_enabled = ?");
        expect(sql).toContain("location_lat = NULL");
        expect(sql).toContain("location_lng = NULL");
        expect(sql).toContain("location_updated_at = NULL");
    });

    it("does not touch location columns when opting in", async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);

        await accountRepository.updateSettings(1, { locationSharingEnabled: true });

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("location_sharing_enabled = ?");
        expect(sql).not.toContain("location_lat = NULL");
    });

    it("leaves location settings alone entirely when the field isn't present in the payload", async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);

        await accountRepository.updateSettings(1, { theme: "dark" });

        const [sql] = db.query.mock.calls[0];
        expect(sql).not.toContain("location_sharing_enabled");
        expect(sql).not.toContain("location_lat");
    });
});
