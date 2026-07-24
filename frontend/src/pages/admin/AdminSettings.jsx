import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";

export default function AdminSettings() {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [commissionRate, setCommissionRate] = useState("");
    const [riderFee, setRiderFee] = useState("");
    const [verificationFee, setVerificationFee] = useState("");
    const [usdRate, setUsdRate] = useState("");
    const [sponsorshipRate, setSponsorshipRate] = useState("");
    const [featuredStoreRate, setFeaturedStoreRate] = useState("");
    const [departmentSponsorshipRate, setDepartmentSponsorshipRate] = useState("");
    const [bands, setBands] = useState([]);
    const [perKmBeyond, setPerKmBeyond] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.get("/admin/settings")
            .then(({ data }) => {
                setSettings(data.data);
                setCommissionRate(data.data.commission_rate);
                setRiderFee(data.data.rider_delivery_fee);
                setVerificationFee(data.data.seller_verification_fee);
                setUsdRate(data.data.usd_exchange_rate);
                setSponsorshipRate(data.data.sponsorship_daily_rate);
                setFeaturedStoreRate(data.data.featured_store_daily_rate);
                setDepartmentSponsorshipRate(data.data.department_sponsorship_daily_rate);

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
                seller_verification_fee: Number(verificationFee),
                usd_exchange_rate: Number(usdRate),
                sponsorship_daily_rate: Number(sponsorshipRate),
                featured_store_daily_rate: Number(featuredStoreRate),
                department_sponsorship_daily_rate: Number(departmentSponsorshipRate),
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

    if (loading) return <p className="text-ash">Loading settings…</p>;
    if (!settings) return <p role="alert" className="text-coral text-sm">{error}</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Platform settings</h1>
            <p className="text-ash text-sm mb-8">
                Changes only apply going forward - past orders and deliveries keep whatever rate was in effect at the time.
            </p>

            <form onSubmit={save} className="border border-line rounded-lg p-6 max-w-md space-y-4">
                {error && <p role="alert" className="text-coral text-sm">{error}</p>}
                {saved && <p className="text-teal text-sm">Settings saved.</p>}

                <div>
                    <label className="text-xs text-ash block mb-1">Platform commission (%)</label>
                    <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        required
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-ash mt-1">Cut of each sale's subtotal that NEXORA keeps before crediting a seller's wallet.</p>
                </div>

                <div>
                    <label className="text-xs text-ash block mb-1">Fallback rider delivery fee (TZS)</label>
                    <input
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={riderFee}
                        onChange={(e) => setRiderFee(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-ash mt-1">
                        Used when distance-based pricing below can't be calculated - the seller has no pickup pin set,
                        or the order has no delivery pin. Otherwise the distance bands below decide the fee.
                    </p>
                </div>

                <div>
                    <label className="text-xs text-ash block mb-2">Distance-based delivery pricing (Tanzania)</label>
                    <div className="space-y-2">
                        {bands.map((band, i) => (
                            <div key={i} className="flex items-center gap-2">
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
                                    className="flex-1 border border-line rounded-md px-2 py-1.5 text-sm"
                                />
                                <span className="text-xs text-ash whitespace-nowrap">TZS</span>
                                <button
                                    type="button"
                                    onClick={() => removeBand(i)}
                                    disabled={bands.length <= 1}
                                    className="text-xs text-coral hover:underline disabled:opacity-40 disabled:no-underline px-1"
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
                        <label className="text-xs text-ash block mb-1">Rate beyond the last band (TZS per km)</label>
                        <input
                            type="number"
                            min="0"
                            step="10"
                            required
                            value={perKmBeyond}
                            onChange={(e) => setPerKmBeyond(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm"
                        />
                    </div>

                    <p className="text-xs text-ash mt-2">
                        Bolt-style tiers: a delivery is priced by the first band its distance fits under (seller's pickup
                        pin to the buyer's delivery pin). Past the last band, each extra km adds the rate above.
                    </p>
                </div>

                <div>
                    <label className="text-xs text-ash block mb-1">Seller verification fee (TZS)</label>
                    <input
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={verificationFee}
                        onChange={(e) => setVerificationFee(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-ash mt-1">One-time fee a seller pays to unlock the Verified Seller badge.</p>
                </div>

                <div>
                    <label className="text-xs text-ash block mb-1">USD exchange rate (TZS per $1)</label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={usdRate}
                        onChange={(e) => setUsdRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-ash mt-1">
                        Used only to convert a TZS amount to USD for PayPal, which doesn't support TZS directly.
                        Snippe charges in TZS natively and doesn't use this. Keep this roughly in line with the real rate.
                    </p>
                </div>

                <div>
                    <label className="text-xs text-ash block mb-1">Sponsorship daily rate (TZS)</label>
                    <input
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={sponsorshipRate}
                        onChange={(e) => setSponsorshipRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-ash mt-1">
                        What a seller pays per day to sponsor one product (Sponsorship page). A running
                        campaign keeps the rate it was purchased at even if you change this later.
                    </p>
                </div>

                <div>
                    <label className="text-xs text-ash block mb-1">Featured store daily rate (TZS)</label>
                    <input
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={featuredStoreRate}
                        onChange={(e) => setFeaturedStoreRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-ash mt-1">
                        What a seller pays per day to rank first in a department's Featured stores row
                        (Featured stores page). A running campaign keeps the rate it was purchased at
                        even if you change this later.
                    </p>
                </div>

                <div>
                    <label className="text-xs text-ash block mb-1">Department sponsorship daily rate (TZS)</label>
                    <input
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={departmentSponsorshipRate}
                        onChange={(e) => setDepartmentSponsorshipRate(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-ash mt-1">
                        What a seller pays per day to bump a department to the front of the homepage
                        "Shop by department" grid (Department sponsorship page). A running campaign
                        keeps the rate it was purchased at even if you change this later.
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors disabled:opacity-50"
                >
                    {saving ? "Saving…" : "Save settings"}
                </button>
            </form>
        </div>
    );
}
