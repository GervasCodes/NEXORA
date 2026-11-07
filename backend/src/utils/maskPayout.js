// Payout details (a bank account, a mobile-money number) are shown masked in
// admin lists; the full value is fetched through an audited reveal request.
// Keeps the last 4 letters/digits and masks the rest, so "CRDB 0150123456789"
// becomes "•••• ••••••••••6789".
const maskPayoutDetails = (value) => {
    const text = String(value === undefined || value === null ? "" : value);
    const total = (text.match(/[A-Za-z0-9]/g) || []).length;
    let seen = 0;
    return text.replace(/[A-Za-z0-9]/g, (ch) => {
        seen += 1;
        return seen > total - 4 ? ch : "•";
    });
};

module.exports = { maskPayoutDetails };
