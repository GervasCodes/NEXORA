const { unzipSync, strFromU8 } = require("fflate");
const { DEFAULT_TZ } = require("../../utils/dateTz");

// Reading and writing the spreadsheet files Stock Management exchanges (Phase 8).
//   - CSV: written for Excel (UTF-8 BOM, CRLF); read with an RFC 4180 parser that also copes
//     with a BOM and semicolon / tab separators (Excel in some regions saves "CSV" with ;).
//   - XLSX: read-only, first sheet, values as text. An .xlsx is a zip of XML; we unzip it with
//     fflate (tiny, no dependencies) and read the cells directly rather than pulling in a
//     full spreadsheet library. Formulas are read as their stored result.
// No file is ever executed or "evaluated"; and every exported text cell that could be taken as
// a formula by a spreadsheet is neutralised (see safeCell).

exports.MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
exports.MAX_ROWS = 2000;
const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;

// ---------------------------------------------------------------------- CSV

exports.parseCsv = (text) => {
    let s = String(text).replace(/^﻿/, "");
    const firstLine = s.split(/\r?\n/, 1)[0] || "";
    const counts = { ",": 0, ";": 0, "\t": 0 };
    let inQ = false;
    for (const ch of firstLine) {
        if (ch === '"') inQ = !inQ;
        else if (!inQ && ch in counts) counts[ch] += 1;
    }
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const sep = counts[delim] > 0 ? delim : ",";

    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (quoted) {
            if (ch === '"') {
                if (s[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
            } else field += ch;
        } else if (ch === '"' && field === "") quoted = true;
        else if (ch === sep) { row.push(field); field = ""; }
        else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && s[i + 1] === "\n") i += 1;
            row.push(field); field = "";
            rows.push(row); row = [];
        } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    // Blank rows stay in place (callers skip them) so row numbers match the spreadsheet; only
    // trailing ones are dropped.
    while (rows.length && rows[rows.length - 1].every((c) => String(c).trim() === "")) rows.pop();
    return rows;
};

const neutralise = (v) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

// A cell for a CSV we write. Numbers stay numbers (a negative quantity is fine); text that a
// spreadsheet would run as a formula is prefixed with an apostrophe.
const safeCell = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    let v = String(value);
    v = neutralise(v);
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
exports.safeCell = safeCell;

exports.toCsv = (headers, rows) => {
    const lines = [headers.map(safeCell).join(",")];
    rows.forEach((r) => lines.push(r.map(safeCell).join(",")));
    return `﻿${lines.join("\r\n")}\r\n`;
};

const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
});
// "2026-10-27 14:05" in Africa/Dar_es_Salaam.
exports.darDateTime = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return dtf.format(d).replace(",", "").replace(/^(\d{4}-\d{2}-\d{2}) 24:/, "$1 00:");
};

// --------------------------------------------------------------------- XLSX

const unescapeXml = (s) => s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const textOf = (xml) => {
    const parts = [];
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(xml))) parts.push(unescapeXml(m[1]));
    return parts.join("");
};

const colIndex = (ref) => {
    const letters = /^[A-Z]+/.exec(ref)[0];
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
};

exports.parseXlsx = (buffer) => {
    let files;
    try {
        files = unzipSync(new Uint8Array(buffer), {
            filter: (f) => {
                if (f.originalSize > MAX_UNZIPPED_BYTES) throw new Error("The spreadsheet is too large.");
                return /^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml)$/.test(f.name);
            }
        });
    } catch (error) {
        throw new Error(error.message === "The spreadsheet is too large." ? error.message : "That file isn't a valid .xlsx spreadsheet.");
    }
    const sheetName = Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).sort()[0];
    if (!sheetName) throw new Error("That file isn't a valid .xlsx spreadsheet.");

    const shared = [];
    if (files["xl/sharedStrings.xml"]) {
        const xml = strFromU8(files["xl/sharedStrings.xml"]);
        const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
        let m;
        while ((m = re.exec(xml))) shared.push(textOf(m[1]));
    }

    const xml = strFromU8(files[sheetName]);
    const rows = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
        const cells = [];
        const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cm;
        while ((cm = cellRe.exec(rm[1]))) {
            const attrs = cm[1];
            const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
            if (!ref) continue;
            const type = (/\bt="([^"]+)"/.exec(attrs) || [])[1];
            const body = cm[2] || "";
            let value = "";
            if (type === "s") value = shared[Number((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1])] ?? "";
            else if (type === "inlineStr") value = textOf(body);
            else {
                const v = /<v>([\s\S]*?)<\/v>/.exec(body);
                value = v ? unescapeXml(v[1]) : "";
            }
            cells[colIndex(ref[1])] = value;
        }
        const filled = Array.from(cells, (c) => (c === undefined ? "" : c));
        // Keep the sheet's own row numbers: an empty row in the middle stays an empty row.
        const rowRef = Number((/\br="(\d+)"/.exec(rm[0].slice(0, rm[0].indexOf(">"))) || [])[1]);
        if (rowRef) while (rows.length < rowRef - 1) rows.push([]);
        rows.push(filled);
        if (rows.length > exports.MAX_ROWS + 5) break;
    }
    while (rows.length && rows[rows.length - 1].every((c) => String(c).trim() === "")) rows.pop();
    return rows;
};

// Rows (arrays of strings) from an uploaded file, by its name / content.
exports.readUpload = (file) => {
    if (!file || !file.buffer || !file.buffer.length) throw new Error("Choose a file to import.");
    if (file.buffer.length > exports.MAX_UPLOAD_BYTES) throw new Error("The file is too large (2 MB at most).");
    const name = String(file.originalname || "").toLowerCase();
    const isZip = file.buffer[0] === 0x50 && file.buffer[1] === 0x4b; // "PK"
    if (isZip || name.endsWith(".xlsx")) {
        if (!isZip) throw new Error("That file isn't a valid .xlsx spreadsheet.");
        return exports.parseXlsx(file.buffer);
    }
    if (name.endsWith(".xls")) throw new Error("Old .xls files aren't supported. Save it as .xlsx or .csv and try again.");
    if (!/\.(csv|txt)$/.test(name) && !/^(text\/|application\/(vnd\.ms-excel|csv))/.test(String(file.mimetype || ""))) {
        throw new Error("Upload a .csv or .xlsx file.");
    }
    if (file.buffer.includes(0)) throw new Error("That doesn't look like a CSV file.");
    return exports.parseCsv(file.buffer.toString("utf8"));
};
