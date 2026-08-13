jest.mock("../../../src/modules/category/category.repository");
jest.mock("../../../src/utils/cloudinaryUpload");
jest.mock("../../../src/socket/socket");
// Phase RF5: getOrSet is mocked to call straight through to fetchFn -
// this file's existing tests exercise the underlying repository calls,
// not the caching layer itself (that's cache.test.js's job). bumpVersion
// is asserted directly wherever a write path should invalidate.
jest.mock("../../../src/utils/cache", () => ({
    getOrSet: jest.fn((namespace, key, fetchFn) => fetchFn()),
    bumpVersion: jest.fn().mockResolvedValue(undefined)
}));

const categoryRepository = require("../../../src/modules/category/category.repository");
const socket = require("../../../src/socket/socket");
const cache = require("../../../src/utils/cache");

const categoryService = require("../../../src/modules/category/category.service");

const CATEGORY = { id: 10, name: "Electronics", slug: "electronics" };

beforeEach(() => {
    jest.clearAllMocks();
    categoryRepository.findById.mockResolvedValue(CATEGORY);
});

describe("category.service Phase RF5 caching", () => {
    it("listPublic reads through the categories cache namespace", async () => {
        categoryRepository.findAllActive.mockResolvedValue(["a", "b"]);

        const result = await categoryService.listPublic();

        expect(result).toEqual(["a", "b"]);
        expect(cache.getOrSet).toHaveBeenCalledWith("categories", "listPublic", expect.any(Function));
    });

    it("listDepartments reads through the categories cache namespace", async () => {
        categoryRepository.findAllActiveWithSponsorship.mockResolvedValue([]);

        await categoryService.listDepartments();

        expect(cache.getOrSet).toHaveBeenCalledWith("categories", "listDepartments", expect.any(Function));
    });

    it("getDepartmentBySlug caches the resolved department but never a maintenance/missing result", async () => {
        categoryRepository.findBySlug.mockResolvedValue({ id: 10, slug: "electronics", status: "active" });
        categoryRepository.countProductsByCategory.mockResolvedValue(3);
        categoryRepository.findTrendingByCategory.mockResolvedValue([]);
        categoryRepository.findRecentByCategory.mockResolvedValue([]);
        categoryRepository.countRecentByCategory.mockResolvedValue(0);
        categoryRepository.findPromotionsByCategory.mockResolvedValue([]);
        categoryRepository.findSponsoredByCategory.mockResolvedValue([]);
        categoryRepository.findFeaturedStoresByCategory.mockResolvedValue([]);

        await categoryService.getDepartmentBySlug("electronics");

        expect(cache.getOrSet).toHaveBeenCalledWith(
            "categories",
            { fn: "getDepartmentBySlug", slug: "electronics" },
            expect.any(Function)
        );
    });

    it("getDepartmentBySlug never touches the cache for a missing department", async () => {
        categoryRepository.findBySlug.mockResolvedValue(undefined);

        const result = await categoryService.getDepartmentBySlug("ghost");

        expect(result).toBeNull();
        expect(cache.getOrSet).not.toHaveBeenCalled();
    });

    it("getDepartmentBySlug never touches the cache for a department in maintenance", async () => {
        categoryRepository.findBySlug.mockResolvedValue({
            id: 10,
            slug: "electronics",
            status: "maintenance",
            name: "Electronics"
        });

        await expect(categoryService.getDepartmentBySlug("electronics")).rejects.toThrow();
        expect(cache.getOrSet).not.toHaveBeenCalled();
    });

    it("createCategory bumps the categories cache namespace", async () => {
        categoryRepository.findBySlug.mockResolvedValue(undefined);
        categoryRepository.create.mockResolvedValue(99);

        await categoryService.createCategory("New Dept", "desc", 1);

        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });

    it("updateCategory bumps the categories cache namespace", async () => {
        categoryRepository.findBySlug.mockResolvedValue(undefined);

        await categoryService.updateCategory(10, "Electronics", "desc", 1);

        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });

    it("uploadCoverImage bumps the categories cache namespace", async () => {
        const { uploadToCloudinary } = require("../../../src/utils/cloudinaryUpload");
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn/cover.jpg" });

        await categoryService.uploadCoverImage(10, { buffer: Buffer.from("x") });

        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });

    it("deactivateDepartment bumps the categories cache namespace", async () => {
        await categoryService.deactivateDepartment(10);

        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });

    it("scheduleMaintenance and cancelScheduledMaintenance both bump the categories cache namespace", async () => {
        categoryRepository.scheduleMaintenance.mockResolvedValue(false);
        await categoryService.scheduleMaintenance(10, "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z", "msg");
        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");

        cache.bumpVersion.mockClear();
        await categoryService.cancelScheduledMaintenance(10);
        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });

    it("applyDueMaintenanceSchedules bumps once for a non-empty batch and not at all for an empty one", async () => {
        categoryRepository.findDueToEnterMaintenance.mockResolvedValue([{ id: 1, name: "Fashion", slug: "fashion" }]);
        categoryRepository.findDueToExitMaintenance.mockResolvedValue([]);

        await categoryService.applyDueMaintenanceSchedules();
        expect(cache.bumpVersion).toHaveBeenCalledTimes(1);

        cache.bumpVersion.mockClear();
        categoryRepository.findDueToEnterMaintenance.mockResolvedValue([]);
        await categoryService.applyDueMaintenanceSchedules();
        expect(cache.bumpVersion).not.toHaveBeenCalled();
    });
});

describe("category.service.setCategoryActive", () => {
    it("broadcasts an 'entered' maintenance event when deactivating", async () => {
        await categoryService.setCategoryActive(10, false, "Back soon");

        expect(categoryRepository.setActive).toHaveBeenCalledWith(10, false, "Back soon");
        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
        expect(socket.emitToAll).toHaveBeenCalledWith("department:maintenance", {
            categoryId: 10,
            slug: "electronics",
            name: "Electronics",
            status: "entered",
            message: "Back soon"
        });
    });

    it("broadcasts an 'exited' maintenance event when reactivating", async () => {
        await categoryService.setCategoryActive(10, true);

        expect(socket.emitToAll).toHaveBeenCalledWith(
            "department:maintenance",
            expect.objectContaining({ status: "exited", message: null })
        );
    });

    it("rejects an unknown category", async () => {
        categoryRepository.findById.mockResolvedValue(undefined);

        await expect(categoryService.setCategoryActive(999, false)).rejects.toThrow("Category not found");
        expect(socket.emitToAll).not.toHaveBeenCalled();
    });
});

describe("category.service.scheduleMaintenance", () => {
    it("rejects an end time at or before the start time", async () => {
        await expect(
            categoryService.scheduleMaintenance(10, "2026-08-10T10:00:00Z", "2026-08-10T09:00:00Z", "msg")
        ).rejects.toThrow("End time must be after start time");

        expect(categoryRepository.scheduleMaintenance).not.toHaveBeenCalled();
    });

    it("stores a future window without broadcasting immediately", async () => {
        categoryRepository.scheduleMaintenance.mockResolvedValue(false);

        const result = await categoryService.scheduleMaintenance(
            10,
            "2099-01-01T00:00:00Z",
            "2099-01-02T00:00:00Z",
            "Upgrading"
        );

        expect(result).toEqual({ startedNow: false });
        expect(socket.emitToAll).not.toHaveBeenCalled();
    });

    it("broadcasts immediately when the window starts now (no start_at given)", async () => {
        categoryRepository.scheduleMaintenance.mockResolvedValue(true);

        const result = await categoryService.scheduleMaintenance(10, null, "2099-01-02T00:00:00Z", "Upgrading");

        expect(result).toEqual({ startedNow: true });
        expect(socket.emitToAll).toHaveBeenCalledWith(
            "department:maintenance",
            expect.objectContaining({ status: "entered", message: "Upgrading" })
        );
    });
});

describe("category.service.cancelScheduledMaintenance", () => {
    it("clears the schedule columns", async () => {
        await categoryService.cancelScheduledMaintenance(10);
        expect(categoryRepository.cancelScheduledMaintenance).toHaveBeenCalledWith(10);
    });

    it("rejects an unknown category", async () => {
        categoryRepository.findById.mockResolvedValue(undefined);
        await expect(categoryService.cancelScheduledMaintenance(999)).rejects.toThrow("Category not found");
    });
});

describe("category.service.applyDueMaintenanceSchedules", () => {
    it("applies every due entry and exit, broadcasting each one", async () => {
        categoryRepository.findDueToEnterMaintenance.mockResolvedValue([
            { id: 1, name: "Fashion", slug: "fashion", maintenance_message: "Auto window" }
        ]);
        categoryRepository.findDueToExitMaintenance.mockResolvedValue([
            { id: 2, name: "Home", slug: "home" }
        ]);

        const count = await categoryService.applyDueMaintenanceSchedules();

        expect(count).toBe(2);
        expect(categoryRepository.applyScheduledEntry).toHaveBeenCalledWith(1);
        expect(categoryRepository.applyScheduledExit).toHaveBeenCalledWith(2);

        expect(socket.emitToAll).toHaveBeenCalledWith(
            "department:maintenance",
            expect.objectContaining({ categoryId: 1, status: "entered", message: "Auto window" })
        );
        expect(socket.emitToAll).toHaveBeenCalledWith(
            "department:maintenance",
            expect.objectContaining({ categoryId: 2, status: "exited", message: null })
        );
    });

    it("returns 0 and broadcasts nothing when no transitions are due", async () => {
        categoryRepository.findDueToEnterMaintenance.mockResolvedValue([]);
        categoryRepository.findDueToExitMaintenance.mockResolvedValue([]);

        const count = await categoryService.applyDueMaintenanceSchedules();

        expect(count).toBe(0);
        expect(socket.emitToAll).not.toHaveBeenCalled();
    });
});
