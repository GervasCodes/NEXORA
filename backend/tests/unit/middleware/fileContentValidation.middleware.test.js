const { validateFileContent } = require("../../../src/middleware/fileContentValidation.middleware");

const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ header, disguised as an image

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe("fileContentValidation.middleware", () => {
    it("calls next() with no files present (e.g. a non-multipart request passing through)", () => {
        const middleware = validateFileContent(["image"]);
        const req = {};
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("allows a single file (req.file) whose real content matches an allowed category", () => {
        const middleware = validateFileContent(["image"]);
        const req = { file: { fieldname: "image", mimetype: "image/jpeg", buffer: jpegBuffer, originalname: "photo.jpg" } };
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("rejects a file whose declared mimetype lies about its real content (renamed executable)", () => {
        const middleware = validateFileContent(["image"]);
        const req = { file: { fieldname: "image", mimetype: "image/jpeg", buffer: exeBuffer, originalname: "totally-a-photo.jpg" } };
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("rejects an empty file buffer", () => {
        const middleware = validateFileContent(["image"]);
        const req = { file: { fieldname: "image", mimetype: "image/jpeg", buffer: Buffer.alloc(0), originalname: "empty.jpg" } };
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("checks every file under req.files (.fields()/.array() shape) and rejects if any one fails", () => {
        const middleware = validateFileContent(["image", "document"]);
        const req = {
            files: {
                idPhoto: [{ fieldname: "idPhoto", mimetype: "image/jpeg", buffer: jpegBuffer, originalname: "id.jpg" }],
                certificate: [{ fieldname: "certificate", mimetype: "application/pdf", buffer: exeBuffer, originalname: "cert.pdf" }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("allows a declared text/plain file that passes the plain-text heuristic when allowPlainText is set", () => {
        const middleware = validateFileContent(["image"], { allowPlainText: true });
        const req = {
            file: { fieldname: "attachment", mimetype: "text/plain", buffer: Buffer.from("just a note", "utf8"), originalname: "note.txt" }
        };
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it("rejects a declared text/plain file whose content is actually binary, even with allowPlainText set", () => {
        const middleware = validateFileContent(["image"], { allowPlainText: true });
        const req = {
            file: { fieldname: "attachment", mimetype: "text/plain", buffer: exeBuffer, originalname: "note.txt" }
        };
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("does NOT fall back to the plain-text heuristic when allowPlainText is unset", () => {
        const middleware = validateFileContent(["image"]); // allowPlainText defaults to false
        const req = {
            file: { fieldname: "attachment", mimetype: "text/plain", buffer: Buffer.from("just a note", "utf8"), originalname: "note.txt" }
        };
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
