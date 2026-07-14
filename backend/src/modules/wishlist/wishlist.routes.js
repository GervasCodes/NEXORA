const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const wishlistController = require("./wishlist.controller");

router.use(authMiddleware, authorize("buyer"));

router.get("/", wishlistController.getSaved);
router.get("/ids", wishlistController.getIds);
router.post("/:productId", wishlistController.add);
router.delete("/:productId", wishlistController.remove);

module.exports = router;
