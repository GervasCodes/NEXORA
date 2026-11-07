const subscriptionService = require("./subscription.service");
const subscriptionRepository = require("./subscription.repository");
const trialService = require("./trial.service");
const paymentService = require("../payment/payment.service");
// (Security) - subscribeSnippe/subscribeMalipopayCard/subscribePaypal
// below were forwarding req.body.successUrl/cancelUrl/returnUrl straight to
// the payment provider with no validation at all, unlike every other
// redirect-accepting endpoint in payment.controller.js. That's an open
// redirect: an attacker-controlled successUrl would send a buyer's browser
// to an external site immediately after a real subscription payment
// completes. See utils/redirectValidator.js for the fix, applied below.
const { assertAllowedRedirect } = require("../../utils/redirectValidator");

exports.listPlans = async (req, res) => {
    try {
        const plans = await subscriptionService.listPlans(req.query.audience);
        res.json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getMySubscription = async (req, res) => {
    try {
        const data = await subscriptionService.getMySubscription(req.user.id);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Trial / access state for the seller banner: { inTrial, daysLeft,
// trialEndsAt, paymentMode, hasPaidPlan, ... }.
exports.getMyAccess = async (req, res) => {
    try {
        const data = await subscriptionService.getAccess(req.user.id);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Creates (or reuses) a pending subscription row for the requested plan
// and kicks off a mobile-money payment for it - mirrors
// seller.controller.js's verification-fee endpoint shape.
exports.subscribeMobileMoney = async (req, res) => {
    try {
        const { planCode, phone } = req.body;
        const plan = await subscriptionRepository.findPlanByCode(planCode);
        if (!plan || !plan.is_active) {
            return res.status(404).json({ success: false, message: "Plan not found" });
        }
        if (Number(plan.price) <= 0) {
            return res.status(400).json({ success: false, message: "This plan is free and does not require payment" });
        }

        const result = await paymentService.initiateMobileMoneySubscriptionPayment(req.user.id, plan.id, phone);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.subscribeSnippe = async (req, res) => {
    try {
        const { planCode } = req.body;
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");
        const plan = await subscriptionRepository.findPlanByCode(planCode);
        if (!plan || !plan.is_active) {
            return res.status(404).json({ success: false, message: "Plan not found" });
        }
        if (Number(plan.price) <= 0) {
            return res.status(400).json({ success: false, message: "This plan is free and does not require payment" });
        }

        const result = await paymentService.initiateSnippeSubscriptionPayment(req.user.id, plan.id, { successUrl, cancelUrl });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.subscribeMalipopayCard = async (req, res) => {
    try {
        const { planCode } = req.body;
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");
        const plan = await subscriptionRepository.findPlanByCode(planCode);
        if (!plan || !plan.is_active) {
            return res.status(404).json({ success: false, message: "Plan not found" });
        }
        if (Number(plan.price) <= 0) {
            return res.status(400).json({ success: false, message: "This plan is free and does not require payment" });
        }

        const result = await paymentService.initiateMalipopayCardSubscriptionPayment(req.user.id, plan.id, { successUrl, cancelUrl });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.subscribePaypal = async (req, res) => {
    try {
        const { planCode } = req.body;
        const returnUrl = assertAllowedRedirect(req.body.returnUrl, "returnUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");
        const plan = await subscriptionRepository.findPlanByCode(planCode);
        if (!plan || !plan.is_active) {
            return res.status(404).json({ success: false, message: "Plan not found" });
        }
        if (Number(plan.price) <= 0) {
            return res.status(400).json({ success: false, message: "This plan is free and does not require payment" });
        }

        const result = await paymentService.initiatePaypalSubscriptionPayment(req.user.id, plan.id, { returnUrl, cancelUrl });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.cancelMySubscription = async (req, res) => {
    try {
        const result = await subscriptionService.cancelMySubscription(req.user.id);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ---- Admin ------------------------------------------------------------

exports.listAllPlansForAdmin = async (req, res) => {
    try {
        const plans = await subscriptionService.listAllPlansForAdmin();
        res.json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createPlan = async (req, res) => {
    try {
        const planId = await subscriptionService.createPlan(req.body);
        res.status(201).json({ success: true, data: { id: planId } });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updatePlan = async (req, res) => {
    try {
        await subscriptionService.updatePlan(req.params.id, req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.listAllSubscriptions = async (req, res) => {
    try {
        const data = await subscriptionService.listAllSubscriptions();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: give one seller N extra trial days (audit-logged and notified).
exports.extendSellerTrial = async (req, res) => {
    try {
        const data = await trialService.extendTrial({
            sellerId: req.params.id,
            days: req.body.days,
            adminId: req.user.id,
            reason: req.body.reason
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
