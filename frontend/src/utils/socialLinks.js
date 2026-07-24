// Phase 7B (Branding). Sellers can type either a bare handle
// ("@storename", "storename") or a full URL into the Instagram/Facebook
// fields on SellerStore.jsx - see migration 049's comment for why the
// backend validates only length, not shape. This module is the one place
// that turns whatever they typed into a clickable href, so StorePage.jsx
// doesn't need its own parsing logic and a future second consumer (e.g.
// a seller directory card) doesn't have to duplicate it.

const toInstagramUrl = (value) => {
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://instagram.com/${trimmed.replace(/^@/, "")}`;
};

const toFacebookUrl = (value) => {
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://facebook.com/${trimmed}`;
};

const toWhatsappUrl = (value) => {
    const digits = value.replace(/[^\d]/g, "");
    return `https://wa.me/${digits}`;
};

// Returns only the links that are actually set, each with the label/href
// StorePage.jsx needs to render an icon link - so the page can just map
// over the result instead of repeating three near-identical `{store.x &&
// ...}` blocks.
export function getSocialLinks(store) {
    const links = [];

    if (store.social_instagram) {
        links.push({ key: "instagram", label: "Instagram", href: toInstagramUrl(store.social_instagram) });
    }
    if (store.social_facebook) {
        links.push({ key: "facebook", label: "Facebook", href: toFacebookUrl(store.social_facebook) });
    }
    if (store.social_whatsapp) {
        links.push({ key: "whatsapp", label: "WhatsApp", href: toWhatsappUrl(store.social_whatsapp) });
    }

    return links;
}
