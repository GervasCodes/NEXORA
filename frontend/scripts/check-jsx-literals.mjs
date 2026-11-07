// Flags literal user-facing English in JSX so new text goes through t().
// Heuristic: JSX text between tags, plus placeholder/title/aria-label/alt
// attributes. Expect some false positives (e.g. code samples); review them.
// Usage: node scripts/check-jsx-literals.mjs [srcDir]   (exit 1 if any found)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2] || "src";
const TEXT_NODE = />\s*([A-Za-z][^<>{}\n]*[A-Za-z.!?])\s*</g;
const TEXT_ATTR = /\b(placeholder|title|aria-label|alt)="([A-Za-z][^"{}]*)"/g;
const COMMENT_LINE = /^\s*(\/\/|\*|\{\/\*)/;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (name !== "node_modules") walk(path, out);
        } else if (extname(path) === ".jsx") {
            out.push(path);
        }
    }
    return out;
}

let hits = 0;
for (const file of walk(root)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (COMMENT_LINE.test(line)) return;
        for (const m of line.matchAll(TEXT_NODE)) report(file, i, m[1]);
        for (const m of line.matchAll(TEXT_ATTR)) report(file, i, m[2]);
    });
}

function report(file, i, text) {
    hits += 1;
    console.log(`${file}:${i + 1}: ${text.trim()}`);
}

console.log(`${hits} literal(s) found`);
process.exit(hits ? 1 : 0);
