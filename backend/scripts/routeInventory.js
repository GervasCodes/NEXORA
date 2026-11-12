/**
 * Static inventory of every HTTP route the backend declares, with the guards (authentication, roles,
 * rate limiters, approvals, feature switches ...) that sit in front of it.
 *
 * It reads the source instead of booting the app, so it needs no database or environment, and it is
 * what the OpenAPI drift test (tests/unit/docs/openapiDrift.test.js) and the spec synchroniser
 * (scripts/syncOpenApi.js) are built on.
 *
 * Understands: the `app.use("/api/v1/...", routes)` mount table in src/app.js; `router.METHOD(path, ...)`
 * in each *.routes.js; sub-routers added with `router.use(require("./x.routes"))` (they inherit the
 * prefix and the guards declared before them); router-level `router.use(guards...)`; guards passed
 * through spread arrays (`...sellerMediaGuards`); Express 5 optional segments (`/:id{/:variantId}`);
 * and routes registered directly on `app` (webhooks).
 *
 * It is static analysis: a guard enforced inside a controller or service is not visible here, and
 * routes registered by unusual means (loops, computed paths) are not found.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const API_PREFIX = "/api/v1";

// Index of the ")" that closes the "(" at `start`, ignoring parentheses inside strings.
const balanced = (text, start) => {
    let depth = 0;
    let quote = null;
    for (let i = start; i < text.length; i += 1) {
        const ch = text[i];
        if (quote) {
            if (ch === "\\") i += 1;
            else if (ch === quote) quote = null;
        } else if (ch === "\"" || ch === "'" || ch === "`") {
            quote = ch;
        } else if (ch === "(") {
            depth += 1;
        } else if (ch === ")") {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return text.length - 1;
};

const GUARD_PATTERN = new RegExp([
    "authMiddleware",
    "authorize\\([^)]*\\)",
    "requireApprovedSeller", "requireApprovedDeliveryAgent", "requireSuperAdmin",
    "requireFeature\\([^)]*\\)", "requireSubscriptionTier\\([^)]*\\)",
    "requireProductProvider", "requireServiceProvider", "requireDeliveryBusiness", "requireBusinessToolsAccess",
    "optionalAuth\\w*", "\\w+Limiter",
    "verify\\w*Webhook", "webhook\\w*Auth\\w*", "maintenance\\w*"
].join("|"), "g");

const guardsIn = (text, fileText) => {
    let source = text;
    // ...someGuardArray -> look the array up in the same file and include what is in it
    for (const [, name] of text.matchAll(/\.\.\.(\w+)/g)) {
        const array = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(fileText);
        if (array) source += ` ${array[1]}`;
    }
    const found = [];
    for (let guard of source.match(GUARD_PATTERN) || []) {
        guard = guard.replace(/^authMiddleware$/, "auth").replace(/^authorize\("([a-z_]+)"\)$/, "role:$1");
        if (!found.includes(guard)) found.push(guard);
    }
    return found;
};

const read = (file) => fs.readFileSync(file, "utf8");

// "/cart/:productId{/:variantId}" -> ["/cart/{productId}", "/cart/{productId}/{variantId}"]
const toOpenApiPaths = (expressPath) => {
    const withOptional = /\{\/:(\w+)\}/.exec(expressPath);
    const expand = (p) => p.replace(/:(\w+)/g, "{$1}");
    if (!withOptional) return [expand(expressPath)];
    const without = expressPath.replace(/\{\/:\w+\}/, "");
    const withIt = expressPath.replace(/\{\/:(\w+)\}/, "/:$1");
    return [expand(without), expand(withIt)];
};

const handlerName = (callText) => {
    const members = [...callText.matchAll(/([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*(?=[,)\s]*\)?\s*$)/g)];
    const last = [...callText.matchAll(/\b[A-Za-z_]\w*\.([A-Za-z_]\w*)\b/g)].pop();
    return (last && last[1]) || (members.length ? members[members.length - 1][2] : null);
};

const mountTable = (appText) => {
    const required = {};
    for (const m of appText.matchAll(/const\s+(\w+)\s*=\s*require\("\.\/modules\/([^"]+)"\)/g)) required[m[1]] = m[2];
    const mounts = [];
    for (const m of appText.matchAll(/app\.use\(\s*"(\/api\/v1[^"]*)"\s*,\s*(?:(\w+)|require\("\.\/modules\/([^"]+)"\))\s*\)/g)) {
        const file = m[2] ? required[m[2]] : m[3];
        if (file) mounts.push({ prefix: m[1], file, inherited: [] });
    }
    return mounts;
};

const addSubRouters = (mounts) => {
    const extra = [];
    for (const mount of mounts) {
        const file = path.join(SRC, "modules", `${mount.file}.js`);
        if (!fs.existsSync(file)) continue;
        const text = read(file);
        for (const m of text.matchAll(/router\.use\(\s*require\("\.\/([A-Za-z.]+)"\)\s*\)/g)) {
            const inherited = [];
            for (const use of text.matchAll(/router\.use\(/g)) {
                if (use.index >= m.index) continue;
                const call = text.slice(use.index, balanced(text, use.index + "router.use".length) + 1);
                if (call.includes("require(")) continue;
                guardsIn(call, text).forEach((g) => { if (!inherited.includes(g)) inherited.push(g); });
            }
            extra.push({ prefix: mount.prefix, file: `${path.dirname(mount.file)}/${m[1]}`, inherited });
        }
    }
    return [...mounts, ...extra];
};

const routesInFile = (mount) => {
    const file = path.join(SRC, "modules", `${mount.file}.js`);
    if (!fs.existsSync(file)) return [];
    const text = read(file);
    const uses = [...text.matchAll(/router\.use\(/g)].map((m) => ({
        at: m.index,
        guards: guardsIn(text.slice(m.index, balanced(text, m.index + "router.use".length) + 1), text)
    }));
    const routes = [];
    for (const m of text.matchAll(/router\.(get|post|put|patch|delete)\(/g)) {
        const open = m.index + m[0].length - 1;
        const call = text.slice(open, balanced(text, open) + 1);
        const first = /^\(\s*['"`]([^'"`]*)['"`]/.exec(call);
        if (!first) continue;
        const guards = [...mount.inherited];
        uses.filter((u) => u.at < m.index).forEach((u) => u.guards.forEach((g) => { if (!guards.includes(g)) guards.push(g); }));
        guardsIn(call, text).forEach((g) => { if (!guards.includes(g)) guards.push(g); });
        const sub = first[1] === "/" ? "" : first[1];
        for (const p of toOpenApiPaths((mount.prefix + sub).replace(/\/$/, ""))) {
            routes.push({
                method: m[1].toUpperCase(), path: p, module: mount.file.split("/")[0],
                file: `backend/src/modules/${mount.file}.js`, guards, handler: handlerName(call)
            });
        }
    }
    return routes;
};

const appLevelRoutes = (appText) => {
    const routes = [];
    for (const m of appText.matchAll(/^app\.(get|post|put|patch|delete)\(/gm)) {
        const open = m.index + m[0].length - 1;
        const call = appText.slice(open, balanced(appText, open) + 1);
        const first = /^\(\s*['"`]([^'"`]*)['"`]/.exec(call);
        if (!first) continue;
        routes.push({
            method: m[1].toUpperCase(), path: first[1], module: "app",
            file: "backend/src/app.js", guards: guardsIn(call, appText), handler: handlerName(call)
        });
    }
    return routes;
};

// Express-style or OpenAPI-style path -> comparable form: every parameter becomes "{}".
exports.normalise = (p) => p.replace(/\{\/:\w+\}/g, "").replace(/(:\w+|\{\w+\})/g, "{}");

// Every route under /api/v1 (module routes, sub-routers and routes declared directly on app).
exports.buildInventory = () => {
    const appText = read(path.join(SRC, "app.js"));
    const mounts = addSubRouters(mountTable(appText));
    const routes = mounts.flatMap(routesInFile);
    const direct = appLevelRoutes(appText).flatMap((r) => toOpenApiPaths(r.path).map((p) => ({ ...r, path: p })));
    return [...routes, ...direct].filter((r) => r.path.startsWith(API_PREFIX));
};

// Operational routes outside /api/v1 (health, ping, sitemaps ...). Not part of the versioned API spec.
exports.buildOperationalRoutes = () => {
    const appText = read(path.join(SRC, "app.js"));
    return appLevelRoutes(appText).filter((r) => !r.path.startsWith(API_PREFIX));
};

exports.API_PREFIX = API_PREFIX;
