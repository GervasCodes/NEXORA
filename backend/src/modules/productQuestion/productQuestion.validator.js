const { body, param } = require("express-validator");

exports.productIdValidation = [
    param("productId").isInt({ gt: 0 }).withMessage("Invalid product")
];

exports.questionIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid question")
];

exports.askValidation = [
    body("question")
        .trim()
        .notEmpty()
        .withMessage("Enter a question")
        .isLength({ max: 500 })
        .withMessage("Question is too long (max 500 characters)")
];

exports.answerValidation = [
    body("answer")
        .trim()
        .notEmpty()
        .withMessage("Enter an answer")
        .isLength({ max: 1000 })
        .withMessage("Answer is too long (max 1000 characters)")
];
