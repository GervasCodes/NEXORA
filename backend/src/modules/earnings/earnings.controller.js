const earningsService = require("./earnings.service");

exports.getMyDashboard = async (req, res) => {
    try {
        const dashboard = await earningsService.getDashboard(req.user.id);

        return res.json({
            success: true,
            data: dashboard
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
