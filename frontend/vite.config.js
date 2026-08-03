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
        emptyOutDir: true
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setupTests.js"],
        css: false,
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
