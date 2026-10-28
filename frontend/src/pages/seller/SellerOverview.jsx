import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import SellerOnboardingChecklist from "../../components/seller/SellerOnboardingChecklist";
import Input from "../../components/ui/Input";
import { getVerificationTier } from "../../utils/verificationTier";
import { useLanguage } from "../../context/LanguageContext";

// Date chips for the revenue numbers. "all" leaves both ends empty.
const isoDay = (date) => date.toLocaleDateString("en-CA");

const presetRange = (key) => {
    const today = new Date();
    switch (key) {
        case "7d":
            return { from: isoDay(new Date(Date.now() - 6 * 86400000)), to: isoDay(today) };
        case "30d":
            return { from: isoDay(new Date(Date.now() - 29 * 86400000)), to: isoDay(today) };
        case "month":
            return { from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDay(today) };
        default:
            return { from: "", to: "" };
    }
};

const CHIPS = [
    { key: "7d", labelKey: "seller.overview.chip.7d" },
    { key: "30d", labelKey: "seller.overview.chip.30d" },
    { key: "month", labelKey: "seller.overview.chip.month" },
    { key: "all", labelKey: "seller.overview.chip.all" }
];

const ATTENTION_KEYS = {
    lowStock: "seller.overview.attention.lowStock",
    pendingOrdersOverDay: "seller.overview.attention.pendingOrdersOverDay",
    pendingBookings: "seller.overview.attention.pendingBookings"
};

// Overview for the seller. Stats come from one summary request, so the page
// no longer downloads every product, order and booking to count them.
export default function SellerOverview() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { profile } = useOutletContext();
    const merchantType = profile?.merchant_type || "product";
    const showProducts = merchantType === "product" || merchantType === "hybrid";
    const showServices = merchantType === "service" || merchantType === "hybrid";

    const [preset, setPreset] = useState("all");
    const [revenueFrom, setRevenueFrom] = useState("");
    const [revenueTo, setRevenueTo] = useState("");
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        api.get("/seller/overview", { params: { from: revenueFrom || undefined, to: revenueTo || undefined } })
            .then(({ data }) => {
                if (!cancelled) setSummary(data.data);
            })
            .catch((err) => {
                if (!cancelled) setError(extractErrorMessage(err));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [revenueFrom, revenueTo]);

    const pickPreset = (key) => {
        const range = presetRange(key);
        setPreset(key);
        setRevenueFrom(range.from);
        setRevenueTo(range.to);
    };

    const onCustomDate = (setter) => (e) => {
        setPreset("custom");
        setter(e.target.value);
    };

    const rangeLabel = revenueFrom || revenueTo ? t("seller.overview.inRange") : t("seller.overview.chip.all");

    // Stat numbers from the summary, or a dash before the first load.
    const s = summary;
    const show = (value, format = (v) => v) => (s ? format(value) : "–");

    if (!s && loading) return <OverviewSkeleton />;

    if (!s && error) {
        return (
            <div>
                <PageMeta title={t("seller.overview.metaTitle")} noIndex />
                <p role="alert" className="text-coral text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div>
            <PageMeta title={t("seller.overview.metaTitle")} noIndex />
            <h1 className="font-display text-2xl mb-1">{user?.first_name ? t("seller.overview.welcomeName", { name: user.first_name }) : t("seller.overview.welcome")}</h1>
            <p className="text-ash text-sm mb-8">{t("seller.overview.howDoing", { store: profile.store_name })}</p>
            {(profile.pickup_lat == null || profile.pickup_lng == null) && (
                <div role="alert" className="mb-6 rounded-lg border border-coral/40 bg-coral/10 p-4 flex flex-wrap items-center gap-3">
                    <p className="text-sm flex-1 min-w-[200px]">{t("seller.pin.required")}</p>
                    <Link to="/seller/store"><Button size="sm">{t("seller.pin.setNow")}</Button></Link>
                </div>
            )}

            <SellerOnboardingChecklist
                userId={user?.id}
                profile={profile}
                hasProducts={(s?.products.total ?? 0) > 0}
                hasServices={(s?.services.total ?? 0) > 0}
                merchantType={merchantType}
            />

            {s?.attention.length > 0 && (
                <section aria-labelledby="needs-attention" className="border border-mango/50 bg-mango/5 rounded-lg p-4 mb-8">
                    <h2 id="needs-attention" className="text-xs uppercase tracking-widest text-ash mb-2">{t("seller.overview.needsAttention")}</h2>
                    <ul className="space-y-1.5">
                        {s.attention.map((item) => (
                            <li key={item.key} className="text-sm flex flex-wrap items-center justify-between gap-2">
                                <span>{ATTENTION_KEYS[item.key] ? t(`${ATTENTION_KEYS[item.key]}.${item.count === 1 ? "one" : "other"}`, { count: item.count }) : null}</span>
                                <Link to={item.to} className="text-azure text-sm hover:underline">{t("seller.overview.review")}</Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {(showProducts || showServices) && (
                <div className="mb-8">
                    <p className="text-xs uppercase tracking-widest text-ash mb-3">{t("seller.overview.revenuePeriod")}</p>
                    <div className="flex flex-wrap items-end gap-2" role="group" aria-label={t("seller.overview.revenuePeriod")}>
                        {CHIPS.map((chip) => (
                            <button
                                key={chip.key}
                                type="button"
                                onClick={() => pickPreset(chip.key)}
                                aria-pressed={preset === chip.key}
                                className={`text-xs px-3 py-1.5 rounded-full border transition-colors focus-ring ${
                                    preset === chip.key ? "bg-ink text-paper border-ink" : "border-line text-ink/80 hover:border-ink"
                                }`}
                            >
                                {t(chip.labelKey)}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-end gap-3 mt-3">
                        <div className="text-xs text-ash flex flex-col gap-1">
                            <label htmlFor="revenueFrom">{t("seller.overview.from")}</label>
                            <Input id="revenueFrom" type="date" value={revenueFrom} max={revenueTo || undefined} onChange={onCustomDate(setRevenueFrom)} />
                        </div>
                        <div className="text-xs text-ash flex flex-col gap-1">
                            <label htmlFor="revenueTo">{t("seller.overview.to")}</label>
                            <Input id="revenueTo" type="date" value={revenueTo} min={revenueFrom || undefined} onChange={onCustomDate(setRevenueTo)} />
                        </div>
                    </div>
                </div>
            )}

            {error && s && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <div aria-busy={loading} className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                {showProducts && (
                    <div className="mb-10">
                        <p className="text-xs uppercase tracking-widest text-ash mb-3">{t("seller.overview.productsOrders")}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <Stat
                                label={t("seller.overview.products")}
                                value={show(s?.products.total)}
                                sub={s ? t("seller.overview.activeDraft", { active: s.products.active, drafts: s.products.drafts }) : undefined}
                                delay={0}
                            />
                            <Stat
                                label={t("seller.overview.orders")}
                                value={show(s?.orders.total)}
                                sub={s ? t("seller.overview.pendingCount", { count: s.orders.pending }) : undefined}
                                delay={40}
                            />
                            <Stat
                                label={t("seller.overview.grossSales")}
                                value={show(s?.revenue.productGross, formatMoney)}
                                sub={rangeLabel}
                                mono
                                delay={80}
                            />
                            <Stat
                                label={t("seller.overview.netEarnings")}
                                value={show(s?.revenue.productNet, formatMoney)}
                                sub={t("seller.overview.afterCommission")}
                                mono
                                delay={120}
                            />
                        </div>
                    </div>
                )}

                {showServices && (
                    <div className="mb-10">
                        <p className="text-xs uppercase tracking-widest text-ash mb-3">{t("seller.overview.servicesBookings")}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <Stat
                                label={t("seller.overview.services")}
                                value={show(s?.services.total)}
                                sub={s ? t("seller.overview.activeDraft", { active: s.services.active, drafts: s.services.drafts }) : undefined}
                                delay={160}
                            />
                            <Stat
                                label={t("seller.overview.bookings")}
                                value={show(s?.bookings.total)}
                                sub={s ? t("seller.overview.pendingCount", { count: s.bookings.pending }) : undefined}
                                delay={200}
                            />
                            <Stat
                                label={t("seller.overview.bookingRevenue")}
                                value={show(s?.revenue.bookingGross, formatMoney)}
                                sub={t("seller.overview.bookingRevenueSub", { range: rangeLabel })}
                                mono
                                delay={240}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-10">
                <p className="text-xs uppercase tracking-widest text-ash mb-3">{t("seller.overview.account")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Stat
                        label={t("seller.overview.status")}
                        value={getVerificationTier(profile) ? t("verification.sellerBadge") : profile?.is_verified ? t("sellerBadge.approvedToSell") : t("sellerBadge.pending")}
                        highlight={!!getVerificationTier(profile)}
                        delay={280}
                    />
                    <VerificationProgress profile={profile} />
                </div>
            </div>

            <div>
                <p className="text-xs uppercase tracking-widest text-ash mb-3">{t("seller.overview.quickActions")}</p>
                <div className="flex flex-wrap gap-3">
                    {showProducts && (
                        <>
                            <Button as={Link} to="/seller/products/new" size="sm">{t("seller.overview.listProduct")}</Button>
                            <Link to="/seller/orders" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                                {t("seller.overview.viewOrders")}
                            </Link>
                        </>
                    )}
                    {showServices && (
                        <>
                            <Button as={Link} to="/seller/services/new" size="sm">{t("seller.overview.listService")}</Button>
                            <Link to="/seller/bookings" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                                {t("seller.overview.viewBookings")}
                            </Link>
                            <Link to="/seller/availability" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                                {t("seller.overview.manageAvailability")}
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Verification steps as a progress bar. "Approved to sell" is always done
// here because this page only renders for approved sellers; the second step
// is the single Verified Seller badge (seller KYC).
function VerificationProgress({ profile }) {
    const { t } = useLanguage();
    const hasBadge = Boolean(getVerificationTier(profile));
    const steps = [
        { label: t("sellerBadge.step.approved"), done: true },
        { label: t("sellerBadge.step.badge"), done: hasBadge }
    ];
    const doneCount = steps.filter((step) => step.done).length;
    const percent = Math.round((doneCount / steps.length) * 100);
    const next = steps.find((step) => !step.done);

    return (
        <div className="sm:col-span-2 border border-line rounded-lg p-4">
            <div className="flex justify-between text-xs text-ash mb-2">
                <span>{t("sellerBadge.progressTitle")}</span>
                <span>{t("sellerBadge.progressCount", { done: doneCount, total: steps.length })}</span>
            </div>
            <div
                className="h-2 rounded-full bg-paper border border-line overflow-hidden"
                role="progressbar"
                aria-label={t("sellerBadge.progressTitle")}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div className="h-full bg-teal transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-ash mt-2">
                {next
                    ? <>{t("sellerBadge.progressNext", { step: next.label })} <Link to="/seller/verification" className="text-azure hover:underline">{t("sellerBadge.progressContinue")}</Link></>
                    : t("sellerBadge.progressDone")}
            </p>
        </div>
    );
}

// Placeholder blocks shaped like the real stat grid, so the layout doesn't jump.
function OverviewSkeleton() {
    const { t } = useLanguage();
    return (
        <div aria-busy="true" aria-label={t("seller.overview.loading")}>
            <div className="h-7 w-56 bg-line/60 rounded animate-pulse mb-2" />
            <div className="h-4 w-72 bg-line/40 rounded animate-pulse mb-8" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-lg bg-line/40 animate-pulse" />
                ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="h-24 rounded-lg bg-line/40 animate-pulse" />
                <div className="h-24 rounded-lg bg-line/40 animate-pulse sm:col-span-2" />
            </div>
        </div>
    );
}

// Matches the Stat card on SellerAnalytics.jsx so the two pages look alike.
function Stat({ label, value, sub, mono, delay = 0, highlight }) {
    return (
        <div
            className={`border rounded-lg p-4 animate-slide-up hover:-translate-y-0.5 hover:shadow-md transition-all ${highlight ? "border-teal/30 bg-teal/5" : "border-line"}`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`text-xl font-medium ${mono ? "price" : "font-display"} ${highlight ? "text-teal" : ""}`}>{value}</p>
            {sub && <p className="text-xs text-ash mt-0.5">{sub}</p>}
        </div>
    );
}
