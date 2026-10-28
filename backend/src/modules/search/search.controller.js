const searchService = require("./search.service");

// Public, fire-and-forget from the client (SearchBox.jsx calls this without
// awaiting it before navigating). Body shape is already enforced by
// logQueryValidation; a term that passes validation but is too short to be
// worth logging (below MIN_TERM_LENGTH) is a silent no-op in the service,
// not an error, since the caller never branches on the result.
exports.logQuery = async (req, res) => {
    try {
        await searchService.logQuery(req.body.term);
        return res.status(204).end();
    } catch (error) {
        // Logging failures should never surface as an error to the shopper.
        return res.status(204).end();
    }
};

exports.getTrending = async (req, res) => {
    try {
        const terms = await searchService.getTrending();
        return res.json({ success: true, data: terms });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
