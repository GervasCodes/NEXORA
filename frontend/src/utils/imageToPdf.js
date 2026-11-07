/**
 * imageToPdf.js
 *
 * Identity/KYC documents must end up stored as PDF, never as a bare
 * photo (see utils/kycDocumentRules.js on the backend, and the
 * "Keep earlier decisions" rule this phase works under). The backend
 * enforces that for seller account-verification documents; the buyer
 * KYC tier-upgrade endpoint (kyc.service.js#requestUpgrade) currently
 * accepts whatever the browser sends, so a buyer snapping a photo of
 * their ID with their phone camera would otherwise upload a raw JPEG.
 * This file does the conversion client-side, before the file ever
 * leaves the browser, so what reaches the server is always a PDF.
 *
 * Deliberately dependency-free: no jsPDF/pdf-lib in this project yet,
 * and a single-page "one JPEG embedded in a PDF" doesn't need a real
 * PDF library - it's a handful of PDF objects wired together by hand,
 * a well-documented minimal recipe (JPEG bytes embedded verbatim as a
 * DCTDecode image XObject, one page, one content stream that paints
 * it to fill the page).
 */

// A4-ish point ceiling so a very high-resolution phone photo (e.g.
// 4000x3000px fed in 1px=1pt) doesn't produce a PDF page the size of a
// billboard - the image is scaled down to fit, never up.
const MAX_PDF_POINTS = 2000;

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not read this image file"));
        img.src = URL.createObjectURL(file);
    });
}

function canvasToJpegBytes(canvas, quality = 0.9) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) return reject(new Error("Could not encode image"));
                blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
            },
            "image/jpeg",
            quality
        );
    });
}

// Builds the raw bytes of a single-page PDF wrapping one JPEG. Offsets
// in the xref table are counted in bytes as each object is appended, so
// text and binary (the JPEG stream) segments are tracked as byte
// lengths throughout, not JS string lengths.
function buildSinglePageImagePdf(jpegBytes, widthPt, heightPt) {
    const enc = new TextEncoder();
    const chunks = [];
    let offset = 0;
    const objectOffsets = [];

    const push = (bytes) => {
        chunks.push(bytes);
        offset += bytes.length;
    };
    const pushText = (text) => push(enc.encode(text));
    const startObject = (n) => {
        objectOffsets[n] = offset;
        pushText(`${n} 0 obj\n`);
    };

    pushText("%PDF-1.4\n");

    startObject(1);
    pushText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    startObject(2);
    pushText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

    startObject(3);
    pushText(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] ` +
        `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
    );

    startObject(4);
    pushText(
        `<< /Type /XObject /Subtype /Image /Width ${widthPt} /Height ${heightPt} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    );
    push(jpegBytes);
    pushText("\nendstream\nendobj\n");

    const content = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im0 Do Q`;
    startObject(5);
    pushText(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    const xrefStart = offset;
    const objectCount = 6;
    let xref = `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
    for (let i = 1; i < objectCount; i++) {
        xref += `${String(objectOffsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pushText(xref);
    pushText(
        `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    );

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
    }
    return out;
}

// General N-page version of buildSinglePageImagePdf, used for the ID
// front/back capture case (KycStatus.jsx) where two photos need to
// become one PDF, since the upload endpoint takes a single file. Same
// object-by-object byte-offset tracking as the single-page builder.
function buildMultiPageImagePdf(pages) {
    const enc = new TextEncoder();
    const chunks = [];
    let offset = 0;
    const objectOffsets = [];

    const push = (bytes) => { chunks.push(bytes); offset += bytes.length; };
    const pushText = (text) => push(enc.encode(text));
    const startObject = (n) => { objectOffsets[n] = offset; pushText(`${n} 0 obj\n`); };

    const n = pages.length;
    // Object numbering: 1=Catalog, 2=Pages, then per page i (0-indexed):
    // page obj = 3 + i*3, image obj = 4 + i*3, content obj = 5 + i*3.
    const pageObjNum = (i) => 3 + i * 3;
    const imageObjNum = (i) => 4 + i * 3;
    const contentObjNum = (i) => 5 + i * 3;
    const totalObjects = 3 + n * 3;

    pushText("%PDF-1.4\n");

    startObject(1);
    pushText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    startObject(2);
    const kids = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(" ");
    pushText(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);

    pages.forEach((p, i) => {
        startObject(pageObjNum(i));
        pushText(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] ` +
            `/Resources << /XObject << /Im0 ${imageObjNum(i)} 0 R >> >> /Contents ${contentObjNum(i)} 0 R >>\nendobj\n`
        );

        startObject(imageObjNum(i));
        pushText(
            `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`
        );
        push(p.jpegBytes);
        pushText("\nendstream\nendobj\n");

        const content = `q ${p.width} 0 0 ${p.height} 0 0 cm /Im0 Do Q`;
        startObject(contentObjNum(i));
        pushText(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    });

    const xrefStart = offset;
    let xref = `xref\n0 ${totalObjects}\n0000000000 65535 f \n`;
    for (let i = 1; i < totalObjects; i++) {
        xref += `${String(objectOffsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pushText(xref);
    pushText(`trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
}

async function imageFileToPage(file) {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_PDF_POINTS / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const jpegBytes = await canvasToJpegBytes(canvas);
    URL.revokeObjectURL(img.src);
    return { width, height, jpegBytes };
}

const IMAGE_MIME_RE = /^image\//;

/**
 * Converts an image File to a single-page PDF File. A file that's
 * already a PDF (or anything else - the caller should gate on
 * `accept="image/*,application/pdf"`) is returned unchanged.
 */
export async function convertImageFileToPdf(file) {
    if (!file || !IMAGE_MIME_RE.test(file.type)) {
        return file;
    }
    const page = await imageFileToPage(file);
    const pdfBytes = buildSinglePageImagePdf(page.jpegBytes, page.width, page.height);
    const pdfName = file.name.replace(/\.[^.]+$/, "") + ".pdf";
    return new File([pdfBytes], pdfName, { type: "application/pdf" });
}

/**
 * Combines one or two photos (front/back of an ID) into a single
 * multi-page PDF File. Any file that's already a PDF is passed through
 * as its own single-file result instead (can't currently merge an
 * existing PDF page in with photos using this hand-rolled builder, so
 * callers should only reach this with image files - see
 * KycStatus.jsx's capture mode, which only offers a camera/image input
 * for front/back).
 */
export async function convertImageFilesToPdf(files) {
    const imageFiles = files.filter(Boolean);
    if (imageFiles.length === 0) return null;
    if (imageFiles.length === 1 && !IMAGE_MIME_RE.test(imageFiles[0].type)) {
        return imageFiles[0];
    }

    const pages = await Promise.all(
        imageFiles.map((f) => (IMAGE_MIME_RE.test(f.type) ? imageFileToPage(f) : null))
    );
    const validPages = pages.filter(Boolean);
    if (validPages.length === 0) return imageFiles[0];

    const pdfBytes = buildMultiPageImagePdf(validPages);
    return new File([pdfBytes], "document.pdf", { type: "application/pdf" });
}
