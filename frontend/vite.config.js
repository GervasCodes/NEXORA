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
        // Vitest's default pool spawns a worker per available CPU core.
        // On a resource-constrained machine (low RAM/CPU headroom, AV
        // scanning every worker process, etc.) that can produce
        // "Timeout waiting for worker to respond" / "Failed to start
        // forks worker" errors partway through a run, especially once
        // ~35+ jsdom environments have been created back to back - not
        // a bug in the tests themselves (every file here passes fine
        // when run with fewer concurrent workers). Capping concurrency
        // trades a bit of wall-clock time for reliability; raise or
        // remove this if you're running on a beefier CI box.
        poolOptions: {
            forks: {
                maxForks: 2
            }
        },
        testTimeout: 15000,
        hookTimeout: 15000,
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
