const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireProductProvider = require("../../middleware/requireProductProvider.middleware");
const upload = require("../../middleware/upload.middleware");
const uploadVideo = require("../../middleware/uploadVideo.middleware");
const limitConcurrency = require("../../middleware/limitConcurrency.middleware");
const { MAX_CONCURRENT_VIDEO_UPLOADS } = require("../../config/mediaLimits");
const videoUploadSlots = limitConcurrency(MAX_CONCURRENT_VIDEO_UPLOADS);
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
    "/draft",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    productController.createDraft
);

router.put(
    "/draft/:id",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    productController.saveDraft
);

router.post(
    "/draft/:id/publish",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireProductProvider,
    productController.publishDraft
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
    videoUploadSlots,
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

// Phase 5: one gallery for photos and videos, uploaded straight to Cloudinary.
const mediaController = require("./productMedia.controller");
const { mediaSignValidation, mediaRegisterValidation, mediaOrderValidation } = require("./product.validator");
const sellerMediaGuards = [authMiddleware, authorize("seller"), requireApprovedSeller, requireProductProvider];

router.get("/:id/media", ...sellerMediaGuards, mediaController.list);
router.post("/:id/media/sign", ...sellerMediaGuards, mediaSignValidation, mediaController.sign);
router.post("/:id/media", ...sellerMediaGuards, mediaRegisterValidation, mediaController.register);
router.put("/:id/media/order", ...sellerMediaGuards, mediaOrderValidation, mediaController.reorder);
router.delete("/:id/media/:mediaId", ...sellerMediaGuards, mediaController.remove);

// Phase 4: product audio was removed. Old clients get a clear 410 Gone for
// two releases instead of a confusing 404/validation error. (Chat voice
// notes are a separate feature and are untouched.)
router.all(/^\/[^/]+\/audio(\/.*)?$/, (req, res) =>
    res.status(410).json({
        success: false,
        code: "PRODUCT_AUDIO_REMOVED",
        message: "Product audio has been removed. Use photos and videos instead."
    })
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

// UI/UX remediation - bulk price adjustment.
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