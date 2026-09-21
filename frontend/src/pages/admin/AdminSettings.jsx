import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";

// Human-readable labels for ai.service.js's internal `feature` tags -
// see aiQuality (GET /admin/settings, ai.service.js#getQualityOverview).
// A feature missing from this map (e.g. a newly added one) still
// renders fine, just under its raw tag.
const AI_FEATURE_LABELS = {
    chat: "Nexora Assistant chat",
    search: "Smart search",
    recommend: "Recommendation \"why\" phrasing",
    order_status: "Order status explainer",
    product_explain: "Product page explainer",
    booking_explain: "Booking status explainer",
    listing_draft: "Listing description drafts",
    marketing_copy: "Marketing copy drafts",
    analytics_summary: "Seller analytics summary",
    seller_demand_forecast: "Seller demand forecast",
    availability_suggestion: "Availability suggestion",
    delivery_route: "Delivery route summary",
    admin_dispute_summary: "Dispute triage summary",
    admin_dispute_suggest_resolution: "Dispute resolution suggestion",
    admin_fraud_explain: "Fraud queue explainer",
    admin_forecast_explain: "Revenue forecast explainer",
    admin_personalization_explain: "Personalization health explainer"
};

export default function AdminSettings() {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [commissionRate, setCommissionRate] = useState("");
    const [riderFee, setRiderFee] = useState("");
    const [usdRate, setUsdRate] = useState("");
    const [sponsorshipRate, setSponsorshipRate] = useState("");
    const [featuredStoreRate, setFeaturedStoreRate] = useState("");
    const [departmentSponsorshipRate, setDepartmentSponsorshipRate] = useState("");
    const [bands, setBands] = useState([]);
    const [perKmBeyond, setPerKmBeyond] = useState("");
    const [aiEnabled, setAiEnabled] = useState(false);
    const [aiDailyCapUser, setAiDailyCapUser] = useState("");
    const [aiMonthlyCapUser, setAiMonthlyCapUser] = useState("");
    const [aiDailyCapGlobal, setAiDailyCapGlobal] = useState("");
    const [aiMonthlyCapGlobal, setAiMonthlyCapGlobal] = useState("");
    const [aiUsage, setAiUsage] = useState(null);
    const [aiQuality, setAiQuality] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.get("/admin/settings")
            .then(({ data }) => {
                setSettings(data.data);
                setCommissionRate(data.data.commission_rate);
                setRiderFee(data.data.rider_delivery_fee);
                setUsdRate(data.data.usd_exchange_rate);
                setSponsorshipRate(data.data.sponsorship_daily_rate);
                setFeaturedStoreRate(data.data.featured_store_daily_rate);
                setDepartmentSponsorshipRate(data.data.department_sponsorship_daily_rate);
                setAiEnabled(data.data.ai_enabled === "true" || data.data.ai_enabled === true);
                setAiDailyCapUser(data.data.ai_daily_token_cap_per_user);
                setAiMonthlyCapUser(data.data.ai_monthly_token_cap_per_user);
                setAiDailyCapGlobal(data.data.ai_daily_token_cap_global);
                setAiMonthlyCapGlobal(data.data.ai_monthly_token_cap_global);
                setAiUsage(data.data.aiUsage || null);
                setAiQuality(data.data.aiQuality || []);

                const parsed = typeof data.data.delivery_distance_bands === "string"
                    ? JSON.parse(data.data.delivery_distance_bands)
                    : data.data.delivery_distance_bands;
                setBands(parsed?.bands?.length ? parsed.bands : [{ up_to_km: 3, fee: 2000 }]);
                setPerKmBeyond(parsed?.per_km_beyond ?? 0);
            })
            .catch(() => setError("Couldn't load settings."))
            .finally(() => setLoading(false));
    }, []);

    const updateBand = (index, field, value) => {
        setBands(bands.map((band, i) => (i === index ? { ...band, [field]: value } : band)));
    };

    const addBand = () => {
        const last = bands[bands.length - 1];
        setBands([...bands, { up_to_km: (last?.up_to_km ?? 0) + 5, fee: (last?.fee ?? 0) + 2000 }]);
    };

    const removeBand = (index) => {
        if (bands.length <= 1) return; // at least one band required
        setBands(bands.filter((_, i) => i !== index));
    };

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        setSaved(false);

        try {
            const { data } = await api.put("/admin/settings", {
                commission_rate: Number(commissionRate),
                rider_delivery_fee: Number(riderFee),
                usd_exchange_rate: Number(usdRate),
                sponsorship_daily_rate: Number(sponsorshipRate),
                featured_store_daily_rate: Number(featuredStoreRate),
                department_sponsorship_daily_rate: Number(departmentSponsorshipRate),
                ai_enabled: aiEnabled,
                ai_daily_token_cap_per_user: Number(aiDailyCapUser),
                ai_monthly_token_cap_per_user: Number(aiMonthlyCapUser),
                ai_daily_token_cap_global: Number(aiDailyCapGlobal),
                ai_monthly_token_cap_global: Number(aiMonthlyCapGlobal),
                delivery_distance_bands: {
                    bands: bands
                        .map((b) => ({ up_to_km: Number(b.up_to_km), fee: Number(b.fee) }))
                        .sort((a, b) => a.up_to_km - b.up_to_km),
                    per_km_beyond: Number(perKmBeyond)
                }
            });
            setSettings(data.data);
            setSaved(true);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <PageLoader />;
    if (!settings) return <p role="alert" className="text-coral text-sm">{error}</p>;

    return (
        <div>
            <PageMeta title="Platform Settings" noIndex />
            <h1 className="font-display text-2xl mb-1">Platform settings</h1>
            <p className="text-ash text-sm mb-8">
                Changes only apply going forward - past orders and deliveries keep whatever rate was in effect at the time.
            </p>

            <form onSubmit={save} className="border border-line rounded-lg p-4 sm:p-6 max-w-lg space-y-5">
                {error && <p role="alert" className="text-coral text-sm">{error}</p>}
                {saved && <p className="text-teal text-sm">Settings saved.</p>}

                <div>
                    <label htmlFor="commissionRate" className="text-xs text-ash block mb-1">Platform commission (%)</label>
                    <input
                        id="commissionRate"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        required
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                    <p className="text-xs text-ash mt-1">Cut of each sale's subtotal that NEXORA keeps before crediting a seller's wallet.</p>
                </div>

                <div>
                    <label htmlFor="riderFee" className="text-xs text-ash block mb-1">Fallback rider delivery fee (TZS)</label>
                    <input
                        id="riderFee"
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={riderFee}
                        onChange={(e) => setRiderFee(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                    <p className="text-xs text-ash mt-1">
                        Used when distance-based pricing below can't be calculated - the seller has no pickup pin set,
                        or the order has no delivery pin. Otherwise the distance bands below decide the fee.
                    </p>
                </div>

                <div>
                    <p className="text-xs text-ash block mb-2">Distance-based delivery pricing (Tanzania)</p>
                    <div className="space-y-3">
                        {bands.map((band, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-ash whitespace-nowrap">Up to</span>
                                <input
                                    type="number"
                                    min="0.1"
                                    step="0.5"
                                    required
                                    value={band.up_to_km}
                                    onChange={(e) => updateBand(i, "up_to_km", e.target.value)}
                                    className="w-20 border border-line rounded-md px-2 py-1.5 text-sm"
                                />
                                <span className="text-xs text-ash whitespace-nowrap">km →</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="100"
                                    required
                                    value={band.fee}
                                    onChange={(e) => updateBand(i, "fee", e.target.value)}
                                    className="w-28 sm:flex-1 border border-line rounded-md px-2 py-1.5 text-sm"
                                />
                                <span className="text-xs text-ash whitespace-nowrap">TZS</span>
                                <button
                                    type="button"
                                    onClick={() => removeBand(i)}
                                    disabled={bands.length <= 1}
                                    className="text-xs text-coral hover:underline disabled:opacity-40 disabled:no-underline px-1 ml-auto sm:ml-0"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={addBand}
                        className="text-xs text-teal hover:underline mt-2"
                    >
                        + Add band
                    </button>

                    <div className="mt-3">
                        <label htmlFor="perKmBeyond" className="text-xs text-ash block mb-1">Rate beyond the last band (TZS per km)</label>
                        <input
                        id="perKmBeyond"
                            type="number"
                            min="0"
                            step="10"
                            required
                            value={perKmBeyond}
                            onChange={(e) => setPerKmBeyond(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                    </div>

                    <p className="text-xs text-ash mt-2">
                        A delivery is priced by the first band its distance fits under (seller's pickup
                        pin to the buyer's delivery pin). Past the last band, each extra km adds the rate above.
                    </p>
                </div>

                <div>
                    <label htmlFor="usdRate" className="text-xs text-ash block mb-1">USD exchange rate (TZS per $1)</label>
                    <input
                        id="usdRate"
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={usdRate}
                        onChange={(e) => setUsdRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                    <p className="text-xs text-ash mt-1">
                        Used only to convert a TZS amount to USD for PayPal, which doesn't support TZS directly.
                        Snippe charges in TZS natively and doesn't use this. Keep this roughly in line with the real rate.
                    </p>
                </div>

                <div>
                    <label htmlFor="sponsorshipRate" className="text-xs text-ash block mb-1">Sponsorship daily rate (TZS)</label>
                    <input
                        id="sponsorshipRate"
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={sponsorshipRate}
                        onChange={(e) => setSponsorshipRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                    <p className="text-xs text-ash mt-1">
                        What a seller pays per day to sponsor one product (Sponsorship page). A running
                        campaign keeps the rate it was purchased at even if you change this later.
                    </p>
                </div>

                <div>
                    <label htmlFor="featuredStoreRate" className="text-xs text-ash block mb-1">Featured store daily rate (TZS)</label>
                    <input
                        id="featuredStoreRate"
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={featuredStoreRate}
                        onChange={(e) => setFeaturedStoreRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                    <p className="text-xs text-ash mt-1">
                        What a seller pays per day to rank first in a department's Featured stores row
                        (Featured stores page). A running campaign keeps the rate it was purchased at
                        even if you change this later.
                    </p>
                </div>

                <div>
                    <label htmlFor="departmentSponsorshipRate" className="text-xs text-ash block mb-1">Department sponsorship daily rate (TZS)</label>
                    <input
                        id="departmentSponsorshipRate"
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={departmentSponsorshipRate}
                        onChange={(e) => setDepartmentSponsorshipRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                    <p className="text-xs text-ash mt-1">
                        What a seller pays per day to bump a department to the front of the homepage
                        "Shop by department" grid (Department sponsorship page). A running campaign
                        keeps the rate it was purchased at even if you change this later.
                    </p>
                </div>

                <div className="border-t border-line pt-5">
                    <div className="flex items-start justify-between gap-4 mb-1">
                        <div>
                            <p className="text-xs text-ash block mb-1">Nexora Assistant</p>
                            <p className="text-xs text-ash">
                                Master switch for the AI assistant across the app. Still requires a provider to be
                                configured server-side - turning this off disables AI features immediately even if one is.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setAiEnabled(!aiEnabled)}
                            className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                aiEnabled
                                    ? "bg-teal/10 border-teal text-teal"
                                    : "bg-paper border-line text-ash"
                            }`}
                        >
                            {aiEnabled ? "Enabled" : "Disabled"}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="aiDailyCapUser" className="text-xs text-ash block mb-1">Daily token cap per user</label>
                        <input
                        id="aiDailyCapUser"
                            type="number"
                            min="0"
                            step="1000"
                            required
                            value={aiDailyCapUser}
                            onChange={(e) => setAiDailyCapUser(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                    </div>

                    <div>
                        <label htmlFor="aiMonthlyCapUser" className="text-xs text-ash block mb-1">Monthly token cap per user</label>
                        <input
                        id="aiMonthlyCapUser"
                            type="number"
                            min="0"
                            step="1000"
                            required
                            value={aiMonthlyCapUser}
                            onChange={(e) => setAiMonthlyCapUser(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                    </div>

                    <div>
                        <label htmlFor="aiDailyCapGlobal" className="text-xs text-ash block mb-1">Daily token cap (global)</label>
                        <input
                        id="aiDailyCapGlobal"
                            type="number"
                            min="0"
                            step="1000"
                            required
                            value={aiDailyCapGlobal}
                            onChange={(e) => setAiDailyCapGlobal(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                    </div>

                    <div>
                        <label htmlFor="aiMonthlyCapGlobal" className="text-xs text-ash block mb-1">Monthly token cap (global)</label>
                        <input
                        id="aiMonthlyCapGlobal"
                            type="number"
                            min="0"
                            step="1000"
                            required
                            value={aiMonthlyCapGlobal}
                            onChange={(e) => setAiMonthlyCapGlobal(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                    </div>
                </div>
                <p className="text-xs text-ash -mt-3">
                    Once either the daily or monthly cap is reached, Nexora Assistant falls back to its non-AI
                    behavior platform-wide (or for that user, for the per-user caps) until the window resets.
                </p>

                {aiUsage && (
                    <div className="border border-line rounded-md p-3 bg-paper">
                        <p className="text-xs text-ash font-medium mb-2">Current usage (global)</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <p className="text-ash">Today</p>
                                <p className="font-medium">
                                    {Number(aiUsage.dailyTokensUsedGlobal).toLocaleString()}
                                    {" / "}
                                    {Number(aiDailyCapGlobal || 0).toLocaleString()} tokens
                                </p>
                            </div>
                            <div>
                                <p className="text-ash">This month</p>
                                <p className="font-medium">
                                    {Number(aiUsage.monthlyTokensUsedGlobal).toLocaleString()}
                                    {" / "}
                                    {Number(aiMonthlyCapGlobal || 0).toLocaleString()} tokens
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {aiQuality.length > 0 && (
                    <div className="border border-line rounded-md p-3 bg-paper">
                        <p className="text-xs text-ash font-medium mb-1">AI quality — last 7 days</p>
                        <p className="text-[11px] text-ash mb-2">
                            How often each feature actually got an AI reply vs. fell back to its plain-template
                            behavior (provider unavailable, a spend cap, or a reply that couldn't be used).
                            A feature stuck near 100% isn't broken - it's silently getting no AI benefit, which
                            is worth investigating (provider config, spend caps).
                        </p>
                        <div className="space-y-1.5">
                            {aiQuality.map((row) => (
                                <div key={row.feature} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="text-ink truncate">
                                        {AI_FEATURE_LABELS[row.feature] || row.feature}
                                    </span>
                                    <span
                                        className={`shrink-0 font-medium ${
                                            row.fallbackRatePercent >= 50 ? "text-coral" : "text-ash"
                                        }`}
                                    >
                                        {row.fallbackRatePercent}% fallback ({row.total} call{row.total === 1 ? "" : "s"})
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Button
                    type="submit"
                    disabled={saving}
                >
                    {saving ? "Saving…" : "Save settings"}
                </Button>
            </form>
        </div>
    );
}
