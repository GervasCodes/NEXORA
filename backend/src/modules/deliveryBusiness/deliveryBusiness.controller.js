const service = require("./deliveryBusiness.service");

const sendError = (res, error) => {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
};

const handler = (fn, successStatus = 200, message) => async (req, res) => {
    try {
        const data = await fn(req);
        const body = { success: true, data };
        if (message) body.message = message;
        res.status(successStatus).json(body);
    } catch (error) {
        sendError(res, error);
    }
};

exports.getMine = handler((req) => service.getMine(req.user.id));
exports.register = handler((req) => service.register(req.user.id, req.body.name), 201, "Delivery business created.");

exports.getRoster = handler((req) => service.getRoster(req.business));
exports.addAgent = handler((req) => service.addAgent(req.business, req.body.email), 201, "Agent added to your roster.");
exports.removeAgent = handler(async (req) => {
    await service.removeAgent(req.business, Number(req.params.agentId));
    return null;
}, 200, "Agent removed from your roster.");

exports.getOverview = handler((req) => service.getOverview(req.business, req.query));

exports.listJobs = handler((req) => service.listJobs(req.business, req.query));
exports.createJob = handler((req) => service.createJob(req.business, {
    reference: req.body.reference,
    pickupAddress: req.body.pickup_address,
    dropoffAddress: req.body.dropoff_address,
    customerName: req.body.customer_name,
    customerPhone: req.body.customer_phone,
    description: req.body.description,
    feeAmount: req.body.fee_amount
}), 201, "Job created.");
exports.assignJob = handler((req) => service.assignJob(
    req.business, Number(req.params.jobId), req.body.agent_id ? Number(req.body.agent_id) : null
));
exports.updateJobStatus = handler((req) => service.updateJobStatus(req.business, Number(req.params.jobId), req.body.status));
exports.updateJobFee = handler((req) => service.updateJobFee(req.business, Number(req.params.jobId), {
    feeAmount: req.body.fee_amount,
    collected: req.body.collected === undefined || req.body.collected === null
        ? undefined : (req.body.collected === true || req.body.collected === "true")
}));
