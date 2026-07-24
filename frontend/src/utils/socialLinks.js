

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
