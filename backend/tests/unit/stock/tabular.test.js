const { zipSync, strToU8 } = require("fflate");
const tabular = require("../../../src/modules/stock/stock.tabular");

const xlsx = (rows, { inline = false } = {}) => {
    const shared = [];
    const cell = (v, r, c) => {
        const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
        if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
        if (inline) return `<c r="${ref}" t="inlineStr"><is><t>${v.replace(/&/g, "&amp;")}</t></is></c>`;
        shared.push(v);
        return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
    };
    const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => (v === "" ? "" : cell(v, r, c))).join("")}</row>`).join("");
    return Buffer.from(zipSync({
        "[Content_Types].xml": strToU8("<Types/>"),
        "xl/workbook.xml": strToU8("<workbook/>"),
        "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
        "xl/sharedStrings.xml": strToU8(`<sst>${shared.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`)
    }));
};

describe("stock.tabular", () => {
    describe("CSV", () => {
        it("reads quotes, embedded commas / newlines, CRLF and a BOM", () => {
            const rows = tabular.parseCsv('﻿Name,Price\r\n"Sugar, 1kg",3000\r\n"Two\nlines","a ""q"""\r\n');
            expect(rows).toEqual([["Name", "Price"], ["Sugar, 1kg", "3000"], ["Two\nlines", 'a "q"']]);
        });
        it("detects the semicolon and tab separators some regions save", () => {
            expect(tabular.parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
            expect(tabular.parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
        });
        it("keeps blank lines in place (so row numbers match the spreadsheet) and drops trailing ones", () => {
            expect(tabular.parseCsv("a,b\n\n1,2\n\n\n")).toEqual([["a", "b"], [""], ["1", "2"]]);
        });
        it("neutralises text a spreadsheet would run as a formula, but leaves numbers alone", () => {
            expect(tabular.safeCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
            expect(tabular.safeCell("+255712345678")).toBe("'+255712345678");
            expect(tabular.safeCell("-5 off")).toBe("'-5 off");
            expect(tabular.safeCell("@cmd")).toBe("'@cmd");
            expect(tabular.safeCell(-5)).toBe("-5");
            expect(tabular.safeCell(null)).toBe("");
        });
        it("writes a BOM and CRLF so Excel opens it with the right characters", () => {
            const csv = tabular.toCsv(["Jina"], [["Maziwa ya mtindi"]]);
            expect(csv.startsWith("﻿")).toBe(true);
            expect(csv).toContain("\r\n");
        });
        it("formats dates in Dar es Salaam", () => {
            expect(tabular.darDateTime("2026-10-27T21:30:00Z")).toBe("2026-10-28 00:30");
            expect(tabular.darDateTime(null)).toBe("");
        });
    });

    describe("XLSX", () => {
        it("reads shared and inline strings, numbers, and blank cells", () => {
            const rows = tabular.parseXlsx(xlsx([["Name", "SKU", "Price"], ["Sugar & salt", "", 3000]]));
            expect(rows).toEqual([["Name", "SKU", "Price"], ["Sugar & salt", "", "3000"]]);
            expect(tabular.parseXlsx(xlsx([["Name"], ["Mchele"]], { inline: true }))).toEqual([["Name"], ["Mchele"]]);
        });
        it("rejects a file that is not a spreadsheet", () => {
            expect(() => tabular.parseXlsx(Buffer.from("PK not really a zip"))).toThrow(/valid .xlsx/);
        });
        it("rejects an archive with no worksheet", () => {
            expect(() => tabular.parseXlsx(Buffer.from(zipSync({ "a.txt": strToU8("hi") })))).toThrow(/valid .xlsx/);
        });
        it("refuses a zip that would unpack to something huge (zip bomb)", () => {
            const bomb = Buffer.from(zipSync({ "xl/worksheets/sheet1.xml": new Uint8Array(21 * 1024 * 1024) }));
            expect(bomb.length).toBeLessThan(tabular.MAX_UPLOAD_BYTES);
            expect(() => tabular.parseXlsx(bomb)).toThrow(/too large/);
        });
    });

    describe("readUpload", () => {
        const file = (name, buffer, mimetype = "text/csv") => ({ originalname: name, buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), mimetype });
        it("reads csv and xlsx by content", () => {
            expect(tabular.readUpload(file("a.csv", "x,y\n1,2"))).toEqual([["x", "y"], ["1", "2"]]);
            expect(tabular.readUpload(file("b.xlsx", xlsx([["x"], ["1"]]), "application/octet-stream"))).toEqual([["x"], ["1"]]);
        });
        it("rejects empty, oversized, binary and legacy .xls files with a plain reason", () => {
            expect(() => tabular.readUpload(null)).toThrow(/Choose a file/);
            expect(() => tabular.readUpload(file("a.csv", Buffer.alloc(tabular.MAX_UPLOAD_BYTES + 1, 97)))).toThrow(/too large/);
            expect(() => tabular.readUpload(file("a.csv", Buffer.from([97, 0, 98])))).toThrow(/CSV/);
            expect(() => tabular.readUpload(file("old.xls", "x", "application/vnd.ms-excel"))).toThrow(/\.xls/);
            expect(() => tabular.readUpload(file("a.pdf", "x", "application/pdf"))).toThrow(/csv or .xlsx/);
        });
        it("a renamed zip is not accepted as a csv, and a csv renamed .xlsx is not accepted as xlsx", () => {
            expect(() => tabular.readUpload(file("fake.xlsx", "a,b\n1,2"))).toThrow(/valid .xlsx/);
        });
    });
});
