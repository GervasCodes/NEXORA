import { useEffect, useState } from "react";
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

    const copyLink = () => {
        navigator.clipboard?.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

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
                <button
                    onClick={copyLink}
                    className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                    {copied ? "Copied!" : "Copy link"}
                </button>
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
