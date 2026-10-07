import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageState from "../components/ui/PageState";
import { WhatsAppShareButton, NativeShareButton } from "../components/ShareButtons";
import useFetch from "../hooks/useFetch";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";

export default function Loyalty() {
    const { user } = useAuth();
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [copied, setCopied] = useState(false);

    // (Phase 4 remediation) - this was previously a bare
    // `.catch(() => {})` with `status` staying null forever on failure,
    // and `if (!status) return <PageLoader />` meant a failed load was
    // visually identical to "still loading" - no error, no retry, just
    // an infinite spinner. useFetch + PageState give it a real error
    // state.
    const { data: status, loading, error, retry } = useFetch(
        () => api.get("/loyalty/me").then(({ data }) => data.data),
        []
    );

    if (loading || error) {
        return (
            <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
                <PageMeta title="Loyalty & referrals" noIndex />
                <PageState
                    loading={loading}
                    error={error}
                    onRetry={retry}
                    errorProps={{ title: t("loyalty.loadErrorTitle"), hint: t("loyalty.loadErrorHint") }}
                />
            </div>
        );
    }

    const referralLink = `${window.location.origin}/register?ref=${user?.referral_code || ""}`;
    const referralMessage = `Join me on NEXORA and get a head start - sign up with my link: ${referralLink}`;

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
                <h2 className="font-display text-lg mb-3">{t("loyalty.how.title")}</h2>
                <ul className="space-y-2 text-sm text-ink/80 list-disc pl-5">
                    <li>{t("loyalty.how.earn", { points: status.pointsPer1000Spent ?? 1, amount: format(1000) })}</li>
                    <li>{t("loyalty.how.redeem", { value: format(status.pointValueTzs) })}</li>
                    <li>{t("loyalty.how.referral", { points: status.referralBonusPoints })}</li>
                </ul>
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
                    <WhatsAppShareButton url={referralLink} text={referralMessage} size="md" />
                    <NativeShareButton title="Join me on NEXORA" text={referralMessage} url={referralLink} size="md" />
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-2 bg-white rounded-md border border-line shrink-0">
                        <QRCodeSVG value={referralLink} size={96} level="M" />
                    </div>
                    <p className="text-xs text-ash">
                        Scan to open your referral link on another phone - handy for sharing in person.
                    </p>
                </div>

                {/* (Phase 4 remediation): this figure now comes from
                    the API (`status.referralBonusPoints`, sourced from
                    REFERRAL_BONUS_POINTS in referral.service.js)
                    instead of being hand-typed here - a change to the
                    bonus amount on the backend previously required
                    remembering to also edit this unrelated string, and
                    nothing would have caught it if someone forgot. */}
                <p className="text-xs text-ash mt-3">{t("loyalty.referralBonusNote", { points: status.referralBonusPoints })}</p>
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
