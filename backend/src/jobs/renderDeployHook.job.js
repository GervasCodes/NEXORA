// Round 6 Phase 2 (SEO - dynamic-route prerendering). Renamed from
// netlifyRebuildTrigger.job.js (NEXORA's frontend - and backend - now
// both run on Render, not Netlify).
//
// frontend/scripts/prerender-shells.mjs writes a real shell for every
// product/service/store page, but it only runs at build time - on
// static hosting there's no per-request render, so a shell is only as
// fresh as the last deploy. NEXORA's catalog changes constantly (new
// listings, price/stock updates), so without this job a shell could go
// stale for however long it is between deploys - which, once a release
// has shipped and nothing else changes, could be days.
//
// This just calls the frontend static site's Render deploy hook URL (a
// plain GET/POST, no auth beyond the URL itself being secret - see
// Render's own deploy-hooks docs) on a schedule, which asks Render to
// rebuild+redeploy the frontend from the latest commit on its connected
// branch. That re-runs `vite build` and this job's own trigger reason
// (the prerender script) with fresh DB data. No-op (skipped, logged
// once at startup) if RENDER_DEPLOY_HOOK_URL isn't configured, so this
// is safe to ship before that's set up.
const logger = require("../utils/logger").child({ module: "job:renderDeployHook" });

const DEPLOY_HOOK_URL = process.env.RENDER_DEPLOY_HOOK_URL || "";

exports.run = async () => {
    if (!DEPLOY_HOOK_URL) {
        logger.debug("RENDER_DEPLOY_HOOK_URL not set - skipping rebuild trigger");
        return;
    }

    const res = await fetch(DEPLOY_HOOK_URL, { method: "POST" });
    if (!res.ok) {
        throw new Error(`Render deploy hook responded ${res.status}`);
    }
    logger.info("triggered a Render deploy to refresh dynamic SEO shells");
};
