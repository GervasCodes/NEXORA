

import termsOfService from "../legal/terms-of-service.md?raw";
import privacyPolicy from "../legal/privacy-policy.md?raw";
import refundPolicy from "../legal/refund-policy.md?raw";
import cookiePolicy from "../legal/cookie-policy.md?raw";
import vendorAgreement from "../legal/vendor-agreement.md?raw";
import deliveryLiabilityPolicy from "../legal/delivery-liability-policy.md?raw";
import insurancePolicy from "../legal/insurance-policy.md?raw";

export const LEGAL_DOCS = {
    "terms-of-service": {
        title: "Terms of Service",
        shortTitle: "Terms",
        content: termsOfService
    },
    "privacy-policy": {
        title: "Privacy Policy",
        shortTitle: "Privacy",
        content: privacyPolicy
    },
    // Phase 2 (Legal & Consumer Trust): the refund rules used to live
    // only inside terms-of-service.md Section 5. They're now a standalone
    // document (the ToS section summarizes and links here instead of
    // duplicating the text), so a buyer can be pointed straight at the
    // refund terms - including from the checkout consent checkbox - and
    // so it appears as its own entry in the footer's legal index. Ordered
    // right after Privacy so the three documents a buyer consents to at
    // checkout (Terms, Privacy, Refund) sit together in LEGAL_DOC_LIST.
    "refund-policy": {
        title: "Refund Policy",
        shortTitle: "Refunds",
        content: refundPolicy
    },
    "cookie-policy": {
        title: "Cookie Policy",
        shortTitle: "Cookies",
        content: cookiePolicy
    },
    "vendor-agreement": {
        title: "Vendor Agreement",
        shortTitle: "Vendor Agreement",
        content: vendorAgreement
    },
    "delivery-liability-policy": {
        title: "Delivery Liability Policy",
        shortTitle: "Delivery Liability",
        content: deliveryLiabilityPolicy
    },
    "insurance-policy": {
        title: "Insurance Policy",
        shortTitle: "Insurance",
        content: insurancePolicy
    }
};

export const LEGAL_DOC_LIST = Object.entries(LEGAL_DOCS).map(([slug, doc]) => ({
    slug,
    ...doc
}));
