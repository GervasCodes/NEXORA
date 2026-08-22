import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import { useCurrency } from "../context/CurrencyContext";
import { formatDate } from "../utils/format";

export default function Affiliate() {
    const { format } = useCurrency();
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    const load = () => {
        setLoading(true);
        api.get("/affiliate/me")
            .then(({ data }) => setDashboard(data.data))
            .catch(() => setDashboard(null))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const apply = async () => {
        setApplying(true);
        setError("");
        try {
            await api.post("/affiliate/apply");
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setApplying(false);
        }
    };

    if (loading) return <PageLoader />;

    if (!dashboard) {
        return (
            <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
                <PageMeta title="Become an affiliate" noIndex />
                <h1 className="font-display text-2xl mb-2">Earn by sharing NEXORA</h1>
                <p className="text-ash text-sm mb-6">Get your own referral link. Earn a commission on every order placed through it.</p>
                {error && <p className="text-sm text-coral mb-4">{error}</p>}
                <button
                    onClick={apply}
                    disabled={applying}
                    className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                    {applying ? "Setting up…" : "Become an affiliate"}
                </button>
            </div>
        );
    }

    const link = `${window.location.origin}/?ref=${dashboard.account.code}`;
    const copyLink = () => {
        navigator.clipboard?.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Affiliate dashboard" noIndex />
            <h1 className="font-display text-2xl mb-1">Affiliate dashboard</h1>
            <p className="text-ash text-sm mb-8">{(dashboard.account.commission_rate * 100).toFixed(0)}% commission on every order placed through your link.</p>

            <div className="border border-line rounded-lg p-6 mb-6">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Your link</p>
                <p className="text-sm font-mono break-all mb-3">{link}</p>
                <button onClick={copyLink} className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
                    {copied ? "Copied!" : "Copy link"}
                </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="border border-line rounded-lg p-4 text-center">
                    <p className="font-display text-xl">{dashboard.clickCount}</p>
                    <p className="text-xs text-ash">Clicks</p>
                </div>
                <div className="border border-line rounded-lg p-4 text-center">
                    <p className="font-display text-xl">{dashboard.conversions.length}</p>
                    <p className="text-xs text-ash">Orders</p>
                </div>
                <div className="border border-line rounded-lg p-4 text-center">
                    <p className="font-display text-xl">{format(dashboard.totalEarnings)}</p>
                    <p className="text-xs text-ash">Earned</p>
                </div>
            </div>

            <h2 className="font-display text-lg mb-3">Conversions</h2>
            {dashboard.conversions.length === 0 ? (
                <p className="text-ash text-sm">No conversions yet - share your link to get started.</p>
            ) : (
                <ul className="space-y-2">
                    {dashboard.conversions.map((c) => (
                        <li key={c.id} className="flex justify-between text-sm border-b border-line pb-2">
                            <span>Order {c.order_number} · {formatDate(c.created_at)}</span>
                            <span className="text-teal">{format(c.commission_amount)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
