const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const whatsappController = require("./whatsapp.controller");

// The GET verify challenge and POST inbound-message webhook are NOT
// here - they need express.raw() wired before express.json() for
// X-Hub-Signature-256 verification (see webhookAuth.middleware.js and
// app.js's Snippe/MalipoPay Card webhooks for the same requirement),
// so they're registered directly in app.js instead of through this
// router.

router.use(authMiddleware);
router.put("/opt-in", whatsappController.setOptIn);

module.exports = router;
