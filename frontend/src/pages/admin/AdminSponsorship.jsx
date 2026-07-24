import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const STATUS_STYLES = {
    active: "bg-teal/10 text-teal",
    expired: "bg-line text-ash",
    cancelled: "bg-coral/10 text-coral"
};

// Phase 8A - read-only view of every seller-paid sponsorship campaign,
// for oversight. Deliberately separate from the manual sponsor/unsponsor
// toggle on AdminProducts.jsx (Phase 2C/041) - that free, admin-driven
// toggle isn't touched or replaced by this page; this is just visibility
// into what sellers are actually paying for.
export default function AdminSponsorship() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/admin/sponsorship-campaigns")
            .then(({ data }) => setCampaigns(data.data))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-ash">Loading sponsorship campaigns…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Sponsorship campaigns</h1>
            <p className="text-ash text-sm mb-8">
                Every seller-paid sponsorship purchase, most recent first. To feature a
                product for free instead, use the "Sponsor" toggle on the Products page.
            </p>

            {campaigns.length === 0 ? (
                <p className="text-ash text-sm">No sponsorship campaigns yet.</p>
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {campaigns.map((c) => (
                        <li key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{c.product_name}</p>
                                <p className="text-xs text-ash truncate">{c.store_name}</p>
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
