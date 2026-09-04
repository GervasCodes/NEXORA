import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import PhoneInput from "../components/PhoneInput";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { formatTimeRemaining } from "../utils/format";

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

    // Share (Phase 9, UI/UX remediation) - a group buy inherently
    // depends on the buyer recruiting others to hit the threshold, so
    // "share this" is core to the feature, not a nice-to-have - reuses
    // the exact native-share/WhatsApp pattern Loyalty.jsx's referral
    // link already established in Phase 6.
    const shareUrl = window.location.href;
    const shareMessage = group
        ? `Join this group buy for ${group.product_name} on NEXORA - the more of us that join, the cheaper it gets: ${shareUrl}`
        : "";

    const handleNativeShare = async () => {
        if (!navigator.share) return;
        try {
            await navigator.share({ title: group?.product_name, text: shareMessage, url: shareUrl });
        } catch {
            // Cancelling the native share sheet throws - not an error.
        }
    };

    const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

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
                    <div className="h-full bg-teal transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-sm text-ash">{group.participant_count}/{group.min_participants} joined</p>
                <p className="text-sm text-ash mt-1">
                    {group.status === "open"
                        ? (formatTimeRemaining(group.deadline) || `Ends ${new Date(group.deadline).toLocaleString()}`)
                        : `Status: ${group.status}`}
                </p>

                {group.status === "open" && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-line">
                        <a
                            href={whatsappShareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.8 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.4.2.5.7 1.8.8 1.9.1.2.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.2-.3.3-.1.6.2.3.9 1.4 1.9 2.3 1.3 1.2 2.4 1.5 2.7 1.7.3.2.5.1.6-.1l1-1.1c.2-.3.4-.2.6-.1l1.7.8c.2.1.3.2.4.3.1.2.1.9-.1 1.3Z" />
                            </svg>
                            Share on WhatsApp
                        </a>
                        {navigator.share && (
                            <button
                                onClick={handleNativeShare}
                                className="border border-line px-3 py-1.5 rounded-md text-xs font-semibold hover:border-ink transition-colors"
                            >
                                Share…
                            </button>
                        )}
                    </div>
                )}
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
