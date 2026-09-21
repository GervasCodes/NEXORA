// KYC documents (national/voter ID, BRELA, TIN, business license) are
// PDF-only. Two independent layers enforce it - multer's fileFilter
// (declared mimetype + extension) and validateFileContent (real bytes) -
// and both are covered here.

jest.mock("multer", () => {
    const multer = jest.fn(() => ({
        single: jest.fn(),
        array: jest.fn(),
        fields: jest.fn()
    }));
    multer.memoryStorage = jest.fn();
    return multer;
});

const multer = require("multer");
require("../../../src/middleware/uploadDocument.middleware");
const { validateFileContent } = require("../../../src/middleware/fileContentValidation.middleware");
const { PDF_ONLY_FIELDS } = require("../../../src/utils/kycDocumentRules");

const { fileFilter } = multer.mock.calls[0][0];

const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // zip-based office container

const runFilter = (file) => {
    const cb = jest.fn();
    fileFilter({}, file, cb);
    return cb;
};

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe("uploadDocument fileFilter - KYC document fields", () => {
    it("covers exactly the four document types plus the ID alternative", () => {
        expect([...PDF_ONLY_FIELDS].sort()).toEqual(
            ["brela_certificate", "business_license", "national_id", "tin_certificate", "voter_id"]
        );
    });

    it.each(PDF_ONLY_FIELDS)("accepts a PDF on %s", (fieldname) => {
        const cb = runFilter({ fieldname, mimetype: "application/pdf", originalname: "doc.pdf" });
        expect(cb).toHaveBeenCalledWith(null, true);
    });

    it.each(PDF_ONLY_FIELDS)("rejects an image mimetype on %s", (fieldname) => {
        const cb = runFilter({ fieldname, mimetype: "image/jpeg", originalname: "doc.jpg" });
        expect(cb).toHaveBeenCalledWith(expect.any(Error));
    });

    it("rejects a PDF-mimetype upload whose filename is an image extension", () => {
        const cb = runFilter({ fieldname: "brela_certificate", mimetype: "application/pdf", originalname: "scan.PNG" });
        expect(cb).toHaveBeenCalledWith(expect.any(Error));
    });

    it("leaves non-KYC fields on their existing image-or-PDF rule", () => {
        expect(runFilter({ fieldname: "owner_photo", mimetype: "image/jpeg", originalname: "me.jpg" }))
            .toHaveBeenCalledWith(null, true);
        expect(runFilter({ fieldname: "file", mimetype: "image/png", originalname: "evidence.png" }))
            .toHaveBeenCalledWith(null, true);
    });
});

describe("validateFileContent - pdfOnlyFields", () => {
    const middleware = validateFileContent(["image", "document"], { pdfOnlyFields: PDF_ONLY_FIELDS });

    it("rejects a JPEG uploaded under a KYC field even if it claims to be a PDF", async () => {
        const req = { files: { national_id: [{ fieldname: "national_id", mimetype: "application/pdf", buffer: jpegBuffer, originalname: "id.pdf" }] } };
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("rejects a non-PDF document container (docx) under a KYC field", async () => {
        const req = { files: { tin_certificate: [{ fieldname: "tin_certificate", mimetype: "application/pdf", buffer: docxBuffer, originalname: "tin.pdf" }] } };
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("accepts a real PDF under a KYC field", async () => {
        const req = { files: { business_license: [{ fieldname: "business_license", mimetype: "application/pdf", buffer: pdfBuffer, originalname: "license.pdf" }] } };
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("still allows an image under a non-KYC field (owner_photo)", async () => {
        const req = { files: { owner_photo: [{ fieldname: "owner_photo", mimetype: "image/jpeg", buffer: jpegBuffer, originalname: "me.jpg" }] } };
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });
});
