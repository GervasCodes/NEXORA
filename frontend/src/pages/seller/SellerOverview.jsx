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
    { key: "7d", label: "Last 7 days" },
    { key: "30d", label: "Last 30 days" },
    { key: "month", label: "This month" },
    { key: "all", label: "All time" }
];

const ATTENTION_TEXT = {
    lowStock: (n) => `${n} ${n === 1 ? "product is" : "products are"} low on stock (3 or fewer left)`,
    pendingOrdersOverDay: (n) => `${n} ${n === 1 ? "order has" : "orders have"} been pending for over a day`,
    pendingBookings: (n) => `${n} ${n === 1 ? "booking is" : "bookings are"} waiting for your response`
};

// Overview for the seller. Stats come from one summary request, so the page
// no longer downloads every product, order and booking to count them.
export default function SellerOverview() {
    const { user } = useAuth();
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

    const rangeLabel = revenueFrom || revenueTo ? "In range" : "All time";

    // Stat numbers from the summary, or a dash before the first load.
    const s = summary;
    const show = (value, format = (v) => v) => (s ? format(value) : "–");

    if (!s && loading) return <OverviewSkeleton />;

    if (!s && error) {
        return (
            <div>
                <PageMeta title="Seller Dashboard" noIndex />
                <p role="alert" className="text-coral text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div>
            <PageMeta title="Seller Dashboard" noIndex />
            <h1 className="font-display text-2xl mb-1">{user?.first_name ? `Welcome back, ${user.first_name}` : "Welcome back"}</h1>
            <p className="text-ash text-sm mb-8">Here's how {profile.store_name} is doing.</p>

            <SellerOnboardingChecklist
                userId={user?.id}
                profile={profile}
                hasProducts={(s?.products.total ?? 0) > 0}
                hasServices={(s?.services.total ?? 0) > 0}
                merchantType={merchantType}
            />

            {s?.attention.length > 0 && (
                <section aria-labelledby="needs-attention" className="border border-mango/50 bg-mango/5 rounded-lg p-4 mb-8">
                    <h2 id="needs-attention" className="text-xs uppercase tracking-widest text-ash mb-2">Needs attention</h2>
                    <ul className="space-y-1.5">
                        {s.attention.map((item) => (
                            <li key={item.key} className="text-sm flex flex-wrap items-center justify-between gap-2">
                                <span>{ATTENTION_TEXT[item.key]?.(item.count)}</span>
                                <Link to={item.to} className="text-azure text-sm hover:underline">Review</Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {(showProducts || showServices) && (
                <div className="mb-8">
                    <p className="text-xs uppercase tracking-widest text-ash mb-3">Revenue period</p>
                    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Revenue period">
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
                                {chip.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-end gap-3 mt-3">
                        <div className="text-xs text-ash flex flex-col gap-1">
                            <label htmlFor="revenueFrom">From</label>
                            <Input id="revenueFrom" type="date" value={revenueFrom} max={revenueTo || undefined} onChange={onCustomDate(setRevenueFrom)} />
                        </div>
                        <div className="text-xs text-ash flex flex-col gap-1">
                            <label htmlFor="revenueTo">To</label>
                            <Input id="revenueTo" type="date" value={revenueTo} min={revenueFrom || undefined} onChange={onCustomDate(setRevenueTo)} />
                        </div>
                    </div>
                </div>
            )}

            {error && s && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <div aria-busy={loading} className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                {showProducts && (
                    <div className="mb-10">
                        <p className="text-xs uppercase tracking-widest text-ash mb-3">Products & orders</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <Stat
                                label="Products"
                                value={show(s?.products.total)}
                                sub={s ? `${s.products.active} active · ${s.products.drafts} draft` : undefined}
                                delay={0}
                            />
                            <Stat
                                label="Orders"
                                value={show(s?.orders.total)}
                                sub={s ? `${s.orders.pending} pending` : undefined}
                                delay={40}
                            />
                            <Stat
                                label="Gross sales"
                                value={show(s?.revenue.productGross, formatMoney)}
                                sub={rangeLabel}
                                mono
                                delay={80}
                            />
                            <Stat
                                label="Net earnings"
                                value={show(s?.revenue.productNet, formatMoney)}
                                sub="After commission"
                                mono
                                delay={120}
                            />
                        </div>
                    </div>
                )}

                {showServices && (
                    <div className="mb-10">
                        <p className="text-xs uppercase tracking-widest text-ash mb-3">Services & bookings</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <Stat
                                label="Services"
                                value={show(s?.services.total)}
                                sub={s ? `${s.services.active} active · ${s.services.drafts} draft` : undefined}
                                delay={160}
                            />
                            <Stat
                                label="Bookings"
                                value={show(s?.bookings.total)}
                                sub={s ? `${s.bookings.pending} pending` : undefined}
                                delay={200}
                            />
                            <Stat
                                label="Booking revenue"
                                value={show(s?.revenue.bookingGross, formatMoney)}
                                sub={`${rangeLabel} · gross, commission not yet tracked`}
                                mono
                                delay={240}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-10">
                <p className="text-xs uppercase tracking-widest text-ash mb-3">Account</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Stat
                        label="Status"
                        value={{ business: "Verified Business", seller: "Verified Seller" }[getVerificationTier(profile)] || "Pending"}
                        highlight={!!getVerificationTier(profile)}
                        delay={280}
                    />
                    <VerificationProgress profile={profile} />
                </div>
            </div>

            <div>
                <p className="text-xs uppercase tracking-widest text-ash mb-3">Quick actions</p>
                <div className="flex flex-wrap gap-3">
                    {showProducts && (
                        <>
                            <Button as={Link} to="/seller/products/new" size="sm">List a new product</Button>
                            <Link to="/seller/orders" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                                View orders
                            </Link>
                        </>
                    )}
                    {showServices && (
                        <>
                            <Button as={Link} to="/seller/services/new" size="sm">List a new service</Button>
                            <Link to="/seller/bookings" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                                View bookings
                            </Link>
                            <Link to="/seller/availability" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                                Manage availability
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Verification steps as a progress bar. "Account approved" is always done
// here because this page only renders for approved sellers.
function VerificationProgress({ profile }) {
    const tier = getVerificationTier(profile);
    const steps = [
        { label: "account approved", done: true },
        { label: "ID verified", done: Boolean(tier) },
        { label: "business verified", done: tier === "business" }
    ];
    const doneCount = steps.filter((step) => step.done).length;
    const percent = Math.round((doneCount / steps.length) * 100);
    const next = steps.find((step) => !step.done);

    return (
        <div className="sm:col-span-2 border border-line rounded-lg p-4">
            <div className="flex justify-between text-xs text-ash mb-2">
                <span>Verification progress</span>
                <span>{doneCount} of {steps.length}</span>
            </div>
            <div
                className="h-2 rounded-full bg-paper border border-line overflow-hidden"
                role="progressbar"
                aria-label="Verification progress"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div className="h-full bg-teal transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-ash mt-2">
                {next
                    ? <>Next: {next.label}. <Link to="/seller/verification" className="text-azure hover:underline">Continue verification</Link></>
                    : "Fully verified. Buyers see your Verified Business badge."}
            </p>
        </div>
    );
}

// Placeholder blocks shaped like the real stat grid, so the layout doesn't jump.
function OverviewSkeleton() {
    return (
        <div aria-busy="true" aria-label="Loading dashboard">
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
