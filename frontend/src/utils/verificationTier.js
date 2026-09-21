// Two distinct, buyer-facing trust tiers:
//  - "seller":   Verified Seller - NIDA / Voter's ID approved (is_verified)
//  - "business": Verified Business - additionally BRELA + TIN + business
//                license approved (is_business_verified)
// Business is only ever shown on top of a live Verified Seller badge, so
// a row that somehow carries is_business_verified without is_verified is
// treated as no badge at all. Listing endpoints that don't select
// is_business_verified simply resolve to "seller" - the safe fallback.
const truthy = (value) => value === 1 || value === true;

export function getVerificationTier(entity) {
    if (!entity || !truthy(entity.is_verified)) {
        return null;
    }
    return truthy(entity.is_business_verified) ? "business" : "seller";
}

export const VERIFICATION_LABEL_KEYS = {
    seller: "verification.sellerBadge",
    business: "verification.businessBadge"
};
