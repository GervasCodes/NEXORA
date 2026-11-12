// Keeps backend/.env.example honest: every variable the code reads must be documented in it, so a new
// developer (or a new server) is never missing a setting that the code silently depends on.
const fs = require("fs");
const path = require("path");

const BACKEND = path.join(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(BACKEND, file), "utf8");

const walk = (dir) => fs.readdirSync(path.join(BACKEND, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return entry.name.endsWith(".js") ? [rel] : [];
});

const variablesIn = (text, pattern) => new Set([...text.matchAll(pattern)].map((m) => m[1]));

describe(".env.example", () => {
    const example = read(".env.example");
    const documented = variablesIn(example, /^#?\s*([A-Z][A-Z0-9_]+)=/gm);

    const sources = [...walk("src"), "server.js", "worker.js"];
    const used = new Set();
    sources.forEach((file) => variablesIn(read(file), /process\.env\.([A-Z][A-Z0-9_]+)/g).forEach((name) => used.add(name)));

    // Provided by the platform or the test runner, not configured by a person.
    const PLATFORM_PROVIDED = new Set(["NODE_ENV", "PORT", "JEST_WORKER_ID", "npm_package_version", "RENDER", "RENDER_GIT_COMMIT", "RENDER_EXTERNAL_URL", "CI"]);

    it("documents every variable read through process.env.NAME", () => {
        const missing = [...used].filter((name) => !documented.has(name) && !PLATFORM_PROVIDED.has(name)).sort();
        expect(missing).toEqual([]);
    });

    it("no longer lists the legacy SMTP variables that nothing reads", () => {
        for (const name of ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASSWORD"]) {
            expect(documented.has(name)).toBe(false);
        }
    });

    it("contains no real-looking secrets (every assignment is empty, a placeholder or a plain setting)", () => {
        const suspicious = example.split("\n").filter((line) =>
            /^[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*=.{20,}$/.test(line));
        expect(suspicious).toEqual([]);
    });

    it("is not git-ignored (a new clone must be able to get it)", () => {
        const ignore = read(".gitignore").split(/\r?\n/).map((line) => line.trim());
        expect(ignore).not.toContain(".env.example");
        expect(ignore).toContain(".env");
    });
});
