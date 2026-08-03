jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/status/status.repository");

const db = require("../../../src/config/db");
const statusRepository = require("../../../src/modules/status/status.repository");

const statusService = require("../../../src/modules/status/status.service");

describe("status.service.getLiveHealth", () => {
    it("reports ok/connected when the DB ping succeeds", async () => {
        db.query.mockResolvedValueOnce([[{ 1: 1 }]]);

        const health = await statusService.getLiveHealth();

        expect(health.status).toBe("ok");
        expect(health.database).toBe("connected");
        expect(health.timestamp).toEqual(expect.any(String));
    });

    it("reports degraded/disconnected when the DB ping throws, without leaking the error", async () => {
        db.query.mockRejectedValueOnce(new Error("connection refused"));

        const health = await statusService.getLiveHealth();

        expect(health).toMatchObject({ status: "degraded", database: "disconnected" });
    });
});

describe("status.service.getPublicStatus", () => {
    it("combines live health, ongoing incidents, and recent history for the public status page", async () => {
        db.query.mockResolvedValueOnce([[{ 1: 1 }]]);
        statusRepository.listOngoing.mockResolvedValue([{ id: 1, status: "investigating" }]);
        statusRepository.listRecent.mockResolvedValue([{ id: 1 }, { id: 2 }]);

        const result = await statusService.getPublicStatus();

        expect(statusRepository.listRecent).toHaveBeenCalledWith(20);
        expect(result.health.status).toBe("ok");
        expect(result.ongoing).toHaveLength(1);
        expect(result.recentIncidents).toHaveLength(2);
    });
});

describe("status.service.createIncident", () => {
    it("delegates straight to the repository with the creating admin's id", async () => {
        statusRepository.create.mockResolvedValue(9);

        const id = await statusService.createIncident({ title: "Payments delayed" }, 5);

        expect(statusRepository.create).toHaveBeenCalledWith({ title: "Payments delayed" }, 5);
        expect(id).toBe(9);
    });
});

describe("status.service.updateIncident", () => {
    it("throws when the incident doesn't exist", async () => {
        statusRepository.findById.mockResolvedValue(null);

        await expect(statusService.updateIncident(999, { status: "resolved" })).rejects.toThrow(
            "Incident not found"
        );
        expect(statusRepository.update).not.toHaveBeenCalled();
    });

    it("updates an existing incident", async () => {
        statusRepository.findById.mockResolvedValue({ id: 1, status: "investigating" });

        await statusService.updateIncident(1, { status: "resolved" });

        expect(statusRepository.update).toHaveBeenCalledWith(1, { status: "resolved" });
    });
});
