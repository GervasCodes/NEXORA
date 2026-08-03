const subscriptionService = require("./subscription.service");
const subscriptionRepository = require("./subscription.repository");
const paymentService = require("../payment/payment.service");

exports.listPlans = async (req, res) => {
    try {
        const plans = await subscriptionService.listPlans();
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
        const { planCode, successUrl, cancelUrl } = req.body;
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
        const { planCode, successUrl, cancelUrl } = req.body;
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
        const { planCode, returnUrl, cancelUrl } = req.body;
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
