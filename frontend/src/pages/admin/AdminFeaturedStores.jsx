import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";

const STATUS_STYLES = {
    active: "bg-teal/10 text-teal",
    expired: "bg-line text-ash",
    cancelled: "bg-coral/10 text-coral"
};


export default function AdminFeaturedStores() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/admin/featured-store-campaigns")
            .then(({ data }) => setCampaigns(data.data))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <PageLoader />;

    return (
        <div className="animate-fade-in">
            <PageMeta title="Featured Stores" noIndex />
            <h1 className="font-display text-2xl mb-1">Featured store campaigns</h1>
            <p className="text-ash text-sm mb-8">
                Every seller-paid featured-store purchase, most recent first. A department's
                "Featured stores" row ranks these first, then falls back to organic ranking.
            </p>

            {campaigns.length === 0 ? (
                <EmptyState title="No featured store campaigns yet." />
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {campaigns.map((c) => (
                        <li key={c.id} className="py-3 flex flex-wrap items-center gap-3 px-2 -mx-2 rounded-md transition-colors hover:bg-line/30">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{c.store_name}</p>
                                <p className="text-xs text-ash truncate">{c.category_name}</p>
                            </div>

                            <p className="text-xs text-ash">
                                {c.days} day{c.days === 1 ? "" : "s"} at {formatMoney(c.daily_rate)}/day
                            </p>
                            <p className="price text-sm">{formatMoney(c.total_cost)}</p>
                            <p className="text-xs text-ash">{formatDate(c.starts_at)} → {formatDate(c.ends_at)}</p>

                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize transition-colors ${STATUS_STYLES[c.status] || "bg-line text-ash"}`}>
                                {c.status}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
