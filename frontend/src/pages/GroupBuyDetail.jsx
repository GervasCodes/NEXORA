import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import PhoneInput from "../components/PhoneInput";
import StatusBadge from "../components/ui/StatusBadge";
import { WhatsAppShareButton, NativeShareButton } from "../components/ShareButtons";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { formatTimeRemaining } from "../utils/format";

// Status -> buyer-facing explanation (Phase 4 remediation) - a status
// badge alone ("Failed") doesn't tell a buyer who already joined what
// actually happened or whether they're owed anything; this fills that
// gap next to the badge.
const STATUS_EXPLANATIONS = {
    open: null,
    successful: "group.status.explain.successful",
    failed: "group.status.explain.failed",
    cancelled: "group.status.explain.cancelled"
};

export default function GroupBuyDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const { format } = useCurrency();
    const { t } = useLanguage();
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

    // Live countdown (Phase 4 remediation) - formatTimeRemaining()
    // computes off Date.now() at call time, but nothing was forcing a
    // re-render as time passed, so "2 hours left" sat frozen on screen
    // until the next unrelated re-render (e.g. after join/claim). A
    // 30s tick is enough resolution for a countdown measured in
    // minutes/hours without re-rendering more than this page needs.
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick((n) => n + 1), 30000);
        return () => clearInterval(timer);
    }, []);

    // Share ( UI/UX remediation) - a group buy inherently
    // depends on the buyer recruiting others to hit the threshold, so
    // "share this" is core to the feature, not a nice-to-have - reuses
    // the exact native-share/WhatsApp pattern Loyalty.jsx's referral
    // link already established in Phase 6.
    const shareUrl = window.location.href;
    const shareMessage = group
        ? `Join this group buy for ${group.product_name} on NEXORA - the more of us that join, the cheaper it gets: ${shareUrl}`
        : "";

    const join = async () => {
        // Guests ( UI/UX remediation): previously the Join
        // button simply didn't render for a signed-out visitor, so a
        // guest who followed a shared group-buy link had no way to act
        // on it short of noticing the separate login link in the header.
        // Sending them to login with a returnTo lands them right back
        // here, able to join immediately, same pattern as the
        // add-to-cart/save guest flow elsewhere in the app.
        if (!user) {
            navigate(`/login?returnTo=${encodeURIComponent(`/group-buys/${id}`)}`);
            return;
        }
        setBusy(true);
        setError("");
        try {
            await api.post(`/group-buys/${id}/join`);
            setMessage("You're in! We'll notify you once the group buy is resolved - no payment is taken now.");
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
    const moreNeeded = Math.max(0, group.min_participants - group.participant_count);
    const explanationKey = STATUS_EXPLANATIONS[group.status];

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title={group.product_name} noIndex />

            {group.product_image && (
                <Link to={`/products/${group.product_slug}`} className="block rounded-lg overflow-hidden mb-4 border border-line">
                    <img src={group.product_image} alt={group.product_name} className="w-full h-48 object-cover" loading="lazy" width="600" height="192" />
                </Link>
            )}
            <Link to={`/products/${group.product_slug}`} className="text-teal text-sm hover:underline">{group.product_name}</Link>
            <h1 className="font-display text-2xl mt-1 mb-4">Group buy</h1>

            <div className="border border-line rounded-lg p-6 mb-6">
                <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-baseline gap-3">
                        <p className="price font-display text-2xl">{format(group.group_price)}</p>
                        <p className="text-ash line-through">{format(group.product_price)}</p>
                    </div>
                    <StatusBadge domain="groupBuy" status={group.status} />
                </div>
                <div className="h-2 bg-line rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-teal transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-sm text-ash">
                    {group.participant_count}/{group.min_participants} joined
                    {group.status === "open" && moreNeeded > 0 && (
                        <span className="text-mango-dark font-medium"> · {moreNeeded} more {moreNeeded === 1 ? "person" : "people"} needed</span>
                    )}
                </p>
                {group.status === "open" && (
                    <p className="text-sm text-ash mt-1">
                        {formatTimeRemaining(group.deadline) || `Ends ${new Date(group.deadline).toLocaleString()}`}
                    </p>
                )}
                {explanationKey && (
                    <p className="text-sm text-ash mt-1">{t(explanationKey)}</p>
                )}

                {group.status === "open" && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-line">
                        <WhatsAppShareButton url={shareUrl} text={shareMessage} size="sm" />
                        <NativeShareButton title={group?.product_name} text={shareMessage} url={shareUrl} size="sm" />
                    </div>
                )}
            </div>

            {error && <p className="text-sm text-coral mb-4">{error}</p>}
            {message && <p className="text-sm text-teal mb-4">{message}</p>}

            {/* Guests now see Join too (see the `join` handler above) -
                previously gated to `user?.role === "buyer"`, so a guest
                saw no call to action at all. `(!user || user.role ===
                "buyer")` keeps sellers/agents from seeing a Join button
                that isn't meant for them while still showing it to a
                signed-out visitor. */}
            {(!user || user.role === "buyer") && group.status === "open" && (
                <div>
                    <button
                        disabled={busy}
                        onClick={join}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {busy ? "Joining…" : "Join - no payment yet"}
                    </button>
                    <p className="text-xs text-ash mt-2">
                        Joining is free. You'll only pay if the group buy reaches {group.min_participants} people before the deadline.
                    </p>
                </div>
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
                    <p className="text-sm font-medium">Delivery details - payment of {format(group.group_price)} happens on the next step</p>
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
