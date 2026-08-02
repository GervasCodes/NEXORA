
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


// Date + time together, e.g. "5 Aug 2026, 14:30" - used for maintenance
// schedule windows where the exact time (not just the day) matters.
export const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
};

export const formatMonthYear = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric"
    });
};