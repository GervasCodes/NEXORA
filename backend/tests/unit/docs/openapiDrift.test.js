// docs/openapi.yaml must describe the routes the backend really has. It used to drift badly: it said it was
// current to migration 082 (the repository has 160+), nearly half of the endpoints were missing, paths were
// written with /api/v1 although the server URL already ends in it, and a malformed response description made
// the whole file invalid OpenAPI. This test keeps all of that from coming back.
//
// If it fails because you added or removed a route:   node scripts/syncOpenApi.js --write   (add --prune
// to drop operations whose route is gone), then fill in the real contract for the endpoint.
const { run, load } = require("../../../scripts/syncOpenApi");
const { buildInventory, normalise } = require("../../../scripts/routeInventory");

const METHODS = ["get", "post", "put", "patch", "delete"];
const spec = load();
const operations = Object.entries(spec.paths).flatMap(([p, item]) => METHODS.filter((m) => item[m]).map((m) => ({ path: p, method: m, op: item[m] })));

describe("docs/openapi.yaml", () => {
    it("is in step with the routes the backend declares (nothing missing, nothing stale)", () => {
        const { missing, stale } = run({ write: false });
        expect({ missing, stale }).toEqual({ missing: [], stale: [] });
    });

    it("finds a realistic number of routes (guards against the route scanner silently finding none)", () => {
        expect(buildInventory().length).toBeGreaterThan(500);
    });

    it("uses paths relative to the server URL (no /api/v1 prefix) and server URLs that end in /api/v1", () => {
        expect(Object.keys(spec.paths).filter((p) => p.startsWith("/api/v1"))).toEqual([]);
        expect(spec.servers.length).toBeGreaterThan(0);
        spec.servers.forEach((s) => expect(s.url).toMatch(/\/api\/v1$/));
    });

    it("has unique operationIds", () => {
        const ids = operations.map((o) => o.op.operationId).filter(Boolean);
        expect(ids.length - new Set(ids).size).toBe(0);
    });

    it("has only well-formed response objects (a malformed description once made the file invalid)", () => {
        const allowed = new Set(["description", "content", "headers", "links", "$ref"]);
        const bad = [];
        operations.forEach(({ path, method, op }) => {
            Object.entries(op.responses || {}).forEach(([code, response]) => {
                const stray = Object.keys(response).filter((k) => !allowed.has(k));
                if (stray.length || (!response.$ref && typeof response.description !== "string")) bad.push(`${method} ${path} ${code}`);
            });
        });
        expect(bad).toEqual([]);
    });

    it("gives every operation a tag and at least one response, and declares every tag it uses", () => {
        const declared = new Set(spec.tags.map((t) => t.name));
        const problems = operations.filter(({ op }) => !op.tags?.length || !Object.keys(op.responses || {}).length || op.tags.some((t) => !declared.has(t)));
        expect(problems.map((p) => `${p.method} ${p.path}`)).toEqual([]);
    });

    it("declares every path parameter that appears in a path", () => {
        const bad = operations.filter(({ path, op }) => {
            const wanted = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
            const declaredParams = (op.parameters || []).filter((p) => p.in === "path").map((p) => p.name);
            const pathLevel = (spec.paths[path].parameters || []).filter((p) => p.in === "path").map((p) => p.name);
            return wanted.some((name) => !declaredParams.includes(name) && !pathLevel.includes(name));
        });
        expect(bad.map((b) => `${b.method} ${b.path}`)).toEqual([]);
    });

    it("marks routes behind a login as secured and public routes as open", () => {
        const wrong = [];
        buildInventory().forEach((route) => {
            const found = operations.find((o) => o.method === route.method.toLowerCase() && normalise(o.path) === normalise(route.path.replace(/^\/api\/v1/, "")));
            if (!found || found.op["x-contract-documented"] !== false) return; // hand-written operations are not re-judged
            const protectedRoute = route.guards.some((g) => g === "auth" || g.startsWith("role:"));
            const hasSecurity = Array.isArray(found.op.security) && found.op.security.length > 0;
            if (protectedRoute !== hasSecurity) wrong.push(`${route.method} ${route.path}`);
        });
        expect(wrong).toEqual([]);
    });

    it("describes login as always two-step (the OTP step is mandatory, not optional)", () => {
        const auth = spec.tags.find((t) => t.name === "auth");
        expect(auth.description).not.toMatch(/optional OTP/i);
        expect(auth.description).toMatch(/always two steps/i);
    });

    it("no longer claims to be a snapshot of an old migration", () => {
        expect(spec.info.description).not.toMatch(/migration 082|Phase RF6/);
    });
});
