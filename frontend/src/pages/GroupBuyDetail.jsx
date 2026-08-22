import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import PhoneInput from "../components/PhoneInput";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";

export default function GroupBuyDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const { format } = useCurrency();
    const navigate = useNavigate();

    const [group, setGroup] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [showClaimForm, setShowClaimForm] = useState(false);
    const [form, setForm] = useState({
        shipping_address: "", shipping_city: "", shipping_region: "", shipping_phone: "", payment_method: "mobile_money"
    });

    const load = () => {
        api.get(`/group-buys/${id}`).then(({ data }) => setGroup(data.data)).catch((err) => setError(extractErrorMessage(err)));
    };

    useEffect(load, [id]);

    const join = async () => {
        setBusy(true);
        setError("");
        try {
            await api.post(`/group-buys/${id}/join`);
            setMessage("You're in! We'll notify you once the group buy is resolved.");
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const claim = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const { data } = await api.post(`/group-buys/${id}/claim`, form);
            navigate(`/orders/${data.data.id}`);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (!group && !error) return <PageLoader />;
    if (!group) {
        return (
            <div className="max-w-xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">Group buy not found</p>
                <Link to="/group-buys" className="text-teal hover:underline text-sm">Back to group buys</Link>
            </div>
        );
    }

    const progress = Math.min(100, Math.round((group.participant_count / group.min_participants) * 100));

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title={group.product_name} noIndex />
            <Link to={`/products/${group.product_slug}`} className="text-teal text-sm hover:underline">{group.product_name}</Link>
            <h1 className="font-display text-2xl mt-1 mb-4">Group buy</h1>

            <div className="border border-line rounded-lg p-6 mb-6">
                <div className="flex items-baseline gap-3 mb-4">
                    <p className="price font-display text-2xl">{format(group.group_price)}</p>
                    <p className="text-ash line-through">{format(group.product_price)}</p>
                </div>
                <div className="h-2 bg-line rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-teal" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-sm text-ash">{group.participant_count}/{group.min_participants} joined</p>
                <p className="text-sm text-ash mt-1">
                    {group.status === "open" ? `Ends ${new Date(group.deadline).toLocaleString()}` : `Status: ${group.status}`}
                </p>
            </div>

            {error && <p className="text-sm text-coral mb-4">{error}</p>}
            {message && <p className="text-sm text-teal mb-4">{message}</p>}

            {user?.role === "buyer" && group.status === "open" && (
                <button
                    disabled={busy}
                    onClick={join}
                    className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                    {busy ? "Joining…" : "Join this group buy"}
                </button>
            )}

            {user?.role === "buyer" && group.status === "successful" && !showClaimForm && (
                <button
                    onClick={() => setShowClaimForm(true)}
                    className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                    Claim your discounted price
                </button>
            )}

            {showClaimForm && (
                <form onSubmit={claim} className="space-y-3 mt-4 border border-line rounded-lg p-4">
                    <input required placeholder="Delivery address" value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <div className="grid grid-cols-2 gap-3">
                        <input required placeholder="City" value={form.shipping_city} onChange={(e) => setForm({ ...form, shipping_city: e.target.value })} className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                        <input required placeholder="Region" value={form.shipping_region} onChange={(e) => setForm({ ...form, shipping_region: e.target.value })} className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <PhoneInput value={form.shipping_phone} onChange={(shipping_phone) => setForm({ ...form, shipping_phone })} required />
                    <button
                        type="submit"
                        disabled={busy}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {busy ? "Creating order…" : `Pay ${format(group.group_price)}`}
                    </button>
                </form>
            )}
        </div>
    );
}
