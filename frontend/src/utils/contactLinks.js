// Deep links for a delivery agent: navigate, call, WhatsApp.

const hasCoords = (lat, lng) => lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

export const googleMapsUrl = ({ lat, lng, address }) => {
    const destination = hasCoords(lat, lng) ? `${Number(lat)},${Number(lng)}` : address || "";
    if (!destination) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
};

export const wazeUrl = ({ lat, lng, address }) => {
    if (hasCoords(lat, lng)) return `https://waze.com/ul?ll=${Number(lat)},${Number(lng)}&navigate=yes`;
    if (address) return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
    return null;
};

const digits = (phone) => String(phone || "").replace(/[^\d+]/g, "");

export const telUrl = (phone) => (digits(phone) ? `tel:${digits(phone)}` : null);

// Tanzanian numbers are often written 07xx...; wa.me needs the country code.
export const whatsappUrl = (phone, text) => {
    let n = digits(phone).replace(/^\+/, "");
    if (!n) return null;
    if (n.startsWith("0")) n = `255${n.slice(1)}`;
    return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

// Package size label from the number of items (the order has no real
// dimensions, so item count is the honest proxy).
export const packageSizeKey = (itemCount) => {
    const n = Number(itemCount) || 0;
    if (n <= 2) return "delivery.agent.size.small";
    if (n <= 5) return "delivery.agent.size.medium";
    return "delivery.agent.size.large";
};
