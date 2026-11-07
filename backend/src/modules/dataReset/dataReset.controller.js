const dataResetService = require("./dataReset.service");

// `test_only` defaults to TRUE everywhere it's read. The whole point of
// this tooling is clearing seed/demo data, so the narrow scope is the
// expected one - and a missing/malformed flag should never silently widen
// a hard delete to include real orders. Only an explicit `false` does that.
const readTestOnly = (value) => value !== false && value !== "false";

const respondWithError = (res, error) =>
    res.status(error.status || 400).json({ success: false, message: error.message });

exports.previewSellerReset = async (req, res) => {
    try {
        const preview = await dataResetService.previewSellerReset(req.params.sellerId, {
            testOnly: readTestOnly(req.query.test_only)
        });

        return res.json({ success: true, data: preview });

    } catch (error) {
        return respondWithError(res, error);
    }
};

exports.resetSeller = async (req, res) => {
    try {
        const result = await dataResetService.resetSeller(
            req.params.sellerId,
            { testOnly: readTestOnly(req.body.test_only), confirmation: req.body.confirmation },
            { actorId: req.user.id, req }
        );

        return res.json({ success: true, data: result });

    } catch (error) {
        return respondWithError(res, error);
    }
};

exports.requestPlatformApproval = async (req, res) => {
    try {
        const data = await dataResetService.requestPlatformResetApproval(
            { testOnly: readTestOnly(req.body.test_only) },
            { actorId: req.user.id }
        );
        return res.status(201).json({ success: true, data });
    } catch (error) {
        return respondWithError(res, error);
    }
};

exports.approvePlatformReset = async (req, res) => {
    try {
        const data = await dataResetService.approvePlatformReset(req.params.approvalId, {
            actorId: req.user.id,
            password: req.body.password,
            req
        });
        return res.json({ success: true, data });
    } catch (error) {
        return respondWithError(res, error);
    }
};

exports.previewPlatformReset = async (req, res) => {
    try {
        const preview = await dataResetService.previewPlatformReset({
            testOnly: readTestOnly(req.query.test_only)
        });

        return res.json({ success: true, data: preview });

    } catch (error) {
        return respondWithError(res, error);
    }
};

exports.resetPlatform = async (req, res) => {
    try {
        const result = await dataResetService.resetPlatform(
            {
                testOnly: readTestOnly(req.body.test_only),
                confirmation: req.body.confirmation,
                password: req.body.password,
                approvalId: req.body.approval_id
            },
            { actorId: req.user.id, req }
        );

        return res.json({ success: true, data: result });

    } catch (error) {
        return respondWithError(res, error);
    }
};
