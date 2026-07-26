jest.mock("../../../src/modules/audit/audit.repository");

const auditRepository = require("../../../src/modules/audit/audit.repository");
const auditService = require("../../../src/modules/audit/audit.service");

describe("audit.service.log", () => {
    it("forwards the event straight to the repository", () => {
        auditRepository.insertLog.mockResolvedValue(undefined);

        auditService.log({
            userId: 1,
            eventType: "account_suspended",
            description: "Admin suspended account #1",
            ipAddress: "1.2.3.4",
            metadata: { target_user_id: 1 }
        });

        expect(auditRepository.insertLog).toHaveBeenCalledWith({
            userId: 1,
            eventType: "account_suspended",
            description: "Admin suspended account #1",
            ipAddress: "1.2.3.4",
            metadata: { target_user_id: 1 }
        });
    });

    it("is fire-and-forget: it doesn't return a promise, and never throws even if the insert rejects", async () => {
        auditRepository.insertLog.mockRejectedValue(new Error("db exploded"));
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        const result = auditService.log({ eventType: "account_suspended" });
        expect(result).toBeUndefined();

        // Let the swallowed rejection's microtask run before asserting on it.
        await new Promise((resolve) => setImmediate(resolve));

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining("account_suspended"),
            "db exploded"
        );
        consoleSpy.mockRestore();
    });
});

describe("audit.service.logFromRequest", () => {
    it("pulls userId and ipAddress from the request when not given explicitly", () => {
        auditRepository.insertLog.mockResolvedValue(undefined);

        const req = { user: { id: 42 }, ip: "10.0.0.1" };
        auditService.logFromRequest(req, {
            eventType: "login_success",
            description: "User logged in",
            metadata: { via: "password" }
        });

        expect(auditRepository.insertLog).toHaveBeenCalledWith({
            userId: 42,
            eventType: "login_success",
            description: "User logged in",
            ipAddress: "10.0.0.1",
            metadata: { via: "password" }
        });
    });

    it("prefers an explicitly-passed userId over req.user.id (e.g. logging an action against a target user)", () => {
        auditRepository.insertLog.mockResolvedValue(undefined);

        const req = { user: { id: 42 }, ip: "10.0.0.1" };
        auditService.logFromRequest(req, {
            userId: 7,
            eventType: "account_suspended",
            description: "Admin suspended account #7"
        });

        expect(auditRepository.insertLog).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 7, ipAddress: "10.0.0.1" })
        );
    });

    it("passes userId as undefined when there's no req.user and no explicit override (e.g. a failed login)", () => {
        auditRepository.insertLog.mockResolvedValue(undefined);

        const req = { ip: "10.0.0.1" };
        auditService.logFromRequest(req, { eventType: "login_failed", description: "Bad password" });

        expect(auditRepository.insertLog).toHaveBeenCalledWith(
            expect.objectContaining({ userId: undefined })
        );
    });
});
