const { body, param } = require("express-validator");

exports.createValidation = [
    body("title").notEmpty().isLength({ max: 200 }).withMessage("Title is required (max 200 characters)"),
    body("bodyMarkdown").notEmpty().withMessage("Body is required"),
    body("categoryId").optional({ nullable: true }).isInt({ gt: 0 }),
    body("excerpt").optional({ nullable: true }).isLength({ max: 300 }),
    body("seoMetaDescription").optional({ nullable: true }).isLength({ max: 300 })
];

exports.idValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid article")
];

exports.setStatusValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid article"),
    body("status").isIn(["draft", "published"]).withMessage("Invalid status")
];
