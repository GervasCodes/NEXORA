// Dynamic-SQL guard: no new `${...}` inside an SQL template literal without a reviewed allow-list entry
// (backend/scripts/sqlInterpolationGuard.js, backend/tests/sqlInterpolationAllowlist.json), plus the
// in-code column allow-lists for the repositories that interpolate a caller-supplied column.
jest.mock("../../src/config/db", () => require("../helpers/mockDb"));

const db = require("../../src/config/db");
const { check } = require("../../scripts/sqlInterpolationGuard");
const chatRepository = require("../../src/modules/chat/chat.repository");
const disputeRepository = require("../../src/modules/dispute/dispute.repository");

describe("SQL interpolation allow-list", () => {
    it("every interpolated SQL expression in src/ has been reviewed", () => {
        const { unreviewed } = check();
        expect(unreviewed).toEqual([]);
    });
});

describe("repositories that interpolate a column name", () => {
    beforeEach(() => jest.clearAllMocks());

    it("chat: accepts the real per-participant columns and nothing else", async () => {
        db.query.mockResolvedValue([{}]);
        for (const column of ["buyer_muted_at", "seller_muted_at", "agent_muted_at", "buyer_archived_at", "seller_archived_at", "agent_archived_at"]) {
            await chatRepository.setColumnTimestamp(1, column, true);
        }
        expect(db.query).toHaveBeenCalledTimes(6);
        await expect(chatRepository.setColumnTimestamp(1, "id = 1 --", true)).rejects.toThrow("Invalid conversation column");
        await expect(chatRepository.setColumnTimestamp(1, "password", true)).rejects.toThrow("Invalid conversation column");
        expect(db.query).toHaveBeenCalledTimes(6);
    });

    it("chat: the columns the service resolves are all accepted", async () => {
        db.query.mockResolvedValue([{}]);
        const conversation = { buyer_id: 1, seller_id: 2, delivery_agent_id: 3 };
        for (const id of [1, 2, 3]) {
            for (const resolve of [chatRepository.mutedColumnFor, chatRepository.archivedColumnFor]) {
                await expect(chatRepository.setColumnTimestamp(1, resolve(conversation, id), true)).resolves.toBeUndefined();
            }
        }
    });

    it("dispute: only the two SLA checkpoint columns are accepted", async () => {
        db.query.mockResolvedValue([[]]);
        await disputeRepository.findUnnotifiedAtCheckpoint(12, "sla_12h_notified_at");
        await disputeRepository.markCheckpointNotified(1, "sla_20h_notified_at");
        await expect(disputeRepository.findUnnotifiedAtCheckpoint(12, "status")).rejects.toThrow("Invalid dispute checkpoint column");
        await expect(disputeRepository.markCheckpointNotified(1, "status = 'resolved' WHERE 1=1 --")).rejects.toThrow("Invalid dispute checkpoint column");
        expect(db.query).toHaveBeenCalledTimes(2);
    });
});
