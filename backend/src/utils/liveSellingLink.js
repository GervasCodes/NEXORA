// Live-selling sessions only store a link to a stream hosted elsewhere.
// Accept https links to a short list of known video platforms and nothing
// else (no javascript:, data:, http:, credentials in the URL, or arbitrary
// hosts). Subdomains of an allowed host are accepted (m.youtube.com, ...).
// Keep in sync with frontend/src/utils/liveSellingEmbed.js.

const ALLOWED_HOSTS = [
    "youtube.com", "youtu.be",
    "facebook.com", "fb.watch",
    "instagram.com",
    "tiktok.com"
];

const hostAllowed = (hostname) => {
    const host = hostname.toLowerCase();
    return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
};

const isAllowedLiveSellingLink = (value) => {
    if (typeof value !== "string" || value.length > 2000) return false;
    try {
        const url = new URL(value.trim());
        return url.protocol === "https:" && !url.username && !url.password && hostAllowed(url.hostname);
    } catch {
        return false;
    }
};

module.exports = { ALLOWED_HOSTS, isAllowedLiveSellingLink };
