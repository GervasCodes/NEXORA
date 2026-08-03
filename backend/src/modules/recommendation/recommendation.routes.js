const express = require("express");
const router = express.Router();

const recommendationController = require("./recommendation.controller");

// Both public - personalize automatically if a valid buyer token is
// present (see recommendation.controller.js#getOptionalBuyerId), fall
// back to trending otherwise.
router.get("/for-me", recommendationController.getForMe);
router.get("/related/:slug", recommendationController.getRelated);

module.exports = router;
