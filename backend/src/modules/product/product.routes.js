const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const upload = require("../../middleware/upload.middleware");
const { createProductValidation } = require("./product.validator");

const productController = require("./product.controller");

// Public
router.get("/", productController.listProducts);
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