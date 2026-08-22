const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const loanController = require("./loan.controller");
const { requestLoanValidation } = require("./loan.validator");

router.use(authMiddleware, authorize("seller"));

router.get("/eligibility", loanController.getEligibility);
router.get("/", loanController.getMyLoans);
router.post("/", requestLoanValidation, validationMiddleware, loanController.requestLoan);

module.exports = router;
