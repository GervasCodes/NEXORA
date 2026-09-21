jest.mock("../../../src/config/db", () => ({ getConnection: jest.fn() }));
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/utils/cloudinaryUpload", () => ({ uploadToCloudinary: jest.fn() }));
jest.mock("../../../src/modules/notification/notification.service", () => ({
    notify: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../../../src/modules/seller/seller.service", () => ({
    syncBadgeForSeller: jest.fn().mockResolvedValue(true)
}));
jest.mock("../../../src/modules/accountVerification/accountVerification.repository");

const db = require("../../../src/config/db");
const notificationService = require("../../../src/modules/notification/notification.service");
const sellerService = require("../../../src/modules/seller/seller.service");
const { uploadToCloudinary } = require("../../../src/utils/cloudinaryUpload");
const repo = require("../../../src/modules/accountVerification/accountVerification.repository");
const service = require("../../../src/modules/accountVerification/accountVerification.service");

const pdf = () => ({ mimetype: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
const jpeg = () => ({ mimetype: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) });
const allPdfs = () => ({
    brela_certificate: [pdf()],
    tin_certificate: [pdf()],
    business_license: [pdf()]
});

const idVerifiedSeller = {
    id: 7, role: "seller", account_verification_status: "approved", verification_tier: "id_verified"
};

let connection;

beforeEach(() => {
    jest.resetAllMocks();
    connection = {
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn()
    };
    db.getConnection.mockResolvedValue(connection);
    // resetAllMocks wipes the factory defaults; the service chains .catch()
    // on both of these, so they must keep returning promises.
    notificationService.notify.mockResolvedValue(undefined);
    sellerService.syncBadgeForSeller.mockResolvedValue(true);
    uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn.example/doc.pdf" });
    repo.findUserById.mockResolvedValue(idVerifiedSeller);
    repo.findLatestBusinessRequestByUser.mockResolvedValue(null);
    repo.findPendingBusinessRequestByUser.mockResolvedValue(undefined);
    repo.insertBusinessRequest.mockResolvedValue(55);
    repo.setBusinessRequestStatus.mockResolvedValue(1);
    repo.findDocumentsByBusinessRequest.mockResolvedValue([]);
});

describe("submitBusinessRequest", () => {
    it("creates one pending request with all three PDF documents and a history entry, in one transaction", async () => {
        await service.submitBusinessRequest(7, allPdfs());

        expect(uploadToCloudinary).toHaveBeenCalledTimes(3);
        expect(connection.beginTransaction).toHaveBeenCalled();
        expect(repo.insertBusinessRequest).toHaveBeenCalledWith(7, connection);
        expect(repo.insertBusinessDocument).toHaveBeenCalledTimes(3);
        expect(repo.insertBusinessDocument).toHaveBeenCalledWith(7, 55, "brela_certificate", "https://cdn.example/doc.pdf", connection);
        expect(repo.insertHistory).toHaveBeenCalledWith(7, "business_submitted", null, null, connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    it.each(["brela_certificate", "tin_certificate", "business_license"])(
        "rejects an image uploaded as %s without uploading or writing anything",
        async (field) => {
            const files = { ...allPdfs(), [field]: [jpeg()] };

            await expect(service.submitBusinessRequest(7, files)).rejects.toThrow(/PDF/);

            expect(uploadToCloudinary).not.toHaveBeenCalled();
            expect(db.getConnection).not.toHaveBeenCalled();
        }
    );

    it("rejects a file that claims application/pdf but whose bytes are an image", async () => {
        const files = { ...allPdfs(), tin_certificate: [{ mimetype: "application/pdf", buffer: jpeg().buffer }] };

        await expect(service.submitBusinessRequest(7, files)).rejects.toThrow(/PDF/);
        expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it("requires all three documents", async () => {
        const files = allPdfs();
        delete files.business_license;

        await expect(service.submitBusinessRequest(7, files)).rejects.toThrow(/business license/);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("only lets an id_verified seller apply", async () => {
        repo.findUserById.mockResolvedValue({ ...idVerifiedSeller, verification_tier: "none" });
        await expect(service.submitBusinessRequest(7, allPdfs())).rejects.toThrow(/ID verification/);

        repo.findUserById.mockResolvedValue({ ...idVerifiedSeller, verification_tier: "business_verified" });
        await expect(service.submitBusinessRequest(7, allPdfs())).rejects.toThrow(/already verified/);

        repo.findUserById.mockResolvedValue({ ...idVerifiedSeller, role: "delivery_agent" });
        await expect(service.submitBusinessRequest(7, allPdfs())).rejects.toThrow(/Only sellers/);

        expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it("enforces a single pending request and rolls back", async () => {
        repo.findPendingBusinessRequestByUser.mockResolvedValue({ id: 40, status: "pending" });

        await expect(service.submitBusinessRequest(7, allPdfs())).rejects.toThrow(/already have/);

        expect(repo.lockUser).toHaveBeenCalledWith(7, connection);
        expect(repo.insertBusinessRequest).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    it("writes nothing if a Cloudinary upload fails", async () => {
        uploadToCloudinary.mockRejectedValueOnce(new Error("cloudinary down"));

        await expect(service.submitBusinessRequest(7, allPdfs())).rejects.toThrow(/couldn't upload/);
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

describe("approveBusinessRequest", () => {
    const pending = { id: 55, user_id: 7, status: "pending" };

    it("moves the seller to business_verified, turns on the badge, and logs history - atomically", async () => {
        repo.findBusinessRequestById.mockResolvedValue(pending);

        await service.approveBusinessRequest(55, 1);

        expect(repo.setBusinessRequestStatus).toHaveBeenCalledWith(55, "approved", { actorAdminId: 1 }, connection);
        expect(repo.setVerificationTier).toHaveBeenCalledWith(7, "business_verified", connection);
        expect(repo.setBusinessBadge).toHaveBeenCalledWith(7, true, connection);
        expect(repo.insertHistory).toHaveBeenCalledWith(7, "business_approved", null, 1, connection);
        expect(connection.commit).toHaveBeenCalled();
    });

    it("refuses a request that isn't pending", async () => {
        repo.findBusinessRequestById.mockResolvedValue({ ...pending, status: "approved" });

        await expect(service.approveBusinessRequest(55, 1)).rejects.toThrow(/not pending/);
        expect(repo.setVerificationTier).not.toHaveBeenCalled();
    });

    it("rolls back without changing the tier if another admin reviewed it first", async () => {
        repo.findBusinessRequestById.mockResolvedValue(pending);
        repo.setBusinessRequestStatus.mockResolvedValue(0);

        await expect(service.approveBusinessRequest(55, 1)).rejects.toThrow(/already been reviewed/);

        expect(repo.setVerificationTier).not.toHaveBeenCalled();
        expect(repo.setBusinessBadge).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
    });
});

describe("rejectBusinessRequest", () => {
    const pending = { id: 55, user_id: 7, status: "pending" };

    it("requires a reason", async () => {
        await expect(service.rejectBusinessRequest(55, "   ", 1)).rejects.toThrow(/reason is required/);
        expect(repo.findBusinessRequestById).not.toHaveBeenCalled();
    });

    it("records the rejection without touching the seller's tier or badge", async () => {
        repo.findBusinessRequestById.mockResolvedValue(pending);

        await service.rejectBusinessRequest(55, "TIN certificate is expired", 1);

        expect(repo.setBusinessRequestStatus).toHaveBeenCalledWith(
            55, "rejected", { reason: "TIN certificate is expired", actorAdminId: 1 }, connection
        );
        expect(repo.insertHistory).toHaveBeenCalledWith(7, "business_rejected", "TIN certificate is expired", 1, connection);
        expect(repo.setVerificationTier).not.toHaveBeenCalled();
        expect(repo.setBusinessBadge).not.toHaveBeenCalled();
        expect(connection.commit).toHaveBeenCalled();
    });

    it("refuses a request that isn't pending", async () => {
        repo.findBusinessRequestById.mockResolvedValue({ ...pending, status: "rejected" });

        await expect(service.rejectBusinessRequest(55, "x", 1)).rejects.toThrow(/not pending/);
    });
});

describe("getBusinessStatus", () => {
    it("lets an id_verified seller with no pending request apply", async () => {
        const status = await service.getBusinessStatus(7);
        expect(status.can_apply).toBe(true);
        expect(status.verification_tier).toBe("id_verified");
    });

    it("blocks applying while a request is pending, and exposes a rejection reason after a rejection", async () => {
        repo.findLatestBusinessRequestByUser.mockResolvedValue({ id: 1, status: "pending" });
        expect((await service.getBusinessStatus(7)).can_apply).toBe(false);

        repo.findLatestBusinessRequestByUser.mockResolvedValue({ id: 1, status: "rejected", rejection_reason: "Blurry" });
        const status = await service.getBusinessStatus(7);
        expect(status.can_apply).toBe(true);
        expect(status.latest_request.rejection_reason).toBe("Blurry");
    });
});

describe("base approval -> id_verified tier", () => {
    it("promotes a seller to id_verified when their account verification is approved", async () => {
        repo.findUserById.mockResolvedValue({ id: 7, role: "seller", account_verification_status: "pending" });
        repo.findDocumentsByUser.mockResolvedValue([]);
        repo.findHistoryByUser.mockResolvedValue([]);

        await service.approve(7, 1);

        expect(repo.promoteToIdVerified).toHaveBeenCalledWith(7);
    });

    it("does not touch the tier for a delivery agent", async () => {
        repo.findUserById.mockResolvedValue({ id: 9, role: "delivery_agent", account_verification_status: "pending" });
        repo.findDocumentsByUser.mockResolvedValue([]);
        repo.findHistoryByUser.mockResolvedValue([]);

        await service.approve(9, 1);

        expect(repo.promoteToIdVerified).not.toHaveBeenCalled();
    });
});
