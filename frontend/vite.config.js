import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173
    },
    build: {
        // Explicit rather than relying on Vite's default. Every route
        // page in src/App.jsx is a lazy-loaded chunk with a
        // content-hashed filename (e.g. NewDispute-<hash>.js) - if dist/
        // is ever NOT emptied before a build (a build interrupted before
        // cleanup, an `outDir` override, or a deploy step that copies
        // build output without first clearing the target), the previous
        // build's now-orphaned chunks are left sitting alongside the new
        // ones under different hashes, silently doubling the deployed
        // bundle size per route with dead, unreferenced code - which is
        // exactly what was found in this repo's checked-in frontend/dist
        // (e.g. two NewDispute-*.js files, one from a stale build).
        // emptyOutDir:true guarantees dist/ is cleared on every build
        // regardless of any of the above.
        emptyOutDir: true,
        rollupOptions: {
            output: {
                // Every route is already its own lazy chunk (see App.jsx),
                // but everything those routes share in common - React,
                // Sentry, Socket.IO, react-router - was landing in one
                // "index" chunk loaded on every single page, which had
                // grown past Vite's 500kB warning threshold. None of that
                // is app code the user's flow determines; it's vendor
                // code that changes far less often than our own source,
                // so splitting it out by package lets browsers cache each
                // piece independently instead of invalidating one big
                // blob on every deploy - and keeps any one chunk small
                // enough to not warrant the warning.
                manualChunks(id) {
                    if (!id.includes("node_modules")) return undefined;
                    if (id.includes("react-router")) return "vendor-router";
                    if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("scheduler")) return "vendor-react";
                    if (id.includes("@sentry")) return "vendor-sentry";
                    if (id.includes("socket.io-client") || id.includes("engine.io-client")) return "vendor-socket";
                    if (id.includes("leaflet")) return "vendor-map";
                    return "vendor";
                }
            }
        }
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setupTests.js"],
        css: false,
        // Phase 4 (Testing & Session Hardening): the new Playwright suite
        // lives in e2e/*.spec.js and uses Playwright's own test/expect
        // (not vitest's) - without this exclude, vitest's default
        // include glob (**/*.{test,spec}.?(c|m)[jt]s?(x)) picks those
        // files up too and fails them immediately, since `import { test,
        // expect } from "@playwright/test"` isn't vitest's test runner.
        // Every actual vitest spec lives under tests/, by convention but
        // not by prior enforcement - this makes that boundary explicit.
        exclude: ["**/node_modules/**", "**/e2e/**"],
        // Vitest's default pool spawns a worker per available CPU core.
        // On a resource-constrained machine (low RAM/CPU headroom, AV
        // scanning every worker process, etc.) that can produce
        // "Timeout waiting for worker to respond" / "Failed to start
        // forks worker" errors partway through a run - not a bug in the
        // tests themselves (every file here passes fine in isolation or
        // with fewer concurrent workers). This showed up in practice on
        // Windows multiple times now, against a different trio of files
        // each time (Checkout.test.jsx/Login.test.jsx/
        // MessageSearch.test.jsx, then Checkout.test.jsx/Login.test.jsx/
        // NewDispute.test.jsx) - i.e. it's about *worker startup*
        // contention, not anything specific to those files.
        // `pool: "threads"` + `singleThread: true` (the previous setting
        // here) removes concurrency between test files, but worker_threads
        // still share one Node process and its startup still goes through
        // a handshake that AV real-time scanning can stall past Vitest's
        // internal (not independently configurable) startup timeout - so
        // the same symptom came back even single-threaded.
        // `pool: "forks"` spawns a real child_process instead of an
        // in-process worker_thread; each fork's startup is a plain OS
        // process launch with no thread-handshake step to stall on, which
        // is the actual point of failure here - so this is a different
        // *mechanism*, not just "try singleThread again but for forks".
        // `maxWorkers: 1` keeps the "only one worker ever needs to
        // start" property from before (still serial, not parallel) so
        // there's nothing left to contend over either way. On a beefier
        // or CI box, raise this to get parallelism back.
        //
        // This used to be poolOptions.forks.singleFork - Vitest 4 removed
        // `poolOptions` outright (it's silently ignored now, only a
        // deprecation warning at startup, not a hard error), which meant
        // that setting had stopped doing anything and Vitest was quietly
        // back to its default multi-fork concurrency - exactly
        // reproducing the worker-timeout symptom above. maxWorkers is the
        // documented top-level replacement; see
        // https://vitest.dev/guide/migration#pool-rework.
        pool: "forks",
        maxWorkers: 1,
        testTimeout: 20000,
        hookTimeout: 20000,
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: [
                "src/utils/**",
                "src/context/**",
                "src/hooks/**",
                "src/components/TrackingWidget.jsx",
                "src/components/DeliveryStatusTimeline.jsx",
                "src/pages/Cart.jsx",
                "src/pages/Checkout.jsx",
                "src/pages/Login.jsx",
                "src/pages/OrderTrackingPage.jsx"
            ]
        }
    }
});
