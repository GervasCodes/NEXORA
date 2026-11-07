const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const uploadDocument = require("../../middleware/uploadDocument.middleware");
const businessToolsController = require("./businessTools.controller");

// Upgrade a business-tools-only account to a marketplace seller. Takes the
// same identity documents marketplace sign-up does.
router.post(
    "/convert",
    authMiddleware,
    authorize("seller"),
    uploadDocument.fields([
        { name: "owner_photo", maxCount: 1 },
        { name: "national_id", maxCount: 1 },
        { name: "voter_id", maxCount: 1 }
    ]),
    businessToolsController.convert
);

module.exports = router;
