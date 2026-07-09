const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const adminController = require("./admin.controller");
const { userIdValidation, productIdValidation } = require("./admin.validator");

router.use(authMiddleware, authorize("admin"));

router.get("/dashboard", adminController.getDashboard);

router.get("/users", adminController.listUsers);
router.put("/users/:id/deactivate", userIdValidation, validationMiddleware, adminController.deactivateUser);
router.put("/users/:id/activate", userIdValidation, validationMiddleware, adminController.activateUser);

router.get("/sellers", adminController.listSellers);
router.put("/sellers/:id/verify", userIdValidation, validationMiddleware, adminController.verifySeller);
router.put("/sellers/:id/unverify", userIdValidation, validationMiddleware, adminController.unverifySeller);

router.get("/products", adminController.listProducts);
router.put("/products/:id/deactivate", productIdValidation, validationMiddleware, adminController.deactivateProduct);
router.put("/products/:id/activate", productIdValidation, validationMiddleware, adminController.activateProduct);

router.get("/orders", adminController.listOrders);

module.exports = router;
