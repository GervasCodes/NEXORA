const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireProductProvider = require("../../middleware/requireProductProvider.middleware");
const upload = require("../../middleware/upload.middleware");
const uploadVideo = require("../../middleware/uploadVideo.middleware");
const uploadAudio = require("../../middleware/uploadAudio.middleware");
const { createProductValidation, bulkProductStatusValidation } = require("./product.validator");

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
    requireProductProvider,
    createProductValidation,
    productController.createProduct
);

router.post(
    "/:id/images",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    upload.single("image"),
    productController.uploadProductImage
);

router.post(
    "/:id/videos",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    uploadVideo.single("video"),
    productController.uploadProductVideo
);

router.post(
    "/:id/audio",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    uploadAudio.single("audio"),
    productController.uploadProductAudio
);

router.get(
    "/mine/list",
    authMiddleware,
    authorize("seller"),
    requireProductProvider,
    productController.getMyProducts
);

router.put(
    "/bulk/status",
    authMiddleware,
    authorize("seller"),
    requireProductProvider,
    bulkProductStatusValidation,
    productController.bulkProductStatus
);

router.get(
    "/mine/:id",
    authMiddleware,
    authorize("seller"),
    requireProductProvider,
    productController.getMyProductById
);

router.put(
    "/:id",
    authMiddleware,
    authorize("seller"),
    requireProductProvider,
    productController.updateProduct
);

router.put(
    "/:id/deactivate",
    authMiddleware,
    authorize("seller"),
    requireProductProvider,
    productController.deactivateMyProduct
);

router.put(
    "/:id/activate",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    productController.activateMyProduct
);

module.exports = router;