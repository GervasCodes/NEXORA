/**
 * B2B / bulk ordering tier (Phase Q7).
 *
 * Two independent halves:
 *  - Business account verification (business.repository's getStatus/
 *    submitApplication/setStatus): admin-verified before a buyer's
 *    wholesale catalog surfacing unlocks - "is this a real business"
 *    genuinely needs confirming, same shape as kyc.service.js/
 *    efd.service.js.
 *  - Bulk price tiers (getBulkUnitPrice, setTiers): NOT gated behind
 *    that verification - a seller-posted "buy 12+, pay X each" applies
 *    to any buyer who orders that quantity, the same way a wholesale
 *    shelf tag isn't identity-checked. See migration 089's comment on
 *    product_bulk_price_tiers for the full reasoning.
 */

const businessRepository = require("./business.repository");
const productRepository = require("../product/product.repository");

exports.getMyStatus = async (userId) => businessRepository.getStatus(userId);

exports.apply = async (userId, { businessName, businessTin }) => {
    if (!businessName || !businessTin) {
        throw new Error("Business name and TIN are required");
    }
    await businessRepository.submitApplication(userId, businessName, businessTin);
    return businessRepository.getStatus(userId);
};

exports.listPending = async () => businessRepository.findPending();

exports.verify = async (userId, approved) => {
    await businessRepository.setStatus(userId, approved ? "verified" : "none");
    return businessRepository.getStatus(userId);
};

// ---- Bulk price tiers -----------------------------------------------------

exports.getTiers = async (productId) => businessRepository.findTiersByProduct(productId);

exports.setTiers = async (sellerId, productId, tiers) => {
    const product = await productRepository.findById(productId);
    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    const cleaned = (tiers || [])
        .filter((t) => t.minQuantity > 1 && t.unitPrice > 0)
        .sort((a, b) => a.minQuantity - b.minQuantity);

    for (let i = 1; i < cleaned.length; i++) {
        if (cleaned[i].unitPrice >= cleaned[i - 1].unitPrice) {
            throw new Error("Each higher-quantity tier must be cheaper per unit than the one below it");
        }
    }

    await businessRepository.replaceTiers(productId, cleaned);
    return businessRepository.findTiersByProduct(productId);
};

// Called from order.service.js#checkout for every line item - returns
// the best (lowest) unit price this quantity qualifies for, or null if
// no tier applies (falls back to the product's normal/discount price).
exports.getBulkUnitPrice = async (productId, quantity) => {
    const tiers = await businessRepository.findTiersByProduct(productId);
    const eligible = tiers.filter((t) => quantity >= t.min_quantity);
    if (eligible.length === 0) return null;
    return Number(eligible[eligible.length - 1].unit_price); // tiers are ascending by min_quantity, so the last eligible one is the best
};
