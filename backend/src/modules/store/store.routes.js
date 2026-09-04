const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const storeController = require("./store.controller");

// Public store profile page - no auth, mirrors product.routes' public
// "/:slug" pattern. Nothing else lives under /api/v1/stores yet, so
// there's no risk of "/:slug" swallowing a more specific route the way
// product.routes.js has to guard against with its "/filters/*" routes -
// worth remembering if a later 5-series phase adds one (e.g. a search or
// listing endpoint) ahead of this route.
// Phase 7C - must come before "/:slug" for the same reason product.routes'
// "/filters/*" routes do - otherwise "/:slug" would swallow this path with
// "collections" captured as part of a two-segment slug it was never meant
// to match. Not actually ambiguous here since this is a two-segment path
// ("/:slug/collections") and "/:slug" only matches one segment, but kept
// above it anyway to read the same way that established precedent does.
// Phase 3 (UI/UX remediation) - store search for the global search box,
// the exact "search or listing endpoint" this file's own top comment
// anticipated needing to sit ahead of "/:slug". Mounted first for that
// reason, even though in practice "/" and "/:slug" wouldn't actually
// collide (a param route requires a segment; "/" has none) - kept
// consistent with how "/:slug/collections" already documents the same
// ordering caution above.
router.get("/", storeController.search);

router.get("/:slug/collections", storeController.getStoreCollections);

// Store follows (Phase 6, UI/UX remediation) - same "extra path segment
// past /:slug, no ordering ambiguity" reasoning as /:slug/collections
// above.
router.get("/:slug/follow-status", authMiddleware, authorize("buyer"), storeController.getFollowStatus);
router.post("/:slug/follow", authMiddleware, authorize("buyer"), storeController.follow);
router.delete("/:slug/follow", authMiddleware, authorize("buyer"), storeController.unfollow);

router.get("/:slug", storeController.getStoreProfile);

module.exports = router;
