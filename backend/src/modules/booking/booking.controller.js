const bookingService = require("./booking.service");

exports.createBooking = async (req, res) => {
    try {
        const result = await bookingService.createBooking(req.user.id, req.body);

        return res.status(201).json({
            success: true,
            message: "Booking created",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getBookingById = async (req, res) => {
    try {
        const booking = await bookingService.getBookingById(req.params.id, req.user.id);

        return res.json({
            success: true,
            data: booking
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMyBookings = async (req, res) => {
    try {
        const bookings = await bookingService.getMyBookingsAsCustomer(req.user.id);

        return res.json({
            success: true,
            data: bookings
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getProviderBookings = async (req, res) => {
    try {
        const bookings = await bookingService.getMyBookingsAsProvider(req.user.id);

        return res.json({
            success: true,
            data: bookings
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.confirmBooking = async (req, res) => {
    try {
        await bookingService.confirmBooking(req.params.id, req.user.id);

        return res.json({ success: true, message: "Booking confirmed" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        await bookingService.cancelBooking(req.params.id, req.user.id);

        return res.json({ success: true, message: "Booking cancelled" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
