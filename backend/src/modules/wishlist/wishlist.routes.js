const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const maintenanceCheck = require("../../middleware/maintenance.middleware");
const wishlistController = require("./wishlist.controller");

router.use(authMiddleware, authorize("buyer"));
router.use(maintenanceCheck("wishlist"));

router.get("/", wishlistController.getSaved);
router.get("/ids", wishlistController.getIds);
router.post("/:productId", wishlistController.add);
router.delete("/:productId", wishlistController.remove);

// Services (Phase 5, UI/UX remediation) - separate /services/:serviceId
// path rather than overloading /:productId, since a route param alone
// can't tell a product id from a service id (both are just integers) -
// this way there's no ambiguity about which table a given id refers to.
router.get("/services", wishlistController.getSavedServices);
router.post("/services/:serviceId", wishlistController.addService);
router.delete("/services/:serviceId", wishlistController.removeService);

module.exports = router;
