const availabilityService = require("./availability.service");

exports.setAvailability = async (req, res) => {
    try {
        const result = await availabilityService.setAvailability(req.user.id, req.params.serviceId, req.body);

        return res.json({
            success: true,
            message: "Availability updated",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getAvailability = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: "start_date and end_date are required"
            });
        }

        const availability = await availabilityService.getAvailability(req.params.serviceId, start_date, end_date);

        return res.json({
            success: true,
            data: availability
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};
