
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

// Phase 5B: "Member since" on the public store page wants month + year,
// not a full day - the exact day a store was set up isn't a meaningful
// trust signal, how long it's been around is.
export const formatMonthYear = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric"
    });
};