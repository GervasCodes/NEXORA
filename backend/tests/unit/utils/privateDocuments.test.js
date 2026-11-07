jest.mock("../../../src/config/cloudinary", () => ({
    uploader: { upload_stream: jest.fn(), destroy: jest.fn() },
    utils: { private_download_url: jest.fn(() => "https://signed.example/download") }
}));

const cloudinary = require("../../../src/config/cloudinary");
const { getSignedDocumentUrl, toClientDocument } = require("../../../src/utils/privateDocuments");

const privateDoc = {
    id: 1,
    user_id: 9,
    document_type: "national_id",
    file_url: null,
    file_public_id: "verification/national_id/abc",
    file_resource_type: "image",
    file_format: "jpg",
    file_storage: "authenticated",
    file_purged_at: null
};

describe("privateDocuments", () => {
    beforeEach(() => jest.clearAllMocks());

    it("signs a short-lived URL for an authenticated document", () => {
        const result = getSignedDocumentUrl(privateDoc);
        expect(result.url).toBe("https://signed.example/download");
        const options = cloudinary.utils.private_download_url.mock.calls[0][2];
        expect(options.type).toBe("authenticated");
        const secondsLeft = options.expires_at - Math.floor(Date.now() / 1000);
        expect(secondsLeft).toBeGreaterThan(0);
        expect(secondsLeft).toBeLessThanOrEqual(600);
    });

    it("never signs for legacy public rows or purged files", () => {
        expect(getSignedDocumentUrl({ ...privateDoc, file_storage: "public" })).toBeNull();
        expect(getSignedDocumentUrl({ ...privateDoc, file_purged_at: new Date() })).toBeNull();
        expect(getSignedDocumentUrl({ ...privateDoc, file_public_id: null })).toBeNull();
    });

    it("caps the lifetime even when a longer one is requested", () => {
        getSignedDocumentUrl(privateDoc, { ttl: 99999 });
        const options = cloudinary.utils.private_download_url.mock.calls[0][2];
        expect(options.expires_at - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(600);
    });

    it("strips every storage column from what a client receives", () => {
        const client = toClientDocument({ ...privateDoc, file_url: "https://public.example/x.jpg" });
        expect(client).not.toHaveProperty("file_url");
        expect(client).not.toHaveProperty("file_public_id");
        expect(client).not.toHaveProperty("file_storage");
        expect(client.has_file).toBe(true);
        expect(client.purged).toBe(false);
    });

    it("reports a purged document as having no file", () => {
        const client = toClientDocument({ ...privateDoc, file_purged_at: new Date() });
        expect(client.has_file).toBe(false);
        expect(client.purged).toBe(true);
    });
});
