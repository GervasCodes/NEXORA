#!/usr/bin/env node
/**
 * Generates ../docs/design/screen-inventory.generated.md from the route tree in src/App.jsx:
 * every <Route>, its full path (nested routes resolved), the Require* guard wrapping it, the component,
 * its source file, any redirect, whether a test mentions the component, and the page files nothing imports.
 *
 *   node scripts/generate-screen-inventory.mjs           write the file
 *   node scripts/generate-screen-inventory.mjs --check   exit 1 if the committed file is out of date
 *
 * The Guard column is client-side routing only, not security; the backend enforces roles.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.resolve(ROOT, "..", "docs", "design", "screen-inventory.generated.md");

const app = fs.readFileSync(path.join(SRC, "App.jsx"), "utf8");
const ast = parse(app, { sourceType: "module", plugins: ["jsx"] });

// component name -> source file (lazy imports and plain imports)
const sources = {};
const importPath = (spec) => {
    const rel = spec.replace(/^\.\//, "");
    for (const ext of ["", ".jsx", ".js", "/index.jsx"]) {
        if (fs.existsSync(path.join(SRC, rel + ext)) && fs.statSync(path.join(SRC, rel + ext)).isFile()) return rel + ext;
    }
    return rel;
};
for (const node of ast.program.body) {
    if (node.type === "ImportDeclaration") {
        for (const s of node.specifiers) sources[s.local.name] = importPath(node.source.value);
    }
    if (node.type === "VariableDeclaration") {
        for (const d of node.declarations) {
            const text = app.slice(d.start, d.end);
            const m = /lazy\(\s*\(\)\s*=>\s*import\(\s*"([^"]+)"\s*\)(?:\.then\(\(m\)\s*=>\s*\(\{\s*default:\s*m\.(\w+))?/.exec(text);
            if (m && d.id.name) sources[d.id.name] = importPath(m[1]) + (m[2] ? `#${m[2]}` : "");
        }
    }
}

const attr = (el, name) => el.openingElement.attributes.find((a) => a.name && a.name.name === name);
const tagName = (el) => (el.openingElement ? el.openingElement.name.name : null);
const rows = [];

const walkRoutes = (node, prefix, guard) => {
    if (node.type !== "JSXElement") return;
    const tag = tagName(node);
    if (tag === "Route") {
        const p = attr(node, "path");
        const own = p && p.value ? p.value.value : "";
        const full = own.startsWith("/") ? own : `${prefix}/${own}`.replace(/\/+/g, "/");
        const el = attr(node, "element");
        let component = "", g = guard, redirect = "";
        if (el && el.value.type === "JSXExpressionContainer" && el.value.expression.type === "JSXElement") {
            let cur = el.value.expression;
            while (cur) {
                const name = tagName(cur);
                if (/^Require/.test(name)) {
                    g = name.replace(/^Require/, "").toLowerCase();
                    cur = cur.children.find((c) => c.type === "JSXElement");
                } else {
                    if (name === "Navigate") { const to = attr(cur, "to"); redirect = to && to.value ? to.value.value : "(expression)"; }
                    else component = name;
                    cur = null;
                }
            }
        }
        const isLayout = node.children.some((c) => c.type === "JSXElement" && tagName(c) === "Route");
        if (!isLayout || component || redirect) {
            rows.push({ route: full || "/", guard: g || "public", component, redirect, file: component ? sources[component] || "" : "" });
        }
        node.children.forEach((c) => walkRoutes(c, full === "/" ? "" : full, g));
    } else {
        node.children.forEach((c) => walkRoutes(c, prefix, guard));
    }
};
const visit = (n) => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "JSXElement" && tagName(n) === "Routes") { n.children.forEach((c) => walkRoutes(c, "", "")); return; }
    for (const k of Object.keys(n)) { const c = n[k]; if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c.type === "string") visit(c); }
};
visit(ast.program);

const walkFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const testText = walkFiles(path.join(ROOT, "tests")).filter((f) => /\.(jsx?|mjs)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const allSrc = walkFiles(SRC).filter((f) => /\.jsx?$/.test(f)).map((f) => ({ f, t: fs.readFileSync(f, "utf8") }));
const pages = walkFiles(path.join(SRC, "pages")).filter((f) => f.endsWith(".jsx")).map((f) => path.relative(SRC, f).split(path.sep).join("/"));
const unreferenced = pages.filter((p) => {
    const base = path.basename(p, ".jsx");
    const re = new RegExp(`from\\s+["'][^"']*/${base}(\\.jsx)?["']|import\\(\\s*["'][^"']*/${base}(\\.jsx)?["']`);
    return !allSrc.some(({ f, t }) => !f.endsWith(p) && re.test(t));
});

const esc = (s) => String(s).replace(/\|/g, "\\|");
const md = [
    "# Screen inventory (generated)",
    "",
    "> Generated by `frontend/scripts/generate-screen-inventory.mjs` from `frontend/src/App.jsx`. Do not edit by hand.",
    "> The Guard column is the client-side wrapper only (user-experience routing, not security); the backend enforces roles.",
    "> Test = the component name appears in a frontend test file (a name search, not coverage).",
    "",
    `Route entries: **${rows.length}**. Page files: **${pages.length}**.`,
    "",
    "| Route | Guard | Component | Source file | Redirect | Test |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => `| \`${esc(r.route)}\` | ${r.guard} | ${r.component} | ${r.file ? `\`${esc(r.file)}\`` : ""} | ${r.redirect ? `\`${esc(r.redirect)}\`` : ""} | ${r.component && new RegExp(`\\b${r.component}\\b`).test(testText) ? "Y" : r.component ? "N" : ""} |`),
    "",
    "## Page files that no other file imports",
    "",
    ...(unreferenced.length ? unreferenced.map((p) => `- \`frontend/src/${p}\``) : ["None."]),
    ""
].join("\n");

if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (current !== md) { console.error("screen-inventory.generated.md is out of date; run node scripts/generate-screen-inventory.mjs"); process.exit(1); }
    console.log("screen inventory is up to date");
} else {
    fs.writeFileSync(OUT, md);
    console.log(`Wrote ${path.relative(path.resolve(ROOT, ".."), OUT)} (${rows.length} routes, ${unreferenced.length} unreferenced pages)`);
}
