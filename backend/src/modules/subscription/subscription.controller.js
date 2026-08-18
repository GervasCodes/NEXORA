const subscriptionService = require("./subscription.service");
const subscriptionRepository = require("./subscription.repository");
const paymentService = require("../payment/payment.service");
const settingsService = require("../settings/settings.service");
// Phase 7 (Security) - subscribeSnippe/subscribeMalipopayCard/subscribePaypal
// below were forwarding req.body.successUrl/cancelUrl/returnUrl straight to
// the payment provider with no validation at all, unlike every other
// redirect-accepting endpoint in payment.controller.js. That's an open
// redirect: an attacker-controlled successUrl would send a buyer's browser
// to an external site immediately after a real subscription payment
// completes. See utils/redirectValidator.js for the fix, applied below.
const { assertAllowedRedirect } = require("../../utils/redirectValidator");

// Shared by every subscribeX action below. Monetization Master Switch:
// when monetization_subscriptions_enabled is off, NO plan requires
// payment (not just the seeded $0 Free plan) - the subscription
// activates immediately instead of a payment request being created, per
// the roadmap's "Sellers can select plans normally... Subscription
// activates automatically" requirement. Returns true if it fully
// handled the response itself, in which case the caller should return
// without falling through to its own payment-initiation logic.
const tryFreeLaunchActivation = async (req, res, planCode) => {
    const subscriptionsEnabled = await settingsService.isSubscriptionsMonetizationEnabled();
    if (subscriptionsEnabled) return false;

    const subscription = await subscriptionService.subscribeFree(req.user.id, planCode);
    res.json({ success: true, message: "Subscribed - free during launch", data: subscription, freeLaunch: true });
    return true;
};

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
        if (await tryFreeLaunchActivation(req, res, planCode)) return;
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
        if (await tryFreeLaunchActivation(req, res, planCode)) return;
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
        if (await tryFreeLaunchActivation(req, res, planCode)) return;
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
        if (await tryFreeLaunchActivation(req, res, planCode)) return;
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
