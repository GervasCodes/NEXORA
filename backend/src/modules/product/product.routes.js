const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireProductProvider = require("../../middleware/requireProductProvider.middleware");
const upload = require("../../middleware/upload.middleware");
const uploadVideo = require("../../middleware/uploadVideo.middleware");
const uploadAudio = require("../../middleware/uploadAudio.middleware");
const { createProductValidation, bulkProductStatusValidation, bulkProductPriceValidation, reorderMediaValidation } = require("./product.validator");

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

router.delete(
    "/:id/images/:imageId",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    productController.deleteProductImage
);

router.put(
    "/:id/images/:imageId/primary",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    productController.setPrimaryProductImage
);

router.put(
    "/:id/images/reorder",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    reorderMediaValidation,
    productController.reorderProductImages
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

router.delete(
    "/:id/videos/:videoId",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    productController.deleteProductVideo
);

router.put(
    "/:id/videos/reorder",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    reorderMediaValidation,
    productController.reorderProductVideos
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

router.delete(
    "/:id/audio/:audioId",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    productController.deleteProductAudio
);

router.put(
    "/:id/audio/reorder",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    reorderMediaValidation,
    productController.reorderProductAudio
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

// Phase 11 (UI/UX remediation) - bulk price adjustment.
router.put(
    "/bulk/price",
    authMiddleware,
    authorize("seller"),
    requireProductProvider,
    bulkProductPriceValidation,
    productController.bulkProductPrice
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