// Local list of recently viewed products (max 12, newest first). Read by the
// Home "Recently viewed" rail (components/RecentlyViewedRail.jsx).
export const RECENTLY_VIEWED_KEY = "nexora_recently_viewed";
const MAX_ITEMS = 12;

export function recordRecentlyViewed(item) {
    if (!item?.id || !item?.slug || !item?.name) return;
    try {
        const current = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || "[]");
        const list = Array.isArray(current) ? current : [];
        const next = [
            { id: item.id, slug: item.slug, name: item.name, image_url: item.image_url || null },
            ...list.filter((entry) => entry && entry.id !== item.id),
        ].slice(0, MAX_ITEMS);
        localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    } catch {
        /* storage full or disabled - the rail just stays as it was */
    }
}
