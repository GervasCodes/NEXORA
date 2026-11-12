#!/usr/bin/env node
/**
 * Dynamic-SQL guard. Finds every template-literal SQL statement in src/ that interpolates a value
 * (`${...}`), and compares the set of interpolated expressions per file against the reviewed
 * allow-list in tests/sqlInterpolationAllowlist.json.
 *
 * Why: parameter placeholders (?) are safe; `${...}` inside SQL is safe only when the fragment is a
 * server-built constant (a column list, a validated sort key, a "?,?,?" placeholder run). A new
 * interpolation must be reviewed by a person and added to the allow-list in the same change.
 *
 *   node scripts/sqlInterpolationGuard.js            check (exit 1 on anything unreviewed)
 *   node scripts/sqlInterpolationGuard.js --update   rewrite the allow-list from the current code
 *                                                    (review the diff before committing)
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const ALLOWLIST = path.join(ROOT, "tests", "sqlInterpolationAllowlist.json");
const SQL = /\b(SELECT\s|INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|\sFROM\s|\sWHERE\s|\sORDER\s+BY\s|\sLIMIT\s)/i;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith(".js") ? [full] : [];
});

const visit = (node, fn) => {
    if (!node || typeof node.type !== "string") return;
    fn(node);
    for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach((c) => visit(c, fn));
        else if (child && typeof child.type === "string") visit(child, fn);
    }
};

const scan = () => {
    const found = {};
    for (const file of walk(SRC)) {
        const code = fs.readFileSync(file, "utf8");
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        let ast;
        try { ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true }); }
        catch (error) { throw new Error(`${rel}: cannot parse (${error.message})`); }
        visit(ast, (node) => {
            if (node.type !== "TemplateLiteral" || node.expressions.length === 0) return;
            const text = node.quasis.map((q) => q.value.cooked).join("?");
            if (!SQL.test(text)) return;
            for (const expr of node.expressions) {
                const source = code.slice(expr.start, expr.end).replace(/\s+/g, " ").trim();
                (found[rel] ||= new Set()).add(source);
            }
        });
    }
    return Object.fromEntries(Object.entries(found).sort().map(([k, v]) => [k, [...v].sort()]));
};

const check = () => {
    const current = scan();
    const allowed = JSON.parse(fs.readFileSync(ALLOWLIST, "utf8"));
    const unreviewed = [];
    for (const [file, exprs] of Object.entries(current)) {
        const ok = new Set(allowed[file] || []);
        for (const expr of exprs) if (!ok.has(expr)) unreviewed.push({ file, expr });
    }
    return { current, unreviewed };
};

module.exports = { scan, check };

if (require.main === module) {
    if (process.argv.includes("--update")) {
        fs.writeFileSync(ALLOWLIST, JSON.stringify(scan(), null, 2) + "\n");
        console.log(`Wrote ${path.relative(ROOT, ALLOWLIST)}. Review the diff before committing.`);
    } else {
        const { current, unreviewed } = check();
        const total = Object.values(current).reduce((n, v) => n + v.length, 0);
        if (unreviewed.length) {
            console.error(`Unreviewed SQL interpolation (${unreviewed.length}):`);
            unreviewed.forEach((u) => console.error(`  ${u.file}: \${${u.expr}}`));
            console.error("Use ? placeholders, or review the fragment and add it with --update.");
            process.exit(1);
        }
        console.log(`OK: ${total} interpolated SQL expressions in ${Object.keys(current).length} files, all reviewed.`);
    }
}
