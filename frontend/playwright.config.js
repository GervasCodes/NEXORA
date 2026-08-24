// @ts-check
import { defineConfig, devices } from "@playwright/test";

// (Testing & Session Hardening): visual snapshot coverage for a
// curated set of critical pages and breakpoints - Home, Checkout,
// ProductDetail, each at mobile and desktop. Deliberately curated, not
// exhaustive - visual regression suites get expensive to maintain fast
// if every page is covered; these three are the pages a rendering
// regression would be most costly on (highest-traffic entry point,
// the page where money changes hands, and the page most often shared/
// linked to externally per Phase 2's OG work).
export default defineConfig({
    testDir: "./e2e",
    snapshotDir: "./e2e/__snapshots__",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: [["html", { open: "never" }], ["list"]],

    use: {
        baseURL: "http://localhost:5173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    },

    // Runs `npm run preview` (a production build, not the dev server) so
    // snapshots reflect what actually ships, not Vite's dev-mode
    // behavior (HMR overlay, unminified output, etc). Requires `npm run
    // build` to have been run first - see the README in this directory.
    webServer: {
        command: "npm run preview -- --port 5173",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    },

    projects: [
        {
            name: "desktop",
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
        },
        {
            name: "mobile",
            use: { ...devices["iPhone 13"] }
        }
    ],

    // Visual diffs are inherently a little noisy (anti-aliasing,
    // sub-pixel font rendering differences between machines) - a small
    // tolerance avoids false failures on genuinely-unchanged pages
    // without hiding real regressions.
    expect: {
        toHaveScreenshot: { maxDiffPixelRatio: 0.02 }
    }
});
