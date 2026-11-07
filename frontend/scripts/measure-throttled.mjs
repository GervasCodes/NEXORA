#!/usr/bin/env node
// Throttled-profile performance measurement: loads key pages in Chromium
// under a slow-3G-class network + 4x CPU slowdown and reports LCP, total
// JavaScript transferred, and CLS per page.
//
//   npm run build
//   npm run measure:throttled
//
// Env:
//   BASE_URL         target (default http://localhost:4173; if nothing is
//                    listening there the script starts `vite preview`)
//   PAGES            comma-separated paths (default "/,/products,/services,/login")
//   CHROMIUM_PATH    use a specific Chromium/Chrome binary instead of
//                    Playwright's bundled one
//   BUDGET_LCP_MS / BUDGET_JS_KB / BUDGET_CLS
//                    optional; the script exits 1 if any page exceeds one
//   REPORT_JSON      optional path to also write the results as JSON
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:4173";
const PAGES = (process.env.PAGES || "/,/products,/services,/login").split(",").map((p) => p.trim()).filter(Boolean);

// ~ Chrome DevTools "Slow 3G"/"Fast 3G" midpoint (400 Kbps down, 400 ms RTT).
const NETWORK = { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 };
const CPU_SLOWDOWN = 4;
const SETTLE_MS = 3000; // extra time after load for late LCP candidates / layout shifts

const budget = {
    lcp: process.env.BUDGET_LCP_MS ? Number(process.env.BUDGET_LCP_MS) : null,
    jsKb: process.env.BUDGET_JS_KB ? Number(process.env.BUDGET_JS_KB) : null,
    cls: process.env.BUDGET_CLS ? Number(process.env.BUDGET_CLS) : null
};

const isUp = async (url) => {
    try {
        await fetch(url, { signal: AbortSignal.timeout(2000) });
        return true;
    } catch {
        return false;
    }
};

const startPreviewIfNeeded = async () => {
    if (await isUp(BASE_URL)) return null;
    const port = new URL(BASE_URL).port || "4173";
    const child = spawn("npm", ["run", "preview", "--", "--port", port, "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
    for (let i = 0; i < 30; i++) {
        if (await isUp(BASE_URL)) return child;
        await new Promise((r) => setTimeout(r, 1000));
    }
    child.kill();
    throw new Error(`Could not reach ${BASE_URL}. Run "npm run build" first.`);
};

// Runs in the page before any app code: record LCP and CLS as they happen.
const observerInit = () => {
    window.__perf = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
};

const measure = async (browser, path) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript(observerInit);

    const client = await context.newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    await client.send("Network.emulateNetworkConditions", NETWORK);
    await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

    // Compressed bytes on the wire for every script, via CDP (page-side
    // PerformanceResourceTiming can't see cross-origin sizes).
    const scripts = new Map();
    client.on("Network.responseReceived", (e) => {
        if (e.type === "Script") scripts.set(e.requestId, 0);
    });
    client.on("Network.loadingFinished", (e) => {
        if (scripts.has(e.requestId)) scripts.set(e.requestId, e.encodedDataLength);
    });

    await page.goto(new URL(path, BASE_URL).href, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(SETTLE_MS);
    // LCP is finalised on first input / page hide - a tap makes the browser stop updating it.
    await page.mouse.click(5, 5).catch(() => {});

    const { lcp, cls } = await page.evaluate(() => window.__perf);
    const jsBytes = [...scripts.values()].reduce((a, b) => a + b, 0);
    await context.close();
    return { path, lcpMs: Math.round(lcp), jsKb: Math.round((jsBytes / 1024) * 10) / 10, cls: Math.round(cls * 1000) / 1000 };
};

const main = async () => {
    const preview = await startPreviewIfNeeded();
    const executablePath = process.env.CHROMIUM_PATH || undefined;
    const browser = await chromium.launch({ executablePath });
    const results = [];
    try {
        for (const path of PAGES) results.push(await measure(browser, path));
    } finally {
        await browser.close();
        if (preview) preview.kill();
    }

    console.log(`\nThrottled profile: ${NETWORK.latency} ms RTT, ${Math.round((NETWORK.downloadThroughput * 8) / 1024)} Kbps, ${CPU_SLOWDOWN}x CPU slowdown, cache disabled\n`);
    console.table(results.map((r) => ({ page: r.path, "LCP (ms)": r.lcpMs, "JS (KB, transferred)": r.jsKb, CLS: r.cls })));

    if (process.env.REPORT_JSON) writeFileSync(process.env.REPORT_JSON, JSON.stringify(results, null, 2));

    const failures = results.flatMap((r) => [
        budget.lcp !== null && r.lcpMs > budget.lcp ? `${r.path}: LCP ${r.lcpMs} ms > ${budget.lcp} ms` : null,
        budget.jsKb !== null && r.jsKb > budget.jsKb ? `${r.path}: JS ${r.jsKb} KB > ${budget.jsKb} KB` : null,
        budget.cls !== null && r.cls > budget.cls ? `${r.path}: CLS ${r.cls} > ${budget.cls}` : null
    ]).filter(Boolean);
    if (failures.length) {
        console.error("\nBudget exceeded:\n" + failures.map((f) => "  - " + f).join("\n"));
        process.exit(1);
    }
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
