// Registry of NEXORA's legal/policy documents.
// Each entry's `content` is the raw markdown source imported from
// src/legal/*.md via Vite's `?raw` import, rendered by <MarkdownLite />.
//
// To add a new policy: drop a .md file in src/legal/, import it below,
// and add an entry here — the /legal/:slug route and footer links pick
// it up automatically via LEGAL_DOCS / LEGAL_DOC_LIST.

import termsOfService from "../legal/terms-of-service.md?raw";
import privacyPolicy from "../legal/privacy-policy.md?raw";
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
