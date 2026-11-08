// Follows imports from src/main.jsx and reports:
//   MISSING file   - a relative import whose file does not exist
//   MISSING export - a named import that the target file does not export
// Run from the frontend folder:  node check-imports.mjs
import fs from "node:fs";
import path from "node:path";

const exts = ["", ".js", ".jsx", ".json", ".css", "/index.js", "/index.jsx"];
const find = (base) => exts.map((x) => base + x).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
const rel = (f) => path.relative(process.cwd(), f).replace(/\\/g, "/");
const exportCache = new Map();

function exportsOf(file) {
    if (exportCache.has(file)) return exportCache.get(file);
    const s = fs.readFileSync(file, "utf8");
    const ex = new Set();
    for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) ex.add(m[1]);
    for (const m of s.matchAll(/export\s*\{([^}]*)\}/g))
        for (const x of m[1].split(",")) { const n = x.trim().split(/\s+as\s+/).pop(); if (n) ex.add(n); }
    if (/export\s+default/.test(s)) ex.add("default");
    if (/export\s*\*\s*from/.test(s)) ex.add("*");
    exportCache.set(file, ex);
    return ex;
}

const seen = new Set();
const problems = [];
const queue = [path.resolve("src/main.jsx")];

while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(js|jsx)$/.test(file)) continue;
    const s = fs.readFileSync(file, "utf8");
    for (const m of s.matchAll(/import\s+([^;]*?)\s+from\s+["'](\.[^"']+)["']|import\s*\(?\s*["'](\.[^"']+)["']/gs)) {
        const spec = (m[2] || m[3]).replace(/\?.*$/, "");
        const hit = find(path.resolve(path.dirname(file), spec));
        if (!hit) { problems.push(`MISSING file   ${spec}  (imported by ${rel(file)})`); continue; }
        queue.push(hit);
        if (m[1] && /\.(js|jsx)$/.test(hit)) {
            const ex = exportsOf(hit);
            if (ex.has("*")) continue;
            const named = m[1].match(/\{([^}]*)\}/);
            if (named)
                for (const x of named[1].split(",")) {
                    const n = x.trim().split(/\s+as\s+/)[0].trim();
                    if (n && !ex.has(n)) problems.push(`MISSING export ${n}  (${rel(file)} imports it from ${rel(hit)})`);
                }
        }
    }
}
if (!problems.length) console.log("OK: no missing imports or exports");
[...new Set(problems)].forEach((p) => console.log(p));
