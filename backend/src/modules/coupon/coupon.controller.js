const couponService = require("./coupon.service");
const cartService = require("../cart/cart.service");

// Recomputes the subtotal from the buyer's actual server-side cart
// rather than trusting a client-supplied amount, so a coupon's
// min_order_amount can't be bypassed by simply lying about the total in
// the request body.
exports.validate = async (req, res) => {
    try {
        const { total } = await cartService.getCart(req.user.id);
        const result = await couponService.validate(req.body.code, req.user.id, total);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
