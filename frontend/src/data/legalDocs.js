

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
