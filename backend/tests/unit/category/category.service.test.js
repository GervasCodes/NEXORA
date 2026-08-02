jest.mock("../../../src/modules/category/category.repository");
jest.mock("../../../src/utils/cloudinaryUpload");
jest.mock("../../../src/socket/socket");

const categoryRepository = require("../../../src/modules/category/category.repository");
const socket = require("../../../src/socket/socket");

const categoryService = require("../../../src/modules/category/category.service");

const CATEGORY = { id: 10, name: "Electronics", slug: "electronics" };

beforeEach(() => {
    jest.clearAllMocks();
    categoryRepository.findById.mockResolvedValue(CATEGORY);
});

describe("category.service.setCategoryActive", () => {
    it("broadcasts an 'entered' maintenance event when deactivating", async () => {
        await categoryService.setCategoryActive(10, false, "Back soon");

        expect(categoryRepository.setActive).toHaveBeenCalledWith(10, false, "Back soon");
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
