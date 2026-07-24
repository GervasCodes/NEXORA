const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const upload = require("../../middleware/upload.middleware");
const uploadVideo = require("../../middleware/uploadVideo.middleware");
const uploadAudio = require("../../middleware/uploadAudio.middleware");
const { createProductValidation } = require("./product.validator");

const productController = require("./product.controller");

// Public
router.get("/", productController.listProducts);

// Must come before "/:slug" - otherwise "filters" would be matched as a
// product slug instead.
router.get("/filters/sellers", productController.listFilterSellers);
router.get("/filters/regions", productController.listFilterRegions);

router.get("/:slug", productController.getProductBySlug);

router.post(
    "/",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    createProductValidation,
    productController.createProduct
);

router.post(
    "/:id/images",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    upload.single("image"),
    productController.uploadProductImage
);

router.post(
    "/:id/videos",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    uploadVideo.single("video"),
    productController.uploadProductVideo
);

router.post(
    "/:id/audio",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    uploadAudio.single("audio"),
    productController.uploadProductAudio
);

router.get(
    "/mine/list",
    authMiddleware,
    authorize("seller"),
    productController.getMyProducts
);

router.get(
    "/mine/:id",
    authMiddleware,
    authorize("seller"),
    productController.getMyProductById
);

router.put(
    "/:id",
    authMiddleware,
    authorize("seller"),
    productController.updateProduct
);

router.put(
    "/:id/deactivate",
    authMiddleware,
    authorize("seller"),
    productController.deactivateMyProduct
);

router.put(
    "/:id/activate",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    productController.activateMyProduct
);

module.exports = router;