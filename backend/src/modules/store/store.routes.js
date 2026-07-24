const express = require("express");
const router = express.Router();

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
router.get("/:slug/collections", storeController.getStoreCollections);

router.get("/:slug", storeController.getStoreProfile);

module.exports = router;
