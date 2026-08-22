const { body, param } = require("express-validator");
const returnServiceReasons = ["damaged_item", "wrong_item", "defective_product", "not_as_described", "changed_mind", "other"];

exports.createReturnValidation = [
    body("order_id").isInt({ gt: 0 }).withMessage("Invalid order"),
    body("order_item_id").optional({ nullable: true }).isInt({ gt: 0 }).withMessage("Invalid order item"),
    body("reason").isIn(returnServiceReasons).withMessage("Invalid return reason"),
    body("description").optional({ nullable: true }).isLength({ max: 2000 }).withMessage("Description is too long")
];

exports.returnIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid return")
];

exports.shippedBackValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid return"),
    body("tracking_number").notEmpty().withMessage("A tracking number is required"),
    body("carrier").optional({ nullable: true }).isLength({ max: 100 })
];

exports.rejectReturnValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid return"),
    body("reason").notEmpty().withMessage("A rejection reason is required")
];
