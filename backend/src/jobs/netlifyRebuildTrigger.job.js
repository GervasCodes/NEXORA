// Round 6 Phase 2 (SEO - dynamic-route prerendering).
//
// frontend/scripts/prerender-shells.mjs now writes a real shell for
// every product/service/store page, but it only runs at build time -
// on static hosting (Netlify) there's no per-request render, so a
// shell is only as fresh as the last deploy. NEXORA's catalog changes
// constantly (new listings, price/stock updates), so without this job
// a shell could go stale for however long it is between deploys -
// which, once a release has shipped and nothing else changes, could be
// days.
//
// This just calls a Netlify build hook URL (a plain POST, no auth
// beyond the URL itself being secret - see Netlify's own docs) on a
// schedule, which asks Netlify to rebuild+redeploy the frontend from
// the latest commit on its connected branch. That re-runs `vite build`
// and this job's own trigger reason (the prerender script) with fresh
// DB data. No-op (skipped, logged once at startup) if
// NETLIFY_BUILD_HOOK_URL isn't configured, so this is safe to ship
// before that's set up.
const logger = require("../utils/logger").child({ module: "job:netlifyRebuildTrigger" });

const BUILD_HOOK_URL = process.env.NETLIFY_BUILD_HOOK_URL || "";

exports.run = async () => {
    if (!BUILD_HOOK_URL) {
        logger.debug("NETLIFY_BUILD_HOOK_URL not set - skipping rebuild trigger");
        return;
    }

    const res = await fetch(BUILD_HOOK_URL, { method: "POST" });
    if (!res.ok) {
        throw new Error(`Netlify build hook responded ${res.status}`);
    }
    logger.info("triggered a Netlify rebuild to refresh dynamic SEO shells");
};
