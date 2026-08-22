const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const supportController = require("./support.controller");
const {
    createTicketValidation,
    ticketIdValidation,
    replyValidation,
    setStatusValidation
} = require("./support.validator");

router.use(authMiddleware);

// --- Admin (mounted before the shared "/:id" routes - same reasoning
// as dispute.routes.js/return.routes.js: admin list endpoints must never
// be mistaken for a numeric ticket id) ---
router.get("/admin", authorize("admin"), supportController.listAll);
router.put("/admin/:id/status", authorize("admin"), setStatusValidation, validationMiddleware, supportController.setStatus);

// --- Any authenticated user (buyer, seller, delivery agent) ---
router.get("/", supportController.getMyTickets);
router.post("/", createTicketValidation, validationMiddleware, supportController.createTicket);

// --- Shared (owner or admin - support.service.js enforces per-ticket access) ---
router.get("/:id", ticketIdValidation, validationMiddleware, supportController.getTicket);
router.post("/:id/reply", replyValidation, validationMiddleware, supportController.reply);

module.exports = router;
