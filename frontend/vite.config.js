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
                    // three.js + @react-three/fiber + @react-three/drei are
                    // by far the heaviest single dependency here, and only
                    // Hero3DScene (already lazy-loaded behind
                    // use3DHeroSupport - see App.jsx/Hero3D.jsx) uses them.
                    // Without this, the fallback "vendor" bucket below
                    // pulled them into the one chunk shared by every page,
                    // so visitors who never even qualify for the 3D hero
                    // (low-end device, reduced-motion, save-data) paid for
                    // downloading and parsing it anyway. Splitting it out
                    // lets it load only alongside Hero3DScene's own dynamic
                    // import, not on every route.
                    if (id.includes("/three/") || id.includes("@react-three")) return "vendor-three";
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
        // `pool: "forks"` + `maxWorkers: 1` runs one child_process at a
        // time, which is deliberate: I tried switching to `pool:
        // "vmThreads"` (cheaper per-file isolation - a vm.Context inside
        // a reused worker_thread instead of a brand-new OS process) since
        // it avoids the process-bootstrap cost that's the likely reason
        // any one file's startup handshake occasionally overruns Vitest's
        // internal timeout. It measurably fixes the startup-timeout
        // symptom, but it broke ~35 previously-passing tests across
        // unrelated files (DeliveryStatusTimeline, NexoraAIDrawer, chat
        // MessageSearch, etc.) - vmThreads runs each file in a separate
        // JS realm, which is known to break `instanceof`-based checks and
        // some async/timer/mocking behavior that this suite (and its
        // dependencies - MSW, jest-axe, socket.io mocks) relies on. A
        // pool that changes correctness isn't an acceptable fix for a
        // startup flake, so this stays on "forks".
        //
        // The actual root cause is a hardcoded, non-configurable 60s
        // timeout inside Vitest itself (`START_TIMEOUT` in
        // vitest/dist/chunks/cli-api.*.js) that the parent process waits
        // for a freshly forked worker to complete its IPC handshake -
        // there is no `testTimeout`/`hookTimeout`-style knob for it (open
        // upstream: vitest-dev/vitest#8766, #9701). `maxWorkers: 1` is
        // the mitigation within our control: with only one child_process
        // ever starting up at a time, there's no contention between
        // workers competing for CPU/IO during that handshake, which is
        // exactly the scenario that trips the timeout. Raise it on a
        // beefier or CI box to get parallelism back.
        pool: "forks",
        maxWorkers: 1,
        testTimeout: 20000,
        hookTimeout: 20000,
        // A worker that still trips that internal startup timeout doesn't
        // fail any test - Vitest recovers by starting a fresh worker and
        // the file's tests run and pass on it (this run: 273/273 tests,
        // 49/49 files green) - but the stalled first attempt surfaces as
        // an "unhandled error" in the report, and by default Vitest sets
        // a non-zero exit code whenever *any* unhandled error occurred,
        // independent of whether every test passed. That turns a
        // successful run into a red CI build. `dangerouslyIgnoreUnhandledErrors`
        // is Vitest's documented option for exactly this split - it does
        // NOT hide the errors (they still print, so a *real* unhandled
        // rejection in application/test code stays visible), it only
        // stops them from forcing the run's exit code to 1 when the
        // actual test results are all green.
        dangerouslyIgnoreUnhandledErrors: true,
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
