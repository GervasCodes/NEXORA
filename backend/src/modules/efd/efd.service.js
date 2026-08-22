/**
 * EFD (Electronic Fiscal Device) e-invoicing (Phase Q4).
 *
 * Per-seller, not platform-wide: a fiscal receipt has to carry the
 * actual seller's TIN (and VRN, if they're VAT-registered) - NEXORA
 * itself isn't the taxpayer for a sale it merely facilitated. So a
 * seller registers their tax info, an admin verifies it (same
 * "verified before it does anything real" shape as accountVerification
 * and kyc.service.js's tier upgrades), and only THEN does a paid order
 * attributed to them get submitted to TRA. An order from a seller who
 * hasn't registered gets a `not_applicable` receipt row - not an error,
 * just "no fiscal receipt was expected here" - and NEXORA's existing
 * (non-fiscal) payment receipt is all that order gets.
 *
 * See docs/EFD_COMPLIANCE_NOTE.md for what this deliberately does NOT
 * attempt to resolve (which sellers are legally required to register,
 * TIN/VRN format validation beyond a basic shape check, etc.) - that
 * needs a Tanzanian tax advisor, the same way docs/ESCROW_LICENSING_REVIEW.md
 * flags the equivalent for escrow.
 */

const efdRepository = require("./efd.repository");
const orderRepository = require("../order/order.repository");
const efdProvider = require("./providers/efd.provider");
const logger = require("../../utils/logger").child({ module: "efd" });
const Sentry = require("../../config/sentry");

// TRA TINs are 9 digits; VRNs are commonly presented like "40-123456-A"
// but formats have varied over TRA's own systems, so this stays a loose
// shape check (length + charset) rather than a strict pattern - the
// admin verification step is the real gate, not this regex.
const TIN_PATTERN = /^\d{9}$/;

exports.registerTaxInfo = async (userId, { tin, vrn }) => {
    if (!TIN_PATTERN.test(String(tin || ""))) {
        throw new Error("TIN must be exactly 9 digits");
    }
    if (vrn && String(vrn).trim().length < 4) {
        throw new Error("Invalid VRN");
    }

    await efdRepository.setTaxInfo(userId, tin, vrn || null);
    return efdRepository.getSellerTaxInfo(userId);
};

exports.getMyTaxInfo = async (userId) => efdRepository.getSellerTaxInfo(userId);

exports.listPendingRegistrations = async () => efdRepository.findPendingRegistrations();

exports.verifyRegistration = async (userId, approved) => {
    await efdRepository.setEfdRegistered(userId, approved);
    return efdRepository.getSellerTaxInfo(userId);
};

// Called from payment.service.js#_handleOrderPaymentWebhook, once per
// paid single-vendor order (a split cart's parent order has no items/
// seller of its own - see order.repository.js's insertOrderRow comment
// from Phase Q1 - so this is only ever called with a child or
// standalone order id).
exports.issueReceiptForOrder = async (orderId) => {
    const existing = await efdRepository.findByOrderId(orderId);
    if (existing) {
        return existing; // already handled - webhook retries are expected
    }

    const items = await orderRepository.findOrderItems(orderId);
    if (items.length === 0) {
        return null; // nothing to invoice (shouldn't happen for a real order)
    }

    const sellerId = items[0].seller_id;
    const sellerTax = await efdRepository.getSellerTaxInfo(sellerId);

    if (!sellerTax?.efd_registered) {
        const id = await efdRepository.create(orderId, sellerId, "not_applicable");
        return efdRepository.findByOrderId(orderId).then((r) => ({ ...r, id }));
    }

    const id = await efdRepository.create(orderId, sellerId, "pending");
    const order = await orderRepository.findOrderById(orderId);
    const buyerName = await efdRepository.findBuyerName(order.buyer_id);

    try {
        const result = await efdProvider.submitInvoice({
            sellerTin: sellerTax.tin,
            sellerVrn: sellerTax.vrn,
            buyerName: buyerName || "NEXORA customer",
            buyerPhone: order.shipping_phone,
            items,
            totalAmount: order.total_amount,
            orderNumber: order.order_number
        });

        if (!result.success) {
            await efdRepository.markFailed(id, result.error || "TRA VFD submission failed");
            logger.error({ orderId, error: result.error }, "EFD receipt submission failed");
            return efdRepository.findByOrderId(orderId);
        }

        await efdRepository.markIssued(id, {
            fiscalReceiptNumber: result.fiscalReceiptNumber,
            verificationCode: result.verificationCode,
            rawResponse: result.raw
        });
    } catch (error) {
        await efdRepository.markFailed(id, error.message);
        logger.error({ err: error, orderId }, "EFD receipt submission error");
        Sentry.captureException(error, { tags: { area: "efd" }, extra: { orderId } });
    }

    return efdRepository.findByOrderId(orderId);
};

exports.getMyReceipts = async (sellerId) => efdRepository.findBySeller(sellerId);

exports.getReceiptForOrder = async (orderId, userId, isAdmin) => {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) throw new Error("Order not found");

    const items = await orderRepository.findOrderItems(orderId);
    const sellerId = items[0]?.seller_id;
    const isParticipant = isAdmin || order.buyer_id === userId || sellerId === userId;
    if (!isParticipant) throw new Error("Order not found");

    return efdRepository.findByOrderId(orderId);
};
