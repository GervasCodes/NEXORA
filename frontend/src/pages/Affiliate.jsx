import { useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageState from "../components/ui/PageState";
import useFetch from "../hooks/useFetch";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";

export default function Affiliate() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [applying, setApplying] = useState(false);
    const [applyError, setApplyError] = useState("");
    const [copied, setCopied] = useState(false);
    const [productUrl, setProductUrl] = useState("");
    const [productLinkCopied, setProductLinkCopied] = useState(false);

    // (Phase 4 remediation) - previously a single
    // `.catch(() => setDashboard(null))` meant "you're not an affiliate
    // yet" (the backend's expected 404) and "the request actually
    // failed" (network error, 500, etc.) rendered the exact same "Become
    // an affiliate" screen. A genuine load failure then silently invited
    // the buyer to click "Become an affiliate", which would just fail
    // again with no indication anything was wrong with the connection
    // rather than with their eligibility. useFetch's `notFound` lets the
    // 404 flow into its own branch, separate from `error`.
    const { data: dashboard, loading, error, notFound, retry } = useFetch(
        () => api.get("/affiliate/me")
            .then(({ data }) => data.data)
            .catch((err) => {
                if (err?.response?.status === 404) {
                    const notFoundErr = new Error("not an affiliate");
                    notFoundErr.notFound = true;
                    throw notFoundErr;
                }
                throw err;
            }),
        []
    );

    const apply = async () => {
        setApplying(true);
        setApplyError("");
        try {
            await api.post("/affiliate/apply");
            retry();
        } catch (err) {
            setApplyError(extractErrorMessage(err));
        } finally {
            setApplying(false);
        }
    };

    if (loading || error) {
        return (
            <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
                <PageMeta title="Affiliate dashboard" noIndex />
                <PageState
                    loading={loading}
                    error={error}
                    onRetry={retry}
                    errorProps={{ title: t("affiliate.loadErrorTitle"), hint: t("affiliate.loadErrorHint") }}
                />
            </div>
        );
    }

    if (notFound || !dashboard) {
        return (
            <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
                <PageMeta title="Become an affiliate" noIndex />
                <h1 className="font-display text-2xl mb-2">Earn by sharing NEXORA</h1>
                <p className="text-ash text-sm mb-6">Get your own referral link. Earn a commission on every order placed through it.</p>
                {applyError && <p className="text-sm text-coral mb-4">{applyError}</p>}
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

    // Any NEXORA page works with ?ref=CODE, so a per-product link is just
    // that page's URL plus the code. Only links on this site are accepted.
    const buildProductLink = () => {
        try {
            const u = new URL(productUrl.trim());
            if (u.origin !== window.location.origin) return null;
            u.searchParams.set("ref", dashboard.account.code);
            return u.toString();
        } catch {
            return null;
        }
    };
    const productLink = productUrl.trim() ? buildProductLink() : null;
    const copyProductLink = () => {
        if (!productLink) return;
        navigator.clipboard?.writeText(productLink);
        setProductLinkCopied(true);
        setTimeout(() => setProductLinkCopied(false), 2000);
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

            <div className="border border-line rounded-lg p-6 mb-6">
                <p className="text-sm font-medium mb-2">{t("affiliate.productLink.title")}</p>
                <input
                    type="url"
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    placeholder={t("affiliate.productLink.placeholder")}
                    aria-label={t("affiliate.productLink.title")}
                    className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                />
                {productUrl.trim() && !productLink && (
                    <p role="alert" className="text-xs text-coral mt-1">{t("affiliate.productLink.invalid")}</p>
                )}
                {productLink && (
                    <>
                        <p className="text-xs font-mono break-all mt-2 mb-2">{productLink}</p>
                        <button onClick={copyProductLink} className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
                            {productLinkCopied ? "Copied!" : "Copy link"}
                        </button>
                    </>
                )}
            </div>

            <div className="border border-line rounded-lg p-6 mb-6">
                <p className="text-sm font-medium mb-2">{t("affiliate.terms.title")}</p>
                <ul className="space-y-1.5 text-sm text-ink/80 list-disc pl-5">
                    <li>{t("affiliate.terms.rate", { rate: (dashboard.account.commission_rate * 100).toFixed(0) })}</li>
                    {dashboard.attributionWindowDays ? <li>{t("affiliate.terms.window", { days: dashboard.attributionWindowDays })}</li> : null}
                    <li>{t("affiliate.terms.noSelf")}</li>
                    <li>{t("affiliate.terms.payout")} <Link to="/account/wallet" className="text-teal hover:underline">{t("affiliate.terms.openWallet")}</Link></li>
                </ul>
            </div>

            {/* p-3/text-lg on mobile, growing to p-4/text-xl from sm: -
                "Earned" holds a formatted currency figure that can run
                long (e.g. "TZS 245,000"), which needs the extra room a
                plain grid-cols-3 + p-4 + text-xl leaves it on a narrow
                phone (~110px per column after gaps). */}
            <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="border border-line rounded-lg p-3 sm:p-4 text-center">
                    <p className="font-display text-lg sm:text-xl">{dashboard.clickCount}</p>
                    <p className="text-xs text-ash">Clicks</p>
                </div>
                <div className="border border-line rounded-lg p-3 sm:p-4 text-center">
                    <p className="font-display text-lg sm:text-xl">{dashboard.conversions.length}</p>
                    <p className="text-xs text-ash">Orders</p>
                </div>
                <div className="border border-line rounded-lg p-3 sm:p-4 text-center">
                    <p className="font-display text-lg sm:text-xl break-words">{format(dashboard.totalEarnings)}</p>
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
                            <span>
                                <span className="block">Order {c.order_number} · {formatDate(c.created_at)}</span>
                                {c.status && <span className="text-ash text-xs">{t(`affiliate.status.${c.status}`) !== `affiliate.status.${c.status}` ? t(`affiliate.status.${c.status}`) : c.status}</span>}
                            </span>
                            <span className="text-teal">{format(c.commission_amount)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
