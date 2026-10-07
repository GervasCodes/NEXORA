// Builds a /feed link from listing filters, dropping empty values so the
// URL only carries filters that actually apply.
export function feedLink(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "" || value === false) return;
        qs.set(key, String(value));
    });
    const query = qs.toString();
    return query ? `/feed?${query}` : "/feed";
}
