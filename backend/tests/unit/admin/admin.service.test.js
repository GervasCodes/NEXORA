jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/admin/admin.repository");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/wallet/wallet.service");
jest.mock("../../../src/modules/auth/auth.repository");
jest.mock("../../../src/modules/account/account.repository");
jest.mock("../../../src/modules/audit/audit.service");
jest.mock("../../../src/modules/adminNotification/adminNotification.service");
jest.mock("../../../src/utils/cloudinaryDelete");
jest.mock("../../../src/utils/hashPassword");

const db = require("../../../src/config/db");
const adminRepository = require("../../../src/modules/admin/admin.repository");
const notificationService = require("../../../src/modules/notification/notification.service");
const settingsService = require("../../../src/modules/settings/settings.service");
const walletService = require("../../../src/modules/wallet/wallet.service");
const authRepository = require("../../../src/modules/auth/auth.repository");
const accountRepository = require("../../../src/modules/account/account.repository");
const auditService = require("../../../src/modules/audit/audit.service");
const adminNotificationService = require("../../../src/modules/adminNotification/adminNotification.service");
const { deleteManyFromCloudinary } = require("../../../src/utils/cloudinaryDelete");
const hashPassword = require("../../../src/utils/hashPassword");

const adminService = require("../../../src/modules/admin/admin.service");

const connection = db.__mockConnection;

beforeEach(() => {
    notificationService.notify.mockResolvedValue(undefined);
    accountRepository.deleteCartItems.mockResolvedValue(undefined);
    accountRepository.deletePushSubscriptions.mockResolvedValue(undefined);
    accountRepository.deactivateSellerListings.mockResolvedValue(undefined);
    deleteManyFromCloudinary.mockResolvedValue([]);
});

describe("admin.service user/seller/product moderation", () => {
    it("setSellerVerified rejects an unknown seller profile", async () => {
        adminRepository.findSellerProfileByUserId.mockResolvedValue(undefined);
        await expect(adminService.setSellerVerified(1, true)).rejects.toThrow("Seller profile not found");
    });

    it("setSellerVerified interpolates the store name into the notification", async () => {
        adminRepository.findSellerProfileByUserId.mockResolvedValue({ store_name: "Mama's Kitchen" });
        await adminService.setSellerVerified(1, true);

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                messageKey: "notifications.seller.storeVerified.message",
                messageParams: { storeName: "Mama's Kitchen" }
            })
        );
    });

    it("setProductActive rejects an unknown product", async () => {
        adminRepository.findProductById.mockResolvedValue(undefined);
        await expect(adminService.setProductActive(1, false)).rejects.toThrow("Product not found");
    });

    it("setProductActive notifies the owning seller, not a hardcoded user", async () => {
        adminRepository.findProductById.mockResolvedValue({ seller_id: 42, name: "Widget" });
        await adminService.setProductActive(1, false);

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 42,
                titleKey: "notifications.product.removed.title",
                messageParams: { productName: "Widget" }
            })
        );
    });
});

describe("admin.service.getDashboard", () => {
    it("coerces every stat to a number and defaults missing ones to 0", async () => {
        adminRepository.getDashboardStats.mockResolvedValue({
            userCounts: { buyers: "10", sellers: "3", delivery_agents: undefined },
            orderCounts: { total_orders: "50", pending_orders: "5", delivered_orders: "40", cancelled_orders: "5" },
            revenue: { total_revenue: "1500000.50" },
            productCounts: { total_products: "20", active_products: "18" }
        });

        const result = await adminService.getDashboard();

        expect(result).toEqual({
            users: { buyers: 10, sellers: 3, delivery_agents: 0 },
            orders: { total: 50, pending: 5, delivered: 40, cancelled: 5 },
            revenue: 1500000.5,
            products: { total: 20, active: 18 }
        });
    });
});

describe("admin.service.getAnalytics", () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-07-19T12:00:00Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("fills in zero-sales days so the 14-day chart has no gaps", async () => {
        adminRepository.getDailySales.mockResolvedValue([]); // no orders at all
        adminRepository.getTopProducts.mockResolvedValue([]);
        adminRepository.getTopSellers.mockResolvedValue([]);

        const result = await adminService.getAnalytics();

        expect(result.dailySales).toHaveLength(14);
        expect(result.dailySales.every((d) => d.revenue === 0 && d.order_count === 0)).toBe(true);
        expect(result.dailySales[13].day).toBe("2026-07-19"); // most recent day is last
    });

    it("projects a 7-day flat forecast at the historical average when revenue is flat", async () => {
        const flatRows = Array.from({ length: 30 }, (_, i) => {
            const d = new Date("2026-07-19T12:00:00Z");
            d.setDate(d.getDate() - i);
            return { day: d.toISOString().slice(0, 10), revenue: "1000.00", order_count: "2" };
        });
        adminRepository.getDailySales.mockResolvedValue(flatRows);
        adminRepository.getTopProducts.mockResolvedValue([]);
        adminRepository.getTopSellers.mockResolvedValue([]);

        const result = await adminService.getAnalytics();

        expect(result.forecast).toHaveLength(7);
        expect(result.forecast.every((f) => f.revenue === 1000)).toBe(true);
    });

    it("never projects negative revenue even on a declining trend", async () => {
        const decliningRows = Array.from({ length: 30 }, (_, i) => {
            const d = new Date("2026-07-19T12:00:00Z");
            d.setDate(d.getDate() - i);
            // Revenue trending toward (and past) zero as we approach today
            return { day: d.toISOString().slice(0, 10), revenue: String(i * 5000), order_count: "1" };
        });
        adminRepository.getDailySales.mockResolvedValue(decliningRows);
        adminRepository.getTopProducts.mockResolvedValue([]);
        adminRepository.getTopSellers.mockResolvedValue([]);

        const result = await adminService.getAnalytics();

        expect(result.forecast.every((f) => f.revenue >= 0)).toBe(true);
    });

    it("coerces top product/seller numeric fields", async () => {
        adminRepository.getDailySales.mockResolvedValue([]);
        adminRepository.getTopProducts.mockResolvedValue([{ name: "Widget", units_sold: "5", revenue: "5000" }]);
        adminRepository.getTopSellers.mockResolvedValue([{ store_name: "Shop", revenue: "10000", order_count: "3" }]);

        const result = await adminService.getAnalytics();

        expect(result.topProducts[0]).toEqual({ name: "Widget", units_sold: 5, revenue: 5000 });
        expect(result.topSellers[0]).toEqual({ store_name: "Shop", revenue: 10000, order_count: 3 });
    });
});

describe("admin.service settings & withdrawal passthroughs", () => {
    it("getSettings/updateSettings delegate to settingsService", async () => {
        settingsService.getAll.mockResolvedValue({ commissionRate: 10 });
        await expect(adminService.getSettings()).resolves.toEqual({ commissionRate: 10 });

        await adminService.updateSettings({ commissionRate: 12 });
        expect(settingsService.updateSettings).toHaveBeenCalledWith({ commissionRate: 12 });
    });

    it("withdrawal actions delegate to walletService.processWithdrawal with the right action", async () => {
        await adminService.approveWithdrawal(1, "ok");
        expect(walletService.processWithdrawal).toHaveBeenCalledWith(1, "approve", "ok");

        await adminService.rejectWithdrawal(1, "insufficient docs");
        expect(walletService.processWithdrawal).toHaveBeenCalledWith(1, "reject", "insufficient docs");

        await adminService.markWithdrawalPaid(1, "paid via bank transfer");
        expect(walletService.processWithdrawal).toHaveBeenCalledWith(1, "paid", "paid via bank transfer");
    });

    it("releaseOrderEscrow (Phase 9D) delegates to walletService.releaseOrderEarnings", async () => {
        walletService.releaseOrderEarnings.mockResolvedValue({ released: 1, closedByDispute: 0, frozen: 0, amountReleased: 900 });

        await expect(adminService.releaseOrderEscrow(42)).resolves.toEqual({
            released: 1, closedByDispute: 0, frozen: 0, amountReleased: 900
        });
        expect(walletService.releaseOrderEarnings).toHaveBeenCalledWith(42);
    });
});

describe("admin.service admin management", () => {
    it("addAdmin rejects a duplicate email", async () => {
        authRepository.findByEmail.mockResolvedValue({ id: 1 });
        await expect(adminService.addAdmin({ email: "a@x.com", phone: "1", password: "p" })).rejects.toThrow(
            "Email already exists"
        );
    });

    it("addAdmin rejects a duplicate phone", async () => {
        authRepository.findByEmail.mockResolvedValue(undefined);
        authRepository.findByPhone.mockResolvedValue({ id: 1 });
        await expect(adminService.addAdmin({ email: "a@x.com", phone: "1", password: "p" })).rejects.toThrow(
            "Phone number already exists"
        );
    });

    it("addAdmin hashes the password and defaults an invalid admin_level to 'admin'", async () => {
        authRepository.findByEmail.mockResolvedValue(undefined);
        authRepository.findByPhone.mockResolvedValue(undefined);
        hashPassword.mockResolvedValue("hashed-pw");
        adminRepository.createAdmin.mockResolvedValue(99);

        const result = await adminService.addAdmin({
            first_name: "A", last_name: "B", email: "a@x.com", phone: "1", password: "plain", admin_level: "bogus"
        });

        expect(hashPassword).toHaveBeenCalledWith("plain");
        expect(adminRepository.createAdmin).toHaveBeenCalledWith(
            expect.objectContaining({ password: "hashed-pw", admin_level: "admin" })
        );
        expect(result).toEqual({ userId: 99 });
    });

    it("addAdmin accepts an explicit super_admin level", async () => {
        authRepository.findByEmail.mockResolvedValue(undefined);
        authRepository.findByPhone.mockResolvedValue(undefined);
        hashPassword.mockResolvedValue("hashed-pw");
        adminRepository.createAdmin.mockResolvedValue(99);

        await adminService.addAdmin({
            first_name: "A", last_name: "B", email: "a@x.com", phone: "1", password: "plain", admin_level: "super_admin"
        });

        expect(adminRepository.createAdmin).toHaveBeenCalledWith(
            expect.objectContaining({ admin_level: "super_admin" })
        );
    });

    it("updateAdminPermissions rejects an unknown admin", async () => {
        adminRepository.findAllAdmins.mockResolvedValue([]);
        await expect(adminService.updateAdminPermissions(1, "admin")).rejects.toThrow("Admin not found");
    });

    it("updateAdminPermissions refuses to demote the last super admin", async () => {
        adminRepository.findAllAdmins.mockResolvedValue([{ id: 1, admin_level: "super_admin" }]);
        adminRepository.countSuperAdmins.mockResolvedValue(1);

        await expect(adminService.updateAdminPermissions(1, "admin")).rejects.toThrow(
            "Can't demote the last super admin."
        );
        expect(adminRepository.updateAdminLevel).not.toHaveBeenCalled();
    });

    it("updateAdminPermissions allows demotion when other super admins remain", async () => {
        adminRepository.findAllAdmins.mockResolvedValue([{ id: 1, admin_level: "super_admin" }]);
        adminRepository.countSuperAdmins.mockResolvedValue(2);

        await adminService.updateAdminPermissions(1, "admin");
        expect(adminRepository.updateAdminLevel).toHaveBeenCalledWith(1, "admin");
    });

    it("updateAdminPermissions allows promoting a regular admin without checking super-admin count", async () => {
        adminRepository.findAllAdmins.mockResolvedValue([{ id: 1, admin_level: "admin" }]);

        await adminService.updateAdminPermissions(1, "super_admin");

        expect(adminRepository.countSuperAdmins).not.toHaveBeenCalled();
        expect(adminRepository.updateAdminLevel).toHaveBeenCalledWith(1, "super_admin");
    });

    it("removeAdmin refuses self-removal", async () => {
        await expect(adminService.removeAdmin(5, 5)).rejects.toThrow("You can't remove your own admin access.");
        expect(adminRepository.findAllAdmins).not.toHaveBeenCalled();
    });

    it("removeAdmin rejects an unknown target", async () => {
        adminRepository.findAllAdmins.mockResolvedValue([]);
        await expect(adminService.removeAdmin(1, 5)).rejects.toThrow("Admin not found");
    });

    it("removeAdmin refuses to remove the last super admin", async () => {
        adminRepository.findAllAdmins.mockResolvedValue([{ id: 1, admin_level: "super_admin" }]);
        adminRepository.countSuperAdmins.mockResolvedValue(1);

        await expect(adminService.removeAdmin(1, 5)).rejects.toThrow("Can't remove the last super admin.");
        expect(adminRepository.revokeAdmin).not.toHaveBeenCalled();
    });

    it("removeAdmin succeeds for a regular admin removed by someone else", async () => {
        adminRepository.findAllAdmins.mockResolvedValue([{ id: 1, admin_level: "admin" }]);

        await adminService.removeAdmin(1, 5);
        expect(adminRepository.revokeAdmin).toHaveBeenCalledWith(1);
    });
});

describe("admin.service.getDispatchOverview (Phase 6 dispatch dashboard)", () => {
    it("combines active deliveries and online agents into one summary", async () => {
        adminRepository.findActiveDeliveries.mockResolvedValue([
            { id: 1, order_id: 10, status: "in_transit", is_delayed: 1 },
            { id: 2, order_id: 11, status: "assigned", is_delayed: 0 }
        ]);
        adminRepository.findOnlineAgents.mockResolvedValue([
            { id: 5, first_name: "Amina", active_delivery_count: 1 },
            { id: 6, first_name: "Juma", active_delivery_count: 0 }
        ]);

        const result = await adminService.getDispatchOverview();

        expect(result.deliveries).toHaveLength(2);
        expect(result.deliveries[0].is_delayed).toBe(true);
        expect(result.deliveries[1].is_delayed).toBe(false);
        expect(result.delayed).toEqual([expect.objectContaining({ id: 1, is_delayed: true })]);
        expect(result.agents).toHaveLength(2);
        expect(result.summary).toEqual({
            active_deliveries: 2,
            delayed_deliveries: 1,
            online_agents: 2,
            idle_agents: 1
        });
    });

    it("returns zeroed-out summary counts when nothing is active", async () => {
        adminRepository.findActiveDeliveries.mockResolvedValue([]);
        adminRepository.findOnlineAgents.mockResolvedValue([]);

        const result = await adminService.getDispatchOverview();

        expect(result).toEqual({
            deliveries: [],
            agents: [],
            delayed: [],
            summary: {
                active_deliveries: 0,
                delayed_deliveries: 0,
                online_agents: 0,
                idle_agents: 0
            }
        });
    });
});

describe("admin.service.suspendUser (Admin Account Control - Phase 1)", () => {
    const activeUser = { id: 7, first_name: "Jane", last_name: "Doe", email: "jane@b.com", deleted_at: null };

    it("rejects an unknown user", async () => {
        adminRepository.findUserById.mockResolvedValue(undefined);
        await expect(adminService.suspendUser(7, "fraud", 1)).rejects.toThrow("User not found");
        expect(adminRepository.suspendUser).not.toHaveBeenCalled();
    });

    it("refuses to suspend a self-deleted account", async () => {
        adminRepository.findUserById.mockResolvedValue({ ...activeUser, deleted_at: "2026-01-01" });
        await expect(adminService.suspendUser(7, "fraud", 1)).rejects.toThrow(
            "This account has been deleted and can't be suspended."
        );
        expect(adminRepository.suspendUser).not.toHaveBeenCalled();
    });

    it("refuses to let an admin suspend their own account", async () => {
        adminRepository.findUserById.mockResolvedValue(activeUser);
        await expect(adminService.suspendUser(7, "fraud", 7)).rejects.toThrow(
            "You can't suspend your own account."
        );
    });

    it("requires a non-blank reason", async () => {
        adminRepository.findUserById.mockResolvedValue(activeUser);
        await expect(adminService.suspendUser(7, "   ", 1)).rejects.toThrow("A suspension reason is required.");
        await expect(adminService.suspendUser(7, "", 1)).rejects.toThrow("A suspension reason is required.");
        await expect(adminService.suspendUser(7, undefined, 1)).rejects.toThrow(
            "A suspension reason is required."
        );
        expect(adminRepository.suspendUser).not.toHaveBeenCalled();
    });

    it("suspends the account, trims the reason, notifies the user by email, audit-logs it, and raises an admin notification", async () => {
        adminRepository.findUserById.mockResolvedValue(activeUser);

        await adminService.suspendUser(7, "  repeated chargebacks  ", 1);

        expect(adminRepository.suspendUser).toHaveBeenCalledWith(7, "repeated chargebacks", 1);

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 7,
                type: "account_status",
                titleKey: "notifications.account.suspended.title",
                messageKey: "notifications.account.suspended.message",
                messageParams: { reason: "repeated chargebacks" },
                withEmail: true
            })
        );

        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 1,
                eventType: "account_suspended",
                metadata: { target_user_id: 7, reason: "repeated chargebacks" }
            })
        );

        expect(adminNotificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "account_suspended",
                category: "account",
                severity: "warning",
                relatedUserId: 7,
                message: expect.stringContaining("Jane Doe (jane@b.com)")
            })
        );
    });
});

describe("admin.service.unsuspendUser (Admin Account Control - Phase 1)", () => {
    const suspendedUser = {
        id: 7, first_name: "Jane", last_name: "Doe", email: "jane@b.com", suspended_at: "2026-01-01"
    };

    it("rejects an unknown user", async () => {
        adminRepository.findUserById.mockResolvedValue(undefined);
        await expect(adminService.unsuspendUser(7, 1)).rejects.toThrow("User not found");
    });

    it("rejects a user who isn't currently suspended", async () => {
        adminRepository.findUserById.mockResolvedValue({ ...suspendedUser, suspended_at: null });
        await expect(adminService.unsuspendUser(7, 1)).rejects.toThrow(
            "This account is not currently suspended."
        );
        expect(adminRepository.unsuspendUser).not.toHaveBeenCalled();
    });

    it("unsuspends the account, notifies the user by email, and audit-logs and admin-notifies it", async () => {
        adminRepository.findUserById.mockResolvedValue(suspendedUser);

        await adminService.unsuspendUser(7, 1);

        expect(adminRepository.unsuspendUser).toHaveBeenCalledWith(7);
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 7,
                titleKey: "notifications.account.unsuspended.title",
                messageKey: "notifications.account.unsuspended.message",
                withEmail: true
            })
        );
        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: "account_unsuspended", metadata: { target_user_id: 7 } })
        );
        expect(adminNotificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ type: "account_unsuspended", severity: "info", relatedUserId: 7 })
        );
    });
});

describe("admin.service.permanentlyDeleteUser (Phase 4 - Permanent Account Removal)", () => {
    const targetUser = {
        id: 7, first_name: "Jane", last_name: "Doe", email: "jane@b.com", role: "buyer",
        permanently_deleted_at: null
    };

    beforeEach(() => {
        adminRepository.findAccountVerificationDocumentUrls.mockResolvedValue([]);
        adminRepository.findSellerLogoAndBanner.mockResolvedValue(null);
        adminRepository.findNeverOrderedProductIds.mockResolvedValue([]);
        adminRepository.findProductMediaUrls.mockResolvedValue([]);
        adminRepository.deleteWishlistItems.mockResolvedValue(undefined);
    });

    it("rejects an unknown user", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(undefined);
        await expect(adminService.permanentlyDeleteUser(7, 1)).rejects.toThrow("User not found");
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("refuses to let an admin permanently delete their own account", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(targetUser);
        await expect(adminService.permanentlyDeleteUser(7, 7)).rejects.toThrow(
            "You can't permanently delete your own account."
        );
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("refuses to re-delete an account that's already been permanently deleted", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue({
            ...targetUser, permanently_deleted_at: "2026-01-01"
        });
        await expect(adminService.permanentlyDeleteUser(7, 1)).rejects.toThrow(
            "This account has already been permanently deleted."
        );
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("scrubs the account inside one transaction: verification docs, seller assets, never-ordered products, personal bookkeeping, and PII", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(targetUser);
        adminRepository.findSellerLogoAndBanner.mockResolvedValue({
            store_logo: "https://res.cloudinary.com/x/image/upload/v1/logo.png",
            store_banner: null
        });
        adminRepository.findNeverOrderedProductIds.mockResolvedValue([101, 102]);

        await adminService.permanentlyDeleteUser(7, 1);

        expect(connection.beginTransaction).toHaveBeenCalled();
        expect(adminRepository.deleteAccountVerificationDocuments).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.scrubSellerProfile).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.deleteProducts).toHaveBeenCalledWith([101, 102], connection);
        expect(adminRepository.deleteSellerCollections).toHaveBeenCalledWith(7, connection);
        expect(accountRepository.deleteCartItems).toHaveBeenCalledWith(7, connection);
        expect(accountRepository.deletePushSubscriptions).toHaveBeenCalledWith(7, connection);
        expect(accountRepository.deactivateSellerListings).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.deleteWishlistItems).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.deleteOtpCodes).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.deleteNotifications).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.deleteSellerDeliveryAgentLinks).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.deleteDeliveryOffersForAgent).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.tombstoneSentMessages).toHaveBeenCalledWith(7, connection);
        expect(adminRepository.scrubUserPII).toHaveBeenCalledWith(7, connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    it("skips scrubSellerProfile when the target never had seller assets", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(targetUser);
        adminRepository.findSellerLogoAndBanner.mockResolvedValue(null);

        await adminService.permanentlyDeleteUser(7, 1);

        expect(adminRepository.scrubSellerProfile).not.toHaveBeenCalled();
    });

    it("rolls back and never scrubs PII if a step inside the transaction fails", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(targetUser);
        adminRepository.deleteWishlistItems.mockRejectedValue(new Error("db exploded"));

        await expect(adminService.permanentlyDeleteUser(7, 1)).rejects.toThrow("db exploded");

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
        expect(adminRepository.scrubUserPII).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
        expect(adminNotificationService.notify).not.toHaveBeenCalled();
    });

    it("deletes the gathered Cloudinary assets only after the transaction commits", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(targetUser);
        adminRepository.findAccountVerificationDocumentUrls.mockResolvedValue(["https://cdn/doc.pdf"]);
        deleteManyFromCloudinary.mockResolvedValue([]);

        await adminService.permanentlyDeleteUser(7, 1);

        expect(deleteManyFromCloudinary).toHaveBeenCalledWith(["https://cdn/doc.pdf"]);
        expect(connection.commit).toHaveBeenCalled();
    });

    it("audit-logs the deletion with the counts of products and Cloudinary assets removed", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(targetUser);
        adminRepository.findNeverOrderedProductIds.mockResolvedValue([101]);
        adminRepository.findAccountVerificationDocumentUrls.mockResolvedValue(["https://cdn/doc.pdf"]);
        deleteManyFromCloudinary.mockResolvedValue([]);

        await adminService.permanentlyDeleteUser(7, 1);

        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 1,
                eventType: "account_permanently_deleted",
                metadata: expect.objectContaining({
                    target_user_id: 7,
                    products_deleted: 1,
                    cloudinary_assets_deleted: 1,
                    cloudinary_assets_failed: 0
                })
            })
        );
    });

    it("subtracts failed Cloudinary deletes from the audit log's success count and still commits", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(targetUser);
        adminRepository.findAccountVerificationDocumentUrls.mockResolvedValue(["https://cdn/doc.pdf"]);
        deleteManyFromCloudinary.mockResolvedValue(["https://cdn/doc.pdf"]);

        await adminService.permanentlyDeleteUser(7, 1);

        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({ cloudinary_assets_deleted: 0, cloudinary_assets_failed: 1 })
            })
        );
    });

    it("uses a higher severity and the admin-specific event type when the deleted account had the admin role", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue({ ...targetUser, role: "admin" });

        await adminService.permanentlyDeleteUser(7, 1);

        expect(adminNotificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "admin_account_permanently_deleted",
                severity: "critical",
                relatedUserId: 7
            })
        );
    });

    it("uses the ordinary user event type and a warning severity for a non-admin account", async () => {
        adminRepository.findUserForPermanentDeletion.mockResolvedValue(targetUser);

        await adminService.permanentlyDeleteUser(7, 1);

        expect(adminNotificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ type: "user_account_permanently_deleted", severity: "warning" })
        );
    });
});
