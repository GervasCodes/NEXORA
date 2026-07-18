import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";

export default function AdminSettings() {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [commissionRate, setCommissionRate] = useState("");
    const [riderFee, setRiderFee] = useState("");
    const [verificationFee, setVerificationFee] = useState("");
    const [usdRate, setUsdRate] = useState("");
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
            })
            .catch(() => setError("Couldn't load settings."))
            .finally(() => setLoading(false));
    }, []);

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
                usd_exchange_rate: Number(usdRate)
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
    if (!settings) return <p className="text-coral text-sm">{error}</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Platform settings</h1>
            <p className="text-ash text-sm mb-8">
                Changes only apply going forward - past orders and deliveries keep whatever rate was in effect at the time.
            </p>

            <form onSubmit={save} className="border border-line rounded-lg p-6 max-w-md space-y-4">
                {error && <p className="text-coral text-sm">{error}</p>}
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
                    <label className="text-xs text-ash block mb-1">Rider delivery fee (TZS)</label>
                    <input
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={riderFee}
                        onChange={(e) => setRiderFee(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-ash mt-1">Flat amount a delivery agent earns per completed delivery.</p>
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
