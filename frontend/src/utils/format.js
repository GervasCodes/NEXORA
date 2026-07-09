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
