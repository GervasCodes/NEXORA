#!/usr/bin/env node
/**
 * backend/scripts/check-broken-links.js
 *
 * Phase 4 (SEO Supporting, Task 1 — broken-link check).
 *
 * A one-time (or manually-rerun) crawl, NOT wired into the running app,
 * a cron job, or CI. Run it by hand from the repo root:
 *
 *   node backend/scripts/check-broken-links.js --sitemap https://your-backend-api-domain.example/sitemap.xml
 *   node backend/scripts/check-broken-links.js --sitemap ./sitemap.xml
 *
 * WHAT THIS DOES
 * --------------
 * 1. Fetches a sitemap (a live URL, or a local file) — the same
 *    backend-generated sitemap.xml from Phase 1
 *    (backend/src/modules/sitemap/sitemap.service.js).
 * 2. Requests every <loc> URL with HEAD (falling back to GET if the
 *    server rejects HEAD — some hosts do) and records anything that
 *    isn't a 2xx or a same-origin 3xx redirect chain ending in 2xx.
 * 3. Prints a plain-text report and exits 1 if anything broke, 0
 *    otherwise, so this CAN be wired into a CI job later if wanted —
 *    deliberately not done in this phase, per the phase's own
 *    instruction that this stays a dev-only script, not part of the
 *    running app.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * -----------------------------------
 * It does not crawl the rendered single-page app. frontend/index.html is
 * one empty shell served for every route (see frontend/public/_redirects
 * — a Vite SPA), so a plain HTTP fetch of any app URL returns that same
 * shell's markup, not the page's actual rendered links. A real crawl of
 * "does every in-app link go somewhere real" needs a tool that runs an
 * actual browser (Puppeteer/Playwright) or an external service.
 *
 * This script's job is the cheap, dependency-free half of that problem:
 * confirming every URL the SITEMAP PROMISES actually resolves. That
 * already covers the case search engines care about (Google reads the
 * sitemap, not your React internals) and the most common real failure
 * mode (a product/service/store that got deactivated or renamed after
 * being indexed, so its sitemap entry now 404s).
 *
 * For a full rendered-DOM crawl, see "Recommended external tool" in
 * PHASE_4_NOTES.md.
 *
 * NO NEW DEPENDENCY: uses the global `fetch` built into Node 18+
 * (backend/package.json already requires "node": ">=18"), not a new
 * package.
 *
 * Exit codes: 0 = every URL resolved cleanly. 1 = at least one did not,
 * or the sitemap itself could not be fetched/parsed. 2 = bad CLI usage.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 10_000;

function parseArgs(argv) {
    const args = { concurrency: DEFAULT_CONCURRENCY, timeoutMs: DEFAULT_TIMEOUT_MS };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--sitemap') args.sitemap = argv[++i];
        else if (arg === '--concurrency') args.concurrency = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_CONCURRENCY);
        else if (arg === '--timeout') args.timeoutMs = Math.max(1000, parseInt(argv[++i], 10) || DEFAULT_TIMEOUT_MS);
        else if (arg === '--help' || arg === '-h') args.help = true;
    }
    return args;
}

function printUsage() {
    console.log(`
Usage:
  node backend/scripts/check-broken-links.js --sitemap <url-or-path> [options]

Options:
  --sitemap <url-or-path>   Required. A sitemap.xml URL (https://...) or a
                             local file path.
  --concurrency <n>         How many URLs to check at once (default: ${DEFAULT_CONCURRENCY}).
  --timeout <ms>            Per-request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS}).
  --help                    Show this message.

Examples:
  node backend/scripts/check-broken-links.js --sitemap https://your-backend-api-domain.example/sitemap.xml
  node backend/scripts/check-broken-links.js --sitemap ./sitemap.xml --concurrency 4
`);
}

// Minimal <loc>...</loc> extraction. A full XML parser is overkill for a
// sitemap this shape — see sitemap.service.js, which writes each entry
// as a plain <url><loc>...</loc><lastmod>...</lastmod></url> block with
// no attributes, namespaces beyond the root <urlset>, or CDATA sections.
// If that ever changes (image sitemaps, alternate-language <xhtml:link>
// entries, etc.), swap this for a real parser — grepping XML with a
// regex stops being safe once the shape gets more nested.
function extractLocs(xml) {
    const matches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
    return matches.map((m) => m.slice(5, -6).trim());
}

async function loadSitemap(source) {
    if (/^https?:\/\//i.test(source)) {
        const res = await fetch(source);
        if (!res.ok) {
            throw new Error(`Could not fetch sitemap (HTTP ${res.status}) from ${source}`);
        }
        return res.text();
    }

    const filePath = path.resolve(process.cwd(), source);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Sitemap file not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf8');
}

// One URL check. HEAD first (cheaper — no response body to discard),
// falling back to GET on a 405/501, since a couple of hosting setups
// reject HEAD outright even when the resource is fine. `redirect:
// "follow"` means fetch itself resolves a redirect chain, so a 301/302
// that lands on a working page reports as OK, not broken — only a
// terminal non-2xx (or a chain that never resolves) counts as a failure.
async function checkUrl(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });

        if (res.status === 405 || res.status === 501) {
            res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
        }

        return { url, ok: res.ok, status: res.status, finalUrl: res.url };
    } catch (error) {
        const reason = error.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : error.message;
        return { url, ok: false, status: null, error: reason };
    } finally {
        clearTimeout(timer);
    }
}

// Simple fixed-size worker pool — no queue library needed for a list
// this size (a sitemap here is at most a few thousand URLs; a proper
// job queue would be solving a problem this script doesn't have).
async function checkAll(urls, concurrency, timeoutMs) {
    const results = new Array(urls.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < urls.length) {
            const i = nextIndex++;
            results[i] = await checkUrl(urls[i], timeoutMs);
            const r = results[i];
            const marker = r.ok ? 'OK  ' : 'FAIL';
            const detail = r.ok ? r.status : (r.error || r.status);
            console.log(`${marker} ${detail}  ${urls[i]}`);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, urls.length) }, worker);
    await Promise.all(workers);
    return results;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help || !args.sitemap) {
        printUsage();
        process.exit(args.help ? 0 : 2);
    }

    console.log(`Fetching sitemap: ${args.sitemap}`);
    let xml;
    try {
        xml = await loadSitemap(args.sitemap);
    } catch (error) {
        console.error(`\n✗ ${error.message}`);
        process.exit(1);
    }

    const urls = extractLocs(xml);
    if (urls.length === 0) {
        console.error('\n✗ No <loc> entries found — is this really a sitemap.xml?');
        process.exit(1);
    }

    console.log(`Found ${urls.length} URL(s). Checking with concurrency ${args.concurrency}...\n`);

    const results = await checkAll(urls, args.concurrency, args.timeoutMs);
    const broken = results.filter((r) => !r.ok);

    console.log(`\n${'-'.repeat(60)}`);
    console.log(`${results.length - broken.length}/${results.length} URLs OK`);

    if (broken.length > 0) {
        console.log(`\n${broken.length} broken link(s):\n`);
        broken.forEach((r) => {
            console.log(`  ${r.url}`);
            console.log(`    -> ${r.error || `HTTP ${r.status}`}`);
        });
        process.exit(1);
    }

    console.log('\nNo broken links found.');
    process.exit(0);
}

main();
