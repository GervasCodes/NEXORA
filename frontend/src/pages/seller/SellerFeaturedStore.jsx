import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const STATUS_STYLES = {
    active: "bg-teal/10 text-teal",
    expired: "bg-line text-ash",
    cancelled: "bg-coral/10 text-coral"
};

// Phase 8B - Featured Stores. The "Featured stores" row on each
// department page (Phase 2C) has always ranked sellers organically -
// verified status, then rating, then catalog size
// (category.repository.js#findFeaturedStoresByCategory). This adds a
// paid way to rank first in that row for one department: a seller pays
// out of their own wallet balance (same pool SellerWallet.jsx shows) to
// be featured for a fixed number of days at the platform's current
// daily rate. Unlike Sponsored Products (Phase 8A), there's no shared
// flag to flip - the ranking query itself checks for a live campaign, so
// a campaign here can't be "sponsored" the way a product can be toggled
// for free; it's paid placement only.
export default function SellerFeaturedStore() {
    const [pricing, setPricing] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [categoryId, setCategoryId] = useState("");
    const [days, setDays] = useState(7);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const load = () => {
        setLoading(true);
        Promise.all([
            api.get("/seller/featured-store/pricing"),
            api.get("/seller/featured-store/campaigns"),
            api.get("/seller/featured-store/categories")
        ])
            .then(([p, c, cats]) => {
                setPricing(p.data.data);
                setCampaigns(c.data.data);
                setCategories(cats.data.data);
            })
            .catch(() => setError("Couldn't load featured store data."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const totalCost = pricing ? pricing.daily_rate * Number(days || 0) : 0;

    const submitCampaign = async (e) => {
        e.preventDefault();
        setFormError("");
        setSubmitting(true);

        try {
            await api.post("/seller/featured-store/campaigns", {
                category_id: Number(categoryId),
                days: Number(days)
            });
            setCategoryId("");
            setDays(7);
            setShowForm(false);
            load();
        } catch (err) {
            setFormError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const cancelCampaign = async (campaign) => {
        setBusyId(campaign.id);
        setError("");
        try {
            await api.put(`/seller/featured-store/campaigns/${campaign.id}/cancel`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading featured store data…</p>;
    if (error) return <p role="alert" className="text-coral text-sm">{error}</p>;
    if (!pricing) return null;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Featured stores</h1>
            <p className="text-ash text-sm mb-8">
                Pay to rank first in a department's "Featured stores" row.
                Currently {formatMoney(pricing.daily_rate)} per day, charged from your wallet balance.
            </p>

            <div className="border border-line rounded-lg p-6 mb-8 flex items-center justify-between flex-wrap gap-4">
                <div>
                    <p className="text-xs text-ash mb-1">Active campaigns</p>
                    <p className="text-3xl font-medium">
                        {campaigns.filter((c) => c.status === "active").length}
                    </p>
                </div>
                <button
                    onClick={() => setShowForm((s) => !s)}
                    disabled={categories.length === 0}
                    className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors disabled:opacity-50"
                >
                    {showForm ? "Cancel" : "Start a campaign"}
                </button>
            </div>

            {categories.length === 0 && (
                <p className="text-ash text-sm mb-8">
                    You need at least one active, published product in a department before you can be featured there.
                </p>
            )}

            {showForm && (
                <form onSubmit={submitCampaign} className="border border-line rounded-lg p-4 mb-10 space-y-3">
                    {formError && <p role="alert" className="text-coral text-sm">{formError}</p>}

                    <div>
                        <label className="text-xs text-ash block mb-1">Department</label>
                        <select
                            required
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm"
                        >
                            <option value="" disabled>Choose a department…</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-ash block mb-1">
                            Duration ({pricing.min_days}-{pricing.max_days} days)
                        </label>
                        <input
                            type="number"
                            min={pricing.min_days}
                            max={pricing.max_days}
                            step="1"
                            required
                            value={days}
                            onChange={(e) => setDays(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm"
                        />
                    </div>

                    <p className="text-sm">
                        Total cost: <span className="price font-medium">{formatMoney(totalCost)}</span>
                    </p>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-medium disabled:opacity-50"
                    >
                        {submitting ? "Starting…" : "Start campaign"}
                    </button>
                </form>
            )}

            <p className="text-sm font-medium mb-3">Your campaigns</p>
            {campaigns.length === 0 ? (
                <p className="text-ash text-sm">No featured store campaigns yet.</p>
            ) : (
                <ul className="space-y-2">
                    {campaigns.map((c) => (
                        <li key={c.id} className="border border-line rounded-lg p-3 text-sm">
                            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                                <span className="font-medium">{c.category_name}</span>
                                <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_STYLES[c.status] || "bg-line text-ash"}`}>
                                    {c.status}
                                </span>
                            </div>
                            <p className="text-xs text-ash">
                                {c.days} day{c.days === 1 ? "" : "s"} at {formatMoney(c.daily_rate)}/day ·
                                {" "}total {formatMoney(c.total_cost)}
                            </p>
                            <p className="text-xs text-ash mb-2">
                                {formatDate(c.starts_at)} → {formatDate(c.ends_at)}
                            </p>
                            {c.status === "active" && (
                                <div>
                                    <button
                                        onClick={() => cancelCampaign(c)}
                                        disabled={busyId === c.id}
                                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-coral hover:text-coral transition-colors disabled:opacity-50"
                                    >
                                        Cancel campaign
                                    </button>
                                    <span className="text-xs text-ash ml-2">No refund for remaining days</span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
