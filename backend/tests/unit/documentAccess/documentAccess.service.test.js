jest.mock("../../../src/modules/documentAccess/documentAccess.repository", () => ({
    KINDS: ["verification", "kyc"],
    findDocument: jest.fn()
}));
jest.mock("../../../src/modules/audit/audit.repository", () => ({ insertLog: jest.fn() }));
jest.mock("../../../src/utils/privateDocuments", () => ({ getSignedDocumentUrl: jest.fn() }));

const repository = require("../../../src/modules/documentAccess/documentAccess.repository");
const auditRepository = require("../../../src/modules/audit/audit.repository");
const { getSignedDocumentUrl } = require("../../../src/utils/privateDocuments");
const service = require("../../../src/modules/documentAccess/documentAccess.service");

const doc = { id: 5, user_id: 9, file_storage: "authenticated", file_public_id: "p", file_purged_at: null };

describe("documentAccess.service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        auditRepository.insertLog.mockResolvedValue();
        getSignedDocumentUrl.mockReturnValue({ url: "https://signed.example", expiresAt: "2030-01-01T00:00:00.000Z" });
    });

    it("returns a signed URL and records who opened which document", async () => {
        repository.findDocument.mockResolvedValue(doc);
        const result = await service.getDocumentUrl("verification", 5, { adminId: 1, req: { ip: "1.2.3.4" } });
        expect(result.url).toBe("https://signed.example");
        expect(auditRepository.insertLog).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 1, eventType: "document_viewed", ipAddress: "1.2.3.4" })
        );
    });

    it("withholds the URL when the audit entry cannot be written", async () => {
        repository.findDocument.mockResolvedValue(doc);
        auditRepository.insertLog.mockRejectedValue(new Error("db down"));
        await expect(service.getDocumentUrl("kyc", 5, { adminId: 1 })).rejects.toMatchObject({ status: 500 });
    });

    it("answers 410 for a purged document and 404 for an unknown one", async () => {
        repository.findDocument.mockResolvedValueOnce({ ...doc, file_purged_at: new Date() });
        await expect(service.getDocumentUrl("kyc", 5, { adminId: 1 })).rejects.toMatchObject({ status: 410 });
        repository.findDocument.mockResolvedValueOnce(null);
        await expect(service.getDocumentUrl("kyc", 6, { adminId: 1 })).rejects.toMatchObject({ status: 404 });
        expect(auditRepository.insertLog).not.toHaveBeenCalled();
    });

    it("rejects an unknown document kind", async () => {
        await expect(service.getDocumentUrl("passport", 5, { adminId: 1 })).rejects.toMatchObject({ status: 400 });
    });
});
