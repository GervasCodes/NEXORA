const express = require("express");
const { body, param, query } = require("express-validator");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const deliveryRatesController = require("./deliveryRates.controller");

router.use(authMiddleware, authorize("admin"));

const vehicle = (field) => body(field).isIn(["boda", "bajaj", "car"]).withMessage("Unknown vehicle type");
const idParam = param("id").isInt({ gt: 0 }).withMessage("Invalid id");

router.get("/", deliveryRatesController.getOverview);

router.get(
    "/preview",
    query("distance_km").isFloat({ gt: 0, max: 200 }),
    query("vehicle").optional().isIn(["boda", "bajaj", "car"]),
    query("region").optional().isString().isLength({ max: 60 }),
    validationMiddleware,
    deliveryRatesController.preview
);

router.post(
    "/cards",
    vehicle("vehicle_type"),
    body("fuel_product").optional().isIn(["petrol", "diesel"]),
    body("min_fee").isFloat({ min: 0, max: 10000000 }),
    body("per_km_rate").isFloat({ min: 0, max: 10000000 }),
    body("effective_from").optional({ values: "falsy" }).isISO8601(),
    validationMiddleware,
    deliveryRatesController.createCard
);

router.post(
    "/fuel",
    body("region").isString().trim().isLength({ min: 2, max: 60 }),
    body("product").isIn(["petrol", "diesel"]),
    body("cap_price").isFloat({ gt: 0, max: 100000 }),
    body("effective_from").optional({ values: "falsy" }).isISO8601(),
    validationMiddleware,
    deliveryRatesController.createFuel
);

router.put(
    "/settings",
    body("fuel_passthrough_pct").optional().isFloat({ min: 0, max: 100 }),
    body("fuel_baseline_cap").optional().isFloat({ gt: 0 }),
    body("fuel_max_monthly_change_pct").optional().isFloat({ min: 0, max: 100 }),
    body("delivery_handling_buffer_minutes").optional().isInt({ min: 0, max: 240 }),
    body("default_delivery_vehicle").optional().isIn(["boda", "bajaj", "car"]),
    body("delivery_default_region").optional().isString().trim().isLength({ min: 2, max: 60 }),
    validationMiddleware,
    deliveryRatesController.updateSettings
);

const adjustmentBody = [
    body("region").isString().trim().isLength({ min: 2, max: 60 }),
    body("label").optional({ values: "falsy" }).isString().isLength({ max: 60 }),
    body("start_hour").isInt({ min: 0, max: 24 }),
    body("end_hour").isInt({ min: 0, max: 24 }),
    body("multiplier").isFloat({ min: 0.5, max: 5 }),
    body("buffer_minutes").optional().isInt({ min: 0, max: 240 }),
    body("is_active").optional().isBoolean()
];

router.post("/eta", adjustmentBody, validationMiddleware, deliveryRatesController.createAdjustment);
router.put("/eta/:id", idParam, adjustmentBody, validationMiddleware, deliveryRatesController.updateAdjustment);
router.delete("/eta/:id", idParam, validationMiddleware, deliveryRatesController.deleteAdjustment);

module.exports = router;
