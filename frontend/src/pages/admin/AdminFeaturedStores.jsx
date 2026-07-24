import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const STATUS_STYLES = {
    active: "bg-teal/10 text-teal",
    expired: "bg-line text-ash",
    cancelled: "bg-coral/10 text-coral"
};

// Phase 8B - read-only view of every seller-paid featured-store campaign,
// for oversight. There's no manual free toggle to compare against here
// (unlike AdminSponsorship.jsx / the Products page's Sponsor toggle) -
// a store's featured placement in a department is entirely derived from
// this table, live, at request time
// (category.repository.js#findFeaturedStoresByCategory).
export default function AdminFeaturedStores() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/admin/featured-store-campaigns")
            .then(({ data }) => setCampaigns(data.data))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-ash">Loading featured store campaigns…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Featured store campaigns</h1>
            <p className="text-ash text-sm mb-8">
                Every seller-paid featured-store purchase, most recent first. A department's
                "Featured stores" row ranks these first, then falls back to organic ranking.
            </p>

            {campaigns.length === 0 ? (
                <p className="text-ash text-sm">No featured store campaigns yet.</p>
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {campaigns.map((c) => (
                        <li key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{c.store_name}</p>
                                <p className="text-xs text-ash truncate">{c.category_name}</p>
                            </div>

                            <p className="text-xs text-ash">
                                {c.days} day{c.days === 1 ? "" : "s"} at {formatMoney(c.daily_rate)}/day
                            </p>
                            <p className="price text-sm">{formatMoney(c.total_cost)}</p>
                            <p className="text-xs text-ash">{formatDate(c.starts_at)} → {formatDate(c.ends_at)}</p>

                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_STYLES[c.status] || "bg-line text-ash"}`}>
                                {c.status}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
