// Single source of truth for the one public trust badge: "Verified Seller".
//
// Two different facts live on seller_profiles and must never be confused:
//  - is_verified           -> the seller's ID was approved and they are
//                             allowed to sell. NEVER shown as a badge.
//  - is_business_verified  -> seller KYC (BRELA / TIN / business licence)
//                             was approved. This is what earns the badge.
//
// Sellers who showed a badge before this rule existed keep it until
// badge_grace_until (migration 148), unless their KYC is approved first.
// The badge still requires is_verified = 1, so a suspended / un-approved
// seller never shows it.
//
// Every listing query selects VERIFIED_BADGE_SELECT as `show_verified_badge`
// and every ranking uses VERIFIED_BADGE_ORDER, so no query reads the ID flag
// for display or ranking.

const verifiedBadgeSql = (alias = "sp") =>
    `(${alias}.is_verified = 1 AND (${alias}.is_business_verified = 1 OR (${alias}.badge_grace_until IS NOT NULL AND ${alias}.badge_grace_until > NOW())))`;

const VERIFIED_BADGE_SQL = verifiedBadgeSql("sp");
const VERIFIED_BADGE_SELECT = `${VERIFIED_BADGE_SQL} AS show_verified_badge`;
const VERIFIED_BADGE_ORDER = `${VERIFIED_BADGE_SQL} DESC`;

// JS twin of the SQL expression, for rows that already carry the raw
// columns (e.g. a full seller_profiles row).
const hasVerifiedBadge = (row, now = new Date()) => {
    if (!row) return false;
    if (!(row.is_verified === 1 || row.is_verified === true)) return false;
    if (row.is_business_verified === 1 || row.is_business_verified === true) return true;
    return Boolean(row.badge_grace_until) && new Date(row.badge_grace_until) > now;
};

module.exports = {
    verifiedBadgeSql,
    VERIFIED_BADGE_SQL,
    VERIFIED_BADGE_SELECT,
    VERIFIED_BADGE_ORDER,
    hasVerifiedBadge
};
