// One public trust badge: "Verified Seller".
//
// It is earned only by approved seller KYC (BRELA / TIN / business licence,
// stored as is_business_verified). is_verified means "ID approved, allowed to
// sell" and is NEVER shown as a badge. Sellers who had a badge before this
// rule keep it until badge_grace_until.
//
// Listing endpoints send the finished answer as `show_verified_badge`
// (backend/src/utils/verifiedBadge.js). Rows that only carry the raw seller
// columns (e.g. the seller's own profile) are resolved here with the same
// rule. A row with neither resolves to "no badge" - the safe fallback.
const truthy = (value) => value === 1 || value === true;

export function hasVerifiedBadge(entity) {
    if (!entity) {
        return false;
    }
    if (entity.show_verified_badge !== undefined && entity.show_verified_badge !== null) {
        return truthy(entity.show_verified_badge);
    }
    if (!truthy(entity.is_verified)) {
        return false;
    }
    if (truthy(entity.is_business_verified)) {
        return true;
    }
    return Boolean(entity.badge_grace_until) && new Date(entity.badge_grace_until) > new Date();
}

// Kept as a function returning "seller" or null so existing call sites that
// only test for a truthy tier keep working. There is no second tier.
export function getVerificationTier(entity) {
    return hasVerifiedBadge(entity) ? "seller" : null;
}

export const VERIFICATION_LABEL_KEYS = {
    seller: "verification.sellerBadge"
};
