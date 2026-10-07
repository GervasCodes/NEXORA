const documentAccessService = require("./documentAccess.service");

exports.getUrl = async (req, res) => {
    try {
        const data = await documentAccessService.getDocumentUrl(
            req.params.kind,
            Number(req.params.id),
            { adminId: req.user.id, req }
        );
        res.set("Cache-Control", "no-store");
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }
};
