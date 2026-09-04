const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const productQuestionController = require("./productQuestion.controller");
const {
    productIdValidation,
    questionIdValidation,
    askValidation,
    answerValidation
} = require("./productQuestion.validator");

// Public - anyone (including guests) can read a product's Q&A, same as
// product listings and reviews already are.
router.get("/products/:productId/questions", productIdValidation, validationMiddleware, productQuestionController.list);

router.post(
    "/products/:productId/questions",
    authMiddleware,
    authorize("buyer"),
    productIdValidation,
    askValidation,
    validationMiddleware,
    productQuestionController.ask
);

router.post(
    "/questions/:id/answer",
    authMiddleware,
    authorize("seller"),
    questionIdValidation,
    answerValidation,
    validationMiddleware,
    productQuestionController.answer
);

module.exports = router;
