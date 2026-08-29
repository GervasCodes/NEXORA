const express = require("express");
const router = express.Router();

const smsController = require("./sms.controller");
const { verifySmsWebhook } = require("../../middleware/webhookAuth.middleware");

// Verified via a shared-secret header + payload-hash replay dedup (see
// webhookAuth.middleware.js#verifySmsWebhook) rather than a body/HMAC
// signature - unlike the WhatsApp Cloud API webhook, most SMS gateways
// (including Beem Africa) don't document a per-request signature for
// inbound callbacks, only a custom header/token you configure on their
// dashboard's callback URL settings. No raw-body parsing needed here as
// a result - this goes through the normal express.json() body parser,
// unlike the WhatsApp/payment webhooks mounted directly in app.js.
router.post("/webhook", verifySmsWebhook, smsController.receiveMessage);

module.exports = router;
