// Exercises admin.service's suspend/unsuspend/permanentlyDeleteUser
// against a real MySQL instance (migrations applied) rather than a
// mocked repository - these are the flows tests/unit/admin/admin.service
// .test.js already covers with mocks; this file exists to catch what a
// mock can't: a typo'd column name, a broken transaction rollback, or
// (as happened here - see admin.repository.js#findUserForPermanentDeletion)
// a query that doesn't actually select the columns the service reads.
//
// fraud.service is mocked purely to avoid it needing its own fixtures;
// audit.service and adminNotification.service are left real since the
// audit_logs/admin_notifications rows they write are exactly what these
// tests assert on.
jest.mock("../../src/modules/fraud/fraud.service");

const db = require("../../src/config/db");
const adminService = require("../../src/modules/admin/admin.service");
const fixtures = require("./helpers/dbFixtures");

beforeEach(async () => {
    await fixtures.resetTables();
});

afterAll(async () => {
    await fixtures.closePool();
});

describe("admin.service.suspendUser / unsuspendUser (real DB)", () => {
    it("suspends the account, records who/why, and writes an audit log entry", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const target = await fixtures.createUser({ first_name: "Amina", last_name: "Hassan" });

        await adminService.suspendUser(target.id, "Repeated chargebacks", admin.id);

        const [[row]] = await db.query(
            "SELECT is_active, suspended_at, suspension_reason, suspended_by FROM users WHERE id = ?",
            [target.id]
        );
        expect(row.is_active).toBe(0);
        expect(row.suspended_at).not.toBeNull();
        expect(row.suspension_reason).toBe("Repeated chargebacks");
        expect(row.suspended_by).toBe(admin.id);

        const auditRows = await fixtures.waitForRows(
            "SELECT event_type, metadata FROM audit_logs WHERE user_id = ? AND event_type = 'account_suspended'",
            [admin.id]
        );
        expect(auditRows).toHaveLength(1);
        const metadata = typeof auditRows[0].metadata === "string"
            ? JSON.parse(auditRows[0].metadata) : auditRows[0].metadata;
        expect(metadata).toEqual({ target_user_id: target.id, reason: "Repeated chargebacks" });
    });

    it("raises an admin notification naming the real suspended account, not undefined/undefined", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const target = await fixtures.createUser({ first_name: "Amina", last_name: "Hassan", email: `amina-${Date.now()}@test.example` });

        await adminService.suspendUser(target.id, "Fraud review", admin.id);

        const rows = await fixtures.waitForRows(
            "SELECT type, message, related_user_id FROM admin_notifications WHERE type = 'account_suspended' AND related_user_id = ?",
            [target.id]
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].related_user_id).toBe(target.id);
        expect(rows[0].message).toContain("Amina Hassan");
        expect(rows[0].message).toContain(target.email);
        expect(rows[0].message).not.toContain("undefined");
    });

    it("rejects suspending an already-deleted account", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const target = await fixtures.createUser();
        await db.query("UPDATE users SET deleted_at = NOW() WHERE id = ?", [target.id]);

        await expect(adminService.suspendUser(target.id, "reason", admin.id)).rejects.toThrow(
            "This account has been deleted and can't be suspended."
        );
    });

    it("unsuspendUser clears the suspension bookkeeping and re-activates the account", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const target = await fixtures.createUser();
        await adminService.suspendUser(target.id, "reason", admin.id);

        await adminService.unsuspendUser(target.id, admin.id);

        const [[row]] = await db.query(
            "SELECT is_active, suspended_at, suspension_reason, suspended_by FROM users WHERE id = ?",
            [target.id]
        );
        expect(row.is_active).toBe(1);
        expect(row.suspended_at).toBeNull();
        expect(row.suspension_reason).toBeNull();
        expect(row.suspended_by).toBeNull();

        const auditRows = await fixtures.waitForRows(
            "SELECT id FROM audit_logs WHERE event_type = 'account_unsuspended'"
        );
        expect(auditRows).toHaveLength(1);
    });
});

describe("admin.service.permanentlyDeleteUser (real DB)", () => {
    it("scrubs the account's PII and marks it permanently deleted", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const target = await fixtures.createUser({ first_name: "Amina", last_name: "Hassan" });
        // An order (buyer_id has no ON DELETE CASCADE) is exactly the kind
        // of financial-record history that blocks attemptHardDeleteUser and
        // forces the anonymize/scrub tombstone path this test asserts on -
        // without it, a history-free user is hard-deleted outright instead.
        await fixtures.createOrder(target.id);

        await adminService.permanentlyDeleteUser(target.id, admin.id);

        const [[row]] = await db.query(
            "SELECT first_name, last_name, email, phone, permanently_deleted_at FROM users WHERE id = ?",
            [target.id]
        );
        expect(row.first_name).toBe("Deleted");
        expect(row.last_name).toBe("User");
        expect(row.email).toBe(`deleted-user-${target.id}@deleted.nexora`);
        expect(row.phone).toBe(`deleted-${target.id}`);
        expect(row.permanently_deleted_at).not.toBeNull();
    });

    it("deletes never-ordered products outright but only deactivates ones tied to an existing order", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const seller = await fixtures.createUser({ role: "seller" });
        const buyer = await fixtures.createUser();

        const neverOrdered = await fixtures.createProduct(seller.id, { name: "Never ordered" });
        const wasOrdered = await fixtures.createProduct(seller.id, { name: "Was ordered" });
        const order = await fixtures.createOrder(buyer.id);
        await fixtures.createOrderItem(order.id, wasOrdered.id, seller.id);

        await adminService.permanentlyDeleteUser(seller.id, admin.id);

        const [neverOrderedRows] = await db.query("SELECT id FROM products WHERE id = ?", [neverOrdered.id]);
        expect(neverOrderedRows).toHaveLength(0);

        const [[wasOrderedRow]] = await db.query(
            "SELECT is_active FROM products WHERE id = ?", [wasOrdered.id]
        );
        expect(wasOrderedRow.is_active).toBe(0);
    });

    it("clears personal bookkeeping (cart, wishlist, OTPs, notifications, push subscriptions)", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const target = await fixtures.createUser();
        const product = await fixtures.createProduct(target.id);

        await fixtures.createCartItem(target.id, product.id);
        await db.query(
            "INSERT INTO wishlist_items (user_id, product_id) VALUES (?, ?)", [target.id, product.id]
        );
        await db.query(
            `INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at)
            VALUES (?, 'password_change', 'hash', DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
            [target.id]
        );
        await db.query(
            "INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'order_update', 'Title', 'Msg')",
            [target.id]
        );
        await db.query(
            "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, 'https://example.test/push', 'p256dh', 'auth')",
            [target.id]
        );

        await adminService.permanentlyDeleteUser(target.id, admin.id);

        const tables = ["cart_items", "wishlist_items", "otp_codes", "notifications", "push_subscriptions"];
        for (const table of tables) {
            const [rows] = await db.query(`SELECT id FROM ${table} WHERE user_id = ?`, [target.id]);
            expect(rows).toHaveLength(0);
        }
    });

    it("tombstones the deleted user's own sent messages but leaves the other participant's messages untouched", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const buyer = await fixtures.createUser();
        const seller = await fixtures.createUser({ role: "seller" });
        const conversation = await fixtures.createConversation(buyer.id, seller.id);
        const buyerMessage = await fixtures.createMessage(conversation.id, buyer.id, { message: "Is this still available?" });
        const sellerMessage = await fixtures.createMessage(conversation.id, seller.id, { message: "Yes it is!" });

        await adminService.permanentlyDeleteUser(buyer.id, admin.id);

        const [[deletedMsg]] = await db.query(
            "SELECT is_deleted, message FROM messages WHERE id = ?", [buyerMessage.id]
        );
        expect(deletedMsg.is_deleted).toBe(1);

        const [[untouchedMsg]] = await db.query(
            "SELECT is_deleted, message FROM messages WHERE id = ?", [sellerMessage.id]
        );
        expect(untouchedMsg.is_deleted).toBe(0);
        expect(untouchedMsg.message).toBe("Yes it is!");
    });

    it("rejects deleting an already-permanently-deleted account, and rejects an admin deleting themself", async () => {
        const admin = await fixtures.createUser({ role: "admin" });
        const target = await fixtures.createUser();
        // Blocking history forces the scrub/tombstone path (row survives
        // with permanently_deleted_at set) rather than a hard delete, so
        // there's actually a row left for the second call to find and
        // reject against - see the "scrubs PII" test above for why.
        await fixtures.createOrder(target.id);

        await adminService.permanentlyDeleteUser(target.id, admin.id);
        await expect(adminService.permanentlyDeleteUser(target.id, admin.id)).rejects.toThrow(
            "This account has already been permanently deleted."
        );

        await expect(adminService.permanentlyDeleteUser(admin.id, admin.id)).rejects.toThrow(
            "You can't permanently delete your own account."
        );
    });

    it("uses a critical-severity, admin-specific admin notification when the deleted account was itself an admin", async () => {
        const actingAdmin = await fixtures.createUser({ role: "admin" });
        const deletedAdmin = await fixtures.createUser({ role: "admin", first_name: "Baraka", last_name: "Juma" });
        // Without blocking history this account is hard-deleted outright,
        // which means related_user_id can no longer point at it (see
        // admin.service.js's hardDeleted ? null : userId) - this test
        // specifically wants a related_user_id-bearing row, so force the
        // scrub path the same way the tests above do.
        await fixtures.createOrder(deletedAdmin.id);

        await adminService.permanentlyDeleteUser(deletedAdmin.id, actingAdmin.id);

        const rows = await fixtures.waitForRows(
            "SELECT type, severity, message FROM admin_notifications WHERE type = 'admin_account_permanently_deleted' AND related_user_id = ?",
            [deletedAdmin.id]
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].severity).toBe("critical");
        expect(rows[0].message).toContain("Baraka Juma");
        expect(rows[0].message).not.toContain("undefined");
    });
});
