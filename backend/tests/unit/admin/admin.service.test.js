jest.mock("../../../src/modules/admin/admin.repository");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/wallet/wallet.service");
jest.mock("../../../src/modules/auth/auth.repository");
jest.mock("../../../src/utils/hashPassword");

const adminRepository = require("../../../src/modules/admin/admin.repository");
const notificationService = require("../../../src/modules/notification/notification.service");
const settingsService = require("../../../src/modules/settings/settings.service");
const walletService = require("../../../src/modules/wallet/wallet.service");
const authRepository = require("../../../src/modules/auth/auth.repository");
const hashPassword = require("../../../src/utils/hashPassword");

const adminService = require("../../../src/modules/admin/admin.service");

beforeEach(() => {
    notificationService.notify.mockResolvedValue(undefined);
});

describe("admin.service user/seller/product moderation", () => {
    it("setUserActive rejects an unknown user", async () => {
        adminRepository.findUserById.mockResolvedValue(undefined);
        await expect(adminService.setUserActive(1, false)).rejects.toThrow("User not found");
    });

    it("setUserActive deactivates and notifies with the deactivated keys", async () => {
        adminRepository.findUserById.mockResolvedValue({ id: 1 });
        await adminService.setUserActive(1, false);

        expect(adminRepository.setUserActive).toHaveBeenCalledWith(1, false);
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                titleKey: "notifications.account.deactivated.title",
                messageKey: "notifications.account.deactivated.message"
            })
        );
    });

    it("setUserActive reactivates and notifies with the reactivated keys", async () => {
        adminRepository.findUserById.mockResolvedValue({ id: 1 });
        await adminService.setUserActive(1, true);

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                titleKey: "notifications.account.reactivated.title",
                messageKey: "notifications.account.reactivated.message"
            })
        );
    });

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
