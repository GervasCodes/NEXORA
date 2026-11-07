// Phase 3: single source of truth for the versions of the consent bundles
// users agree to. Bump the date when the consented documents (or how they
// are presented) materially change; new registrations and orders then
// record the new version without a migration.
//
// 2026-10-26: all legal documents are now presented on one /terms page.
module.exports = {
    // Terms of Service + Privacy Policy accepted at registration / Google sign-up.
    REGISTRATION_TERMS_VERSION: "2026-10-26",
    // Terms + Privacy + Refund Policy accepted at checkout.
    CHECKOUT_TERMS_VERSION: "2026-10-26"
};
