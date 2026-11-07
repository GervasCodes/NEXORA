import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";

export const RECENTLY_VIEWED_KEY = "nexora_recently_viewed";

// Reads the local list written by product detail (max 12, newest first).
// Hidden entirely when there is nothing to show.
function readList() {
    try {
        const parsed = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((p) => p && p.slug && p.name) : [];
    } catch {
        return [];
    }
}

export default function RecentlyViewedRail() {
    const { t } = useLanguage();
    const [items, setItems] = useState([]);

    useEffect(() => { setItems(readList()); }, []);

    if (items.length === 0) return null;

    return (
        <section aria-labelledby="home-recently-viewed" className="mb-10">
            <h2 id="home-recently-viewed" className="font-display text-xl mb-4">{t("home.recentlyViewed")}</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 snap-x snap-mandatory">
                {items.map((item) => (
                    <Link
                        key={item.id || item.slug}
                        to={`/products/${item.slug}`}
                        className="w-40 sm:w-48 shrink-0 snap-start group"
                    >
                        <div className="aspect-square bg-line/40 rounded-md overflow-hidden mb-3">
                            {item.image_url && (
                                <img src={item.image_url} alt="" width={200} height={200} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            )}
                        </div>
                        <p className="text-sm line-clamp-2">{item.name}</p>
                    </Link>
                ))}
            </div>
        </section>
    );
}
