

import termsOfService from "../legal/terms-of-service.md?raw";
import privacyPolicy from "../legal/privacy-policy.md?raw";
import refundPolicy from "../legal/refund-policy.md?raw";
import cookiePolicy from "../legal/cookie-policy.md?raw";
import vendorAgreement from "../legal/vendor-agreement.md?raw";
import deliveryLiabilityPolicy from "../legal/delivery-liability-policy.md?raw";
import insurancePolicy from "../legal/insurance-policy.md?raw";
import companyInformation from "../legal/company-information.md?raw";

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
    // (Legal & Consumer Trust): the refund rules used to live
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
    },
    // (Legal & Consumer Trust): legal-entity disclosure, moved
    // here from the footer so it sits with the other legal documents.
    //
    // **EVERY VALUE IN company-information.md IS A PLACEHOLDER.** These
    // are real business facts that exist nowhere in this repository -
    // there is no settings table, env var, or config file holding the
    // registered company name, BRELA registration number, TIN, or a
    // physical address (checked backend/src/modules/settings, config/,
    // and the .env examples). They have to come from the business owner
    // before launch. Inventing real-looking values would be worse than
    // leaving the gap visible, so they are deliberately loud.
    //
    // Consumer-facing marketplaces are generally expected to disclose
    // the legal entity behind the site and a way to reach it; a footer
    // that says only "NEXORA" identifies no one a buyer could actually
    // pursue.
    "company-information": {
        title: "Company Information",
        shortTitle: "Company",
        content: companyInformation
    }
};

export const LEGAL_DOC_LIST = Object.entries(LEGAL_DOCS).map(([slug, doc]) => ({
    slug,
    ...doc
}));
