import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const STATUS_STYLES = {
    active: "bg-teal/10 text-teal",
    expired: "bg-line text-ash",
    cancelled: "bg-coral/10 text-coral"
};

// Phase 8A - Sponsored Products. The real campaign/budget/payment system
// behind the is_sponsored display flag admin can already toggle for free
// on AdminProducts.jsx (Phase 2C/041). A seller pays out of their own
// wallet balance (same pool SellerWallet.jsx shows) to sponsor one of
// their own active products for a fixed number of days at the
// platform's current daily rate.
export default function SellerSponsorship() {
    const [pricing, setPricing] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [myProducts, setMyProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [productId, setProductId] = useState("");
    const [days, setDays] = useState(7);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const load = () => {
        setLoading(true);
        Promise.all([
            api.get("/seller/sponsorship/pricing"),
            api.get("/seller/sponsorship/campaigns"),
            api.get("/products/mine/list")
        ])
            .then(([p, c, products]) => {
                setPricing(p.data.data);
                setCampaigns(c.data.data);
                // Only an active, published product can be sponsored - see
                // sponsorship.service.js#createCampaign.
                setMyProducts(products.data.data.filter((prod) => prod.is_active));
            })
            .catch(() => setError("Couldn't load sponsorship data."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const totalCost = pricing ? pricing.daily_rate * Number(days || 0) : 0;

    const submitCampaign = async (e) => {
        e.preventDefault();
        setFormError("");
        setSubmitting(true);

        try {
            await api.post("/seller/sponsorship/campaigns", {
                product_id: Number(productId),
                days: Number(days)
            });
            setProductId("");
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
            await api.put(`/seller/sponsorship/campaigns/${campaign.id}/cancel`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading sponsorship data…</p>;
    if (error) return <p role="alert" className="text-coral text-sm">{error}</p>;
    if (!pricing) return null;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Sponsored products</h1>
            <p className="text-ash text-sm mb-8">
                Pay to feature one of your products in each department's "Sponsored" row.
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
                    disabled={myProducts.length === 0}
                    className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors disabled:opacity-50"
                >
                    {showForm ? "Cancel" : "Start a campaign"}
                </button>
            </div>

            {myProducts.length === 0 && (
                <p className="text-ash text-sm mb-8">
                    You need at least one active, published product before you can sponsor it.
                </p>
            )}

            {showForm && (
                <form onSubmit={submitCampaign} className="border border-line rounded-lg p-4 mb-10 space-y-3">
                    {formError && <p role="alert" className="text-coral text-sm">{formError}</p>}

                    <div>
                        <label className="text-xs text-ash block mb-1">Product</label>
                        <select
                            required
                            value={productId}
                            onChange={(e) => setProductId(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm"
                        >
                            <option value="" disabled>Choose a product…</option>
                            {myProducts.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
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
                <p className="text-ash text-sm">No sponsorship campaigns yet.</p>
            ) : (
                <ul className="space-y-2">
                    {campaigns.map((c) => (
                        <li key={c.id} className="border border-line rounded-lg p-3 text-sm">
                            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                                <span className="font-medium">{c.product_name}</span>
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
