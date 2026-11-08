// Follows imports from src/main.jsx and lists every relative import whose file does not exist.
// Run from the frontend folder:  node check-imports.mjs
import fs from "node:fs";
import path from "node:path";

const exts = ["", ".js", ".jsx", ".json", ".css", "/index.js", "/index.jsx"];
const find = (base) => exts.map((x) => base + x).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
const seen = new Set();
const missing = new Map();
const queue = [path.resolve("src/main.jsx")];

while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(js|jsx)$/.test(file)) continue;
    const s = fs.readFileSync(file, "utf8");
    const re = /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g;
    let m;
    while ((m = re.exec(s))) {
        const base = path.resolve(path.dirname(file), m[1].replace(/\?.*$/, ""));
        const hit = find(base);
        if (hit) queue.push(hit);
        else {
            const rel = path.relative(process.cwd(), base).replace(/\\/g, "/");
            if (!missing.has(rel)) missing.set(rel, new Set());
            missing.get(rel).add(path.relative(process.cwd(), file).replace(/\\/g, "/"));
        }
    }
}
if (!missing.size) console.log("OK: no missing imports");
for (const [f, by] of missing) console.log(`MISSING ${f}  (imported by ${[...by].join(", ")})`);
