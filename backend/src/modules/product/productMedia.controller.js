const { validationResult } = require("express-validator");
const mediaService = require("./productMedia.service");

const handle = (fn) => async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
        const { status = 200, body } = await fn(req);
        return res.status(status).json({ success: true, ...body });
    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            code: error.code,
            message: error.message
        });
    }
};

exports.sign = handle(async (req) => ({
    body: { data: await mediaService.signUpload(req.user.id, Number(req.params.id), req.body.kind) }
}));

exports.register = handle(async (req) => ({
    status: 201,
    body: { data: await mediaService.registerMedia(req.user.id, Number(req.params.id), req.body) }
}));

exports.list = handle(async (req) => ({
    body: { data: await mediaService.listMedia(req.user.id, Number(req.params.id)) }
}));

exports.reorder = handle(async (req) => ({
    body: { data: await mediaService.reorderMedia(req.user.id, Number(req.params.id), req.body.ids, req.body.coverId) }
}));

exports.remove = handle(async (req) => {
    await mediaService.deleteMedia(req.user.id, Number(req.params.id), Number(req.params.mediaId));
    return { body: { message: "Media removed" } };
});
