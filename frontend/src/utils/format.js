// Fixed TZS formatting - intentionally NOT currency-converted. This is
// used on seller/admin/delivery financial screens (wallet, earnings,
// payouts, commission, order management) where the number shown must be
// the real settlement amount, not an approximate conversion. Buyer-facing
// price displays (product pages, cart, checkout, buyer orders) use
// useCurrency().format() instead - see context/CurrencyContext.jsx.
export const formatMoney = (amount) => {
    const value = Number(amount) || 0;
    return `TZS ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

export const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
};

export const formatShortDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short"
    });
};