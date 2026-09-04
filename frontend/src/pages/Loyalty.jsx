import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { formatDate } from "../utils/format";

export default function Loyalty() {
    const { user } = useAuth();
    const { format } = useCurrency();
    const [status, setStatus] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        api.get("/loyalty/me").then(({ data }) => setStatus(data.data)).catch(() => {});
    }, []);

    if (!status) return <PageLoader />;

    const referralLink = `${window.location.origin}/register?ref=${user?.referral_code || ""}`;
    const referralMessage = `Join me on NEXORA and get a head start - sign up with my link: ${referralLink}`;

    const copyLink = () => {
        navigator.clipboard?.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Native share + WhatsApp-specific share (Phase 6, UI/UX
    // remediation) - a referral program's whole value depends on how
    // easily it spreads, and "copy link" alone puts more friction
    // between a buyer and actually sharing it than necessary,
    // especially in a market where WhatsApp is the dominant sharing
    // channel. navigator.share() covers the native share sheet where
    // available (mobile); the WhatsApp link works everywhere regardless
    // (opens the app if installed, wa.me web fallback otherwise).
    const handleNativeShare = async () => {
        if (!navigator.share) return;
        try {
            await navigator.share({ title: "Join me on NEXORA", text: referralMessage, url: referralLink });
        } catch {
            // Cancelling the native share sheet throws - not an error
            // worth surfacing.
        }
    };

    const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(referralMessage)}`;

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Loyalty & referrals" noIndex />
            <h1 className="font-display text-2xl mb-1">Loyalty & referrals</h1>
            <p className="text-ash text-sm mb-8">Earn points on every order, and bonus points for every friend you bring to NEXORA.</p>

            <div className="border border-line rounded-lg p-6 mb-8">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Points balance</p>
                <p className="font-display text-3xl mb-1">{status.balance} pts</p>
                <p className="text-sm text-ash">Worth {format(status.balance * status.pointValueTzs)} - redeem at checkout</p>
            </div>

            <div className="border border-line rounded-lg p-6 mb-8">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Your referral link</p>
                <p className="text-sm font-mono break-all mb-3">{referralLink}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    <button
                        onClick={copyLink}
                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                        {copied ? "Copied!" : "Copy link"}
                    </button>
                    <a
                        href={whatsappShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 bg-[#25D366] text-white px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.8 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.4.2.5.7 1.8.8 1.9.1.2.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.2-.3.3-.1.6.2.3.9 1.4 1.9 2.3 1.3 1.2 2.4 1.5 2.7 1.7.3.2.5.1.6-.1l1-1.1c.2-.3.4-.2.6-.1l1.7.8c.2.1.3.2.4.3.1.2.1.9-.1 1.3Z" />
                        </svg>
                        Share on WhatsApp
                    </a>
                    {navigator.share && (
                        <button
                            onClick={handleNativeShare}
                            className="border border-line px-4 py-2 rounded-md text-sm font-semibold hover:border-ink transition-colors"
                        >
                            Share…
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-2 bg-white rounded-md border border-line shrink-0">
                        <QRCodeSVG value={referralLink} size={96} level="M" />
                    </div>
                    <p className="text-xs text-ash">
                        Scan to open your referral link on another phone - handy for sharing in person.
                    </p>
                </div>

                <p className="text-xs text-ash mt-3">You get 200 bonus points when someone you refer completes their first order.</p>
            </div>

            <h2 className="font-display text-lg mb-3">Your referrals</h2>
            {status.referrals.length === 0 ? (
                <p className="text-ash text-sm mb-8">No referrals yet.</p>
            ) : (
                <ul className="space-y-2 mb-8">
                    {status.referrals.map((r) => (
                        <li key={r.id} className="flex justify-between text-sm border-b border-line pb-2">
                            <span>{r.first_name} {r.last_name}</span>
                            <span className={r.bonus_awarded ? "text-teal" : "text-ash"}>
                                {r.bonus_awarded ? "Bonus earned" : "Waiting on first order"}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <h2 className="font-display text-lg mb-3">Points history</h2>
            {status.ledger.length === 0 ? (
                <p className="text-ash text-sm">No activity yet.</p>
            ) : (
                <ul className="space-y-2">
                    {status.ledger.map((entry) => (
                        <li key={entry.id} className="flex justify-between text-sm border-b border-line pb-2">
                            <span>
                                <span className="block">{entry.description || entry.type}</span>
                                <span className="text-ash text-xs">{formatDate(entry.created_at)}</span>
                            </span>
                            <span className={entry.points > 0 ? "text-teal" : "text-coral"}>
                                {entry.points > 0 ? "+" : ""}{entry.points}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
