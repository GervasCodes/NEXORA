import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useCart } from "../context/CartContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import LocationPicker from "../components/LocationPicker";
import PhoneInput from "../components/PhoneInput";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import CheckoutSteps from "../components/ui/CheckoutSteps";
import PageMeta from "../components/PageMeta";
import { getStoredAffiliateClickToken } from "../components/AffiliateClickTracker";

const initialForm = {
    shipping_address: "",
    shipping_city: "",
    shipping_region: "",
    shipping_phone: "",
    payment_method: "mobile_money",
    buyer_protection_addon: false,
    pickup_point_id: "",
    address_id: "",
    coupon_code: ""
};

// Mirrors order.service.js#calculateBuyerProtectionFee - client-side
// estimate only, purely for display; the backend recomputes and charges
// the authoritative amount.
const BUYER_PROTECTION_FEE_RATE = 0.015;
const BUYER_PROTECTION_FEE_MIN = 1000;
const BUYER_PROTECTION_FEE_MAX = 20000;
const estimateBuyerProtectionFee = (subtotal) => {
    const raw = subtotal * BUYER_PROTECTION_FEE_RATE;
    return Math.min(Math.max(raw, BUYER_PROTECTION_FEE_MIN), BUYER_PROTECTION_FEE_MAX);
};

// Non-card, non-provider-agnostic options - these keep their own fixed
// label/checkout wiring below. Card providers (Snippe, MalipoPay Card,
// and any future card rail) are NOT listed here - they're generated from
// GET /payments/methods at render time (see cardPaymentMethods below) so
// checkout never needs a frontend change to pick up a newly-configured
// card gateway. Split into "before" and "after" so the dynamic card
// options can be inserted between them, preserving the original
// mobile money -> cash on delivery -> card(s) -> PayPal ordering.
const PAYMENT_METHODS_BEFORE_CARDS = [
    { value: "mobile_money", label: "Mobile Money" },
    { value: "cash_on_delivery", label: "Cash on Delivery" }
];
const PAYMENT_METHODS_AFTER_CARDS = [
    { value: "paypal", label: "PayPal", hint: "(charged in USD)" }
];

// Phase 5 (Resilience & Growth): cash_on_delivery isn't a payment-provider
// rail at all (no gateway involved), so it's never filtered by
// GET /payments/methods below - only the provider-backed static options
// are (card rails are filtered separately - see cardPaymentMethods).
const PROVIDER_GATED_METHODS = new Set(["mobile_money", "paypal"]);

// Human-friendly labels for known card provider keys - falls back to the
// registry's own `label` for any key not listed here, so a brand-new
// card rail still renders sensibly with zero frontend changes.
const CARD_PROVIDER_LABELS = {
    malipopay_card: "Card (MalipoPay)",
    snippe: "Card (Snippe)"
};

// Fail-open fallback for the card rails specifically. If GET
// /payments/methods errors out entirely, `configuredProviders` has no
// data to build card rows from, so without this fallback the card
// options would silently disappear on failure while the static
// methods (mobile_money/paypal) correctly stay visible via
// `configuredKeys === null` below - an inconsistent fail-open story.
// Falling back to every known card provider keeps checkout usable
// (worst case, someone selects a card rail that happens to be
// unconfigured, which the backend still validates) instead of
// quietly hiding a valid way to pay.
const DEFAULT_CARD_PROVIDERS = Object.keys(CARD_PROVIDER_LABELS).map((key) => ({
    key,
    type: "card",
    label: CARD_PROVIDER_LABELS[key]
}));

export default function Checkout() {
    const { format } = useCurrency();
    const { items, total, refresh } = useCart();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const toast = useToast();
    const [form, setForm] = useState(initialForm);
    const [pin, setPin] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [redirecting, setRedirecting] = useState(false);
    // Phase 5 (Resilience & Growth), extended for MalipoPay Card: null =
    // still loading / endpoint unavailable - in either case every method
    // stays visible (fail-open), so this lookup can never make checkout
    // show FEWER options than it did before this phase if something's
    // wrong with it. Holds the full provider objects (not just keys) so
    // card options below can be built entirely from what the registry
    // reports, instead of a hardcoded card provider list.
    const [configuredProviders, setConfiguredProviders] = useState(null);
    const [providersFetchFailed, setProvidersFetchFailed] = useState(false);
    const configuredKeys = configuredProviders && configuredProviders.map((provider) => provider.key);

    // Loyalty points redemption (Phase Q7) - fetched once; the server
    // re-validates the balance regardless (see order.service.js's
    // quoteRedemption), this is purely for showing an accurate max/
    // estimate before submitting.
    const [loyaltyBalance, setLoyaltyBalance] = useState(0);
    const [pointsToRedeem, setPointsToRedeem] = useState(0);
    useEffect(() => {
        api.get("/loyalty/me").then(({ data }) => setLoyaltyBalance(data.data.balance)).catch(() => {});
    }, []);

    // Coupon / promo code (Phase 1, UI/UX remediation) - "Apply" hits a
    // read-only validation endpoint (coupon.controller.js#validate) that
    // recomputes the subtotal from the buyer's actual server-side cart,
    // so this preview can't be spoofed into showing a discount that
    // checkout itself would then reject. The authoritative discount is
    // still re-quoted and re-applied by order.service.js#checkout at
    // submit time regardless - this is purely a "does this code work"
    // preview plus the discount line shown in the summary below.
    const [couponInput, setCouponInput] = useState("");
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponBusy, setCouponBusy] = useState(false);
    const [couponError, setCouponError] = useState("");

    const applyCoupon = async () => {
        if (!couponInput.trim()) return;
        setCouponBusy(true);
        setCouponError("");
        try {
            const { data } = await api.post("/coupons/validate", { code: couponInput.trim() });
            setAppliedCoupon(data.data);
            setForm((f) => ({ ...f, coupon_code: data.data.code }));
        } catch (err) {
            setAppliedCoupon(null);
            setForm((f) => ({ ...f, coupon_code: "" }));
            setCouponError(extractErrorMessage(err));
        } finally {
            setCouponBusy(false);
        }
    };

    const removeCoupon = () => {
        setAppliedCoupon(null);
        setCouponInput("");
        setCouponError("");
        setForm((f) => ({ ...f, coupon_code: "" }));
    };

    // Agent/kiosk pickup points (Phase Q5) - fetched once; selecting one
    // auto-fills the address fields the checkout payload already sends
    // (server re-validates and re-substitutes the pickup point's own
    // address regardless, see order.service.js#checkout, but the
    // checkout endpoint's own validator still expects non-empty address
    // fields either way).
    const [deliveryType, setDeliveryType] = useState("home");
    const [pickupPoints, setPickupPoints] = useState([]);
    useEffect(() => {
        api.get("/pickup-points").then(({ data }) => setPickupPoints(data.data)).catch(() => {});
    }, []);

    // Saved address book (Phase 1, UI/UX remediation) - fetched once;
    // same auto-fill-then-server-re-validates relationship as pickup
    // points above (see order.service.js#checkout's address_id
    // handling). Pre-selects the buyer's default address (if any) so
    // returning buyers land on checkout with delivery info already
    // filled in, instead of an empty form every time.
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [addingNewAddress, setAddingNewAddress] = useState(false);
    const [saveNewAddress, setSaveNewAddress] = useState(false);
    useEffect(() => {
        api.get("/addresses").then(({ data }) => {
            setSavedAddresses(data.data);
            const defaultAddress = data.data.find((a) => a.is_default) || data.data[0];
            if (defaultAddress) {
                selectSavedAddress(defaultAddress.id, data.data);
            } else {
                setAddingNewAddress(true);
            }
        }).catch(() => setAddingNewAddress(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectSavedAddress = (id, list = savedAddresses) => {
        const addr = list.find((a) => String(a.id) === String(id));
        if (!addr) return;
        setAddingNewAddress(false);
        setForm((f) => ({
            ...f,
            address_id: addr.id,
            shipping_address: addr.address,
            shipping_city: addr.city,
            shipping_region: addr.region,
            shipping_phone: addr.phone
        }));
    };

    const startNewAddress = () => {
        setAddingNewAddress(true);
        setForm((f) => ({
            ...f,
            address_id: "",
            shipping_address: "",
            shipping_city: "",
            shipping_region: "",
            shipping_phone: ""
        }));
    };

    // Phase 6 (Checkout & Order Timeline UX): upfront delivery-time
    // estimate, fetched from the same distance/duration calculation the
    // platform already uses for rider pay (see
    // deliveryPricing.service.js#estimateDeliveryForRoute via
    // order.service.js#getDeliveryEstimate) - only reachable once a pin is
    // actually dropped (no pin = nothing to estimate a route against), and
    // only for home delivery (pickup points are self-collect, so there's
    // no delivery leg to estimate). Debounced slightly since dragging the
    // map pin can fire onChange rapidly.
    const [deliveryEstimate, setDeliveryEstimate] = useState(null);
    const [estimateLoading, setEstimateLoading] = useState(false);
    useEffect(() => {
        if (deliveryType !== "home" || !pin) {
            setDeliveryEstimate(null);
            return;
        }
        let cancelled = false;
        setEstimateLoading(true);
        const timer = setTimeout(() => {
            api.post("/orders/delivery-estimate", { delivery_lat: pin.lat, delivery_lng: pin.lng })
                .then(({ data }) => { if (!cancelled) setDeliveryEstimate(data.data); })
                .catch(() => { if (!cancelled) setDeliveryEstimate(null); })
                .finally(() => { if (!cancelled) setEstimateLoading(false); });
        }, 400);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [deliveryType, pin?.lat, pin?.lng]);

    const selectPickupPoint = (id) => {
        const point = pickupPoints.find((p) => String(p.id) === String(id));
        if (!point) {
            setForm((f) => ({ ...f, pickup_point_id: "" }));
            return;
        }
        setForm((f) => ({
            ...f,
            pickup_point_id: point.id,
            shipping_address: point.address,
            shipping_city: point.city,
            shipping_region: point.region
        }));
    };

    // Wallet top-up (Phase Q2) - only offered as a payment method once
    // there's an actual balance to spend; a zero/no-wallet buyer just
    // never sees the option, rather than seeing it and hitting an
    // "insufficient balance" error on submit.
    const [walletBalance, setWalletBalance] = useState(0);
    useEffect(() => {
        let cancelled = false;
        api.get("/buyer-wallet/me")
            .then(({ data }) => { if (!cancelled) setWalletBalance(Number(data.data.balance) || 0); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        api.get("/payments/methods")
            .then(({ data }) => {
                if (cancelled) return;
                setConfiguredProviders(data.data);
            })
            .catch(() => {
                if (cancelled) return;
                // Fail-open: leave configuredProviders null so the static
                // methods (mobile_money/paypal) keep showing via
                // `configuredKeys === null` below, and flag the failure so
                // the card rails (which have no static list of their own)
                // fall back to DEFAULT_CARD_PROVIDERS instead of vanishing.
                setProvidersFetchFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Card payment providers, loaded dynamically from the centralized
    // registry (GET /payments/methods) rather than hardcoded here - if
    // both Snippe and MalipoPay Card are enabled/configured, both show
    // up; if only one is, only that one does; a third card rail (added
    // server-side per docs/PAYMENT_PROVIDERS.md §4) would appear with no
    // frontend change at all. While still loading, no card rows render
    // (rather than guessing) - they appear as soon as the registry
    // responds, same "fail-open only for already-known statics" posture
    // as visiblePaymentMethods below.
    const cardPaymentMethods = (configuredProviders || (providersFetchFailed ? DEFAULT_CARD_PROVIDERS : []))
        .filter((provider) => provider.type === "card")
        .map((provider) => ({
            value: provider.key,
            label: CARD_PROVIDER_LABELS[provider.key] || provider.label,
            // "malipopay_card" -> "malipopay-card" to match the route
            // segments registered in payment.routes.js (POST
            // /:orderId/<segment>/checkout) - Snippe's own key already
            // matches its route segment with no translation needed.
            routeSegment: provider.key.replace(/_/g, "-")
        }));

    const filterStatic = (methods) => methods.filter((method) => {
        if (!PROVIDER_GATED_METHODS.has(method.value)) return true;
        if (configuredKeys === null) return true;
        return configuredKeys.includes(method.value);
    });

    const visiblePaymentMethods = [
        ...filterStatic(PAYMENT_METHODS_BEFORE_CARDS),
        ...(walletBalance > 0 ? [{ value: "wallet", label: `Wallet balance (${format(walletBalance)})` }] : []),
        ...cardPaymentMethods,
        ...filterStatic(PAYMENT_METHODS_AFTER_CARDS)
    ];

    // If the currently-selected method turns out not to be configured
    // (e.g. someone lands here with mobile_money selected but only cash
    // on delivery is actually configured on this deployment), fall back
    // to the first visible option rather than submitting a payment method
    // the checkout form no longer shows as selectable.
    useEffect(() => {
        if (configuredProviders === null) return;
        const stillVisible = visiblePaymentMethods.some((method) => method.value === form.payment_method);
        if (!stillVisible && visiblePaymentMethods.length > 0) {
            setForm((current) => ({ ...current, payment_method: visiblePaymentMethods[0].value }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [configuredProviders]);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        // Declared outside the try block so the catch below can tell
        // "the order was never created" (nothing to redirect to) apart
        // from "the order was created but the payment step after it
        // failed" - previously any failure past this point just showed a
        // toast and left the buyer stranded on checkout with no way back
        // to the order that had already been placed.
        let orderId = null;

        try {
            const payload = {
                ...form,
                pickup_point_id: form.pickup_point_id || undefined,
                address_id: form.address_id || undefined,
                coupon_code: appliedCoupon?.code || undefined,
                loyalty_points_redeemed: pointsToRedeem || undefined,
                affiliate_click_token: getStoredAffiliateClickToken() || undefined,
                delivery_lat: pin?.lat ?? null,
                delivery_lng: pin?.lng ?? null
            };
            const { data } = await api.post("/orders", payload);
            orderId = data.data.orderId;

            // Save-new-address checkbox (Phase 1, UI/UX remediation) -
            // fire-and-forget, deliberately not awaited: this is a
            // convenience for next time, not something that should ever
            // block or fail an order that already succeeded.
            if (saveNewAddress && !form.address_id && deliveryType === "home") {
                api.post("/addresses", {
                    label: "Address",
                    address: form.shipping_address,
                    city: form.shipping_city,
                    region: form.shipping_region,
                    phone: form.shipping_phone
                }).catch(() => {});
            }

            const selectedCardMethod = cardPaymentMethods.find((method) => method.value === form.payment_method);

            if (form.payment_method === "mobile_money") {
                await api.post(`/payments/${orderId}/initiate`);

            } else if (form.payment_method === "wallet") {
                // Synchronous - no gateway round trip, so there's nothing
                // to redirect for. A wallet balance too low to cover the
                // order surfaces as a normal error from this call.
                await api.post(`/payments/${orderId}/wallet`);

            } else if (selectedCardMethod) {
                // Drives whichever card rail was selected (Snippe,
                // MalipoPay Card, or any future one) through the same
                // hosted-checkout request shape - no provider-specific
                // branch needed here.
                const origin = window.location.origin;
                const { data: checkout } = await api.post(`/payments/${orderId}/${selectedCardMethod.routeSegment}/checkout`, {
                    successUrl: `${origin}/orders/${orderId}?payment=success`,
                    cancelUrl: `${origin}/orders/${orderId}?payment=cancelled`
                });
                await refresh();
                setRedirecting(true);
                window.location.href = checkout.data.url;
                return;

            } else if (form.payment_method === "paypal") {
                const origin = window.location.origin;
                const { data: checkout } = await api.post(`/payments/${orderId}/paypal/create`, {
                    returnUrl: `${origin}/orders/${orderId}?payment=paypal_return`,
                    cancelUrl: `${origin}/orders/${orderId}?payment=cancelled`
                });
                await refresh();
                setRedirecting(true);
                window.location.href = checkout.data.url;
                return;
            }

            await refresh();
            navigate(`/orders/${orderId}`, { state: { justPlaced: true } });

        } catch (err) {
            toast?.error(extractErrorMessage(err));

            // Order was created but a later payment-initiation call
            // failed (mobile money, wallet, card, or PayPal) - send the
            // buyer to the order they already placed instead of leaving
            // them on checkout with a cart that may now be empty. If the
            // failure happened before the order was created (orderId is
            // still null), there's nothing to redirect to - just the toast.
            if (orderId) {
                await refresh().catch(() => {});
                navigate(`/orders/${orderId}`, { state: { paymentFailed: true } });
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className="max-w-lg mx-auto px-6 py-24 text-center animate-slide-up">
                <p className="font-display text-2xl mb-2">{t("cart.empty")}</p>
                <Link to="/" className="text-teal hover:underline text-sm">{t("common.browseMarketplace")}</Link>
            </div>
        );
    }

    const busy = submitting || redirecting;
    const buyerProtectionFee = form.buyer_protection_addon ? estimateBuyerProtectionFee(total) : 0;
    const loyaltyDiscount = pointsToRedeem * 10; // mirrors referral.service.js's POINT_VALUE_TZS
    const couponDiscount = appliedCoupon?.discountAmount || 0;
    const grandTotal = Number((total + buyerProtectionFee - loyaltyDiscount - couponDiscount).toFixed(2));

    // Feeds the CheckoutSteps stepper below. This is a single-page (not
    // gated/wizard) checkout, so "current step" is a best-effort read of
    // how far the buyer's inputs are, not a hard navigational state:
    // delivery info (a home address or a chosen pickup point) is the one
    // required field with no default, so once it's filled the payment
    // method (which already has a sensible default) and the always-visible
    // order summary are effectively what's left to check before placing
    // the order.
    const deliveryInfoComplete = deliveryType === "pickup"
        ? Boolean(form.pickup_point_id)
        : Boolean(form.shipping_address?.trim());
    const checkoutStepIndex = deliveryInfoComplete ? 2 : 0;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-5 gap-10 animate-fade-in">
            <PageMeta title="Checkout" noIndex />
            <form onSubmit={handleSubmit} className="md:col-span-3 space-y-4 animate-slide-up">
                <h1 className="font-display text-2xl mb-2">{t("checkout.title")}</h1>

                <CheckoutSteps steps={["Delivery", "Payment", "Review"]} currentIndex={checkoutStepIndex} />

                <div className="flex gap-2 mb-2">
                    <button
                        type="button"
                        onClick={() => { setDeliveryType("home"); setForm({ ...form, pickup_point_id: "" }); }}
                        className={`flex-1 border rounded-md px-3 py-2 text-sm transition-colors ${deliveryType === "home" ? "border-ink bg-ink text-paper" : "border-line"}`}
                    >
                        Deliver to my address
                    </button>
                    <button
                        type="button"
                        onClick={() => setDeliveryType("pickup")}
                        className={`flex-1 border rounded-md px-3 py-2 text-sm transition-colors ${deliveryType === "pickup" ? "border-ink bg-ink text-paper" : "border-line"}`}
                    >
                        Pickup point / kiosk
                    </button>
                </div>

                {deliveryType === "pickup" ? (
                    <div>
                        <label htmlFor="checkout-pickup-point" className="block text-sm mb-1">Choose a pickup point</label>
                        <select
                            id="checkout-pickup-point"
                            required
                            value={form.pickup_point_id}
                            onChange={(e) => selectPickupPoint(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                        >
                            <option value="" disabled>Select a location</option>
                            {pickupPoints.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} — {p.city}</option>
                            ))}
                        </select>
                        {form.pickup_point_id && (
                            <p className="text-xs text-ash mt-1">{form.shipping_address}, {form.shipping_city}</p>
                        )}
                    </div>
                ) : (
                    <>
                        {savedAddresses.length > 0 && (
                            <div className="space-y-2 mb-1">
                                {savedAddresses.map((addr) => {
                                    const selected = !addingNewAddress && String(form.address_id) === String(addr.id);
                                    return (
                                        <label
                                            key={addr.id}
                                            className={`flex items-start gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer transition-all duration-200 ${
                                                selected ? "border-teal bg-teal/5 shadow-sm" : "border-line hover:border-ash"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="checkout_saved_address"
                                                checked={selected}
                                                onChange={() => selectSavedAddress(addr.id)}
                                                className="mt-1 accent-teal"
                                            />
                                            <span>
                                                <span className="font-medium">{addr.label || "Address"}</span>
                                                {addr.is_default && <span className="text-xs text-ash"> · Default</span>}
                                                <span className="block text-ash text-xs mt-0.5">{addr.address}, {addr.city}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={startNewAddress}
                                    className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm w-full text-left transition-all duration-200 ${
                                        addingNewAddress ? "border-teal bg-teal/5 shadow-sm" : "border-line hover:border-ash"
                                    }`}
                                >
                                    + Enter a new address
                                </button>
                            </div>
                        )}

                        {(addingNewAddress || savedAddresses.length === 0) && (
                            <>
                                <Input
                                    label={t("checkout.streetAddress")}
                                    required
                                    value={form.shipping_address}
                                    onChange={update("shipping_address")}
                                />

                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label={t("checkout.city")}
                                        required
                                        value={form.shipping_city}
                                        onChange={update("shipping_city")}
                                    />
                                    <Input
                                        label={t("checkout.region")}
                                        required
                                        value={form.shipping_region}
                                        onChange={update("shipping_region")}
                                    />
                                </div>

                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={saveNewAddress}
                                        onChange={(e) => setSaveNewAddress(e.target.checked)}
                                    />
                                    Save this address for next time
                                </label>
                            </>
                        )}
                    </>
                )}

                <div>
                    <label htmlFor="checkout-phone" className="block text-sm mb-1">{t("checkout.contactPhone")}</label>
                    <PhoneInput
                        id="checkout-phone"
                        required
                        value={form.shipping_phone}
                        onChange={(shipping_phone) => setForm({ ...form, shipping_phone })}
                    />
                </div>

                <LocationPicker value={pin} onChange={setPin} />

                {deliveryType === "home" && pin && (
                    <div className="border border-line rounded-md px-3 py-2 text-sm animate-fade-in">
                        <p className="font-medium text-ink">{t("checkout.deliveryEstimate.title")}</p>
                        {estimateLoading && !deliveryEstimate ? (
                            <p className="text-xs text-ash mt-0.5">{t("checkout.deliveryEstimate.calculating")}</p>
                        ) : deliveryEstimate?.durationMinutes != null ? (
                            <>
                                <p className="text-xs text-ash mt-0.5">
                                    {t("checkout.deliveryEstimate.window", {
                                        min: deliveryEstimate.durationMinutes,
                                        max: deliveryEstimate.durationMinutes + 20
                                    })}
                                </p>
                                {deliveryEstimate.vendorCount > 1 && (
                                    <p className="text-xs text-ash mt-0.5">
                                        {t("checkout.deliveryEstimate.multiVendor", { count: deliveryEstimate.vendorCount })}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-xs text-ash mt-0.5">{t("checkout.deliveryEstimate.unknown")}</p>
                        )}
                    </div>
                )}

                <fieldset className="border-0 p-0 m-0 min-w-0">
                    <legend className="block text-sm mb-2">{t("checkout.paymentMethod")}</legend>
                    <div className="space-y-2">
                        {visiblePaymentMethods.map((method) => {
                            const selected = form.payment_method === method.value;
                            return (
                                <label
                                    key={method.value}
                                    className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer transition-all duration-200 ${
                                        selected ? "border-teal bg-teal/5 shadow-sm" : "border-line hover:border-ash"
                                    }`}
                                >
                                    <input type="radio" name="payment_method" value={method.value}
                                        checked={selected}
                                        onChange={update("payment_method")}
                                        className="accent-teal" />
                                    {method.label}
                                    {method.hint && <span className="text-xs text-ash">{method.hint}</span>}
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                <fieldset className="border border-line rounded-md p-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-1"
                            checked={form.buyer_protection_addon}
                            onChange={(e) => setForm({ ...form, buyer_protection_addon: e.target.checked })}
                        />
                        <span className="text-sm">
                            <span className="font-medium">{t("checkout.buyerProtection.title")}</span>
                            <span className="block text-ash text-xs mt-0.5">
                                {t("checkout.buyerProtection.description")} · +{format(estimateBuyerProtectionFee(total))}
                            </span>
                        </span>
                    </label>
                </fieldset>

                {loyaltyBalance > 0 && (
                    <fieldset className="border border-line rounded-md p-3">
                        <label htmlFor="checkout-loyalty-points" className="block text-sm font-medium mb-1">
                            Loyalty points ({loyaltyBalance} available)
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                id="checkout-loyalty-points"
                                type="number"
                                min="0"
                                max={loyaltyBalance}
                                value={pointsToRedeem}
                                onChange={(e) => setPointsToRedeem(Math.max(0, Math.min(loyaltyBalance, Number(e.target.value) || 0)))}
                                className="w-28 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                            />
                            <span className="text-xs text-ash">= {format(pointsToRedeem * 10)} off</span>
                        </div>
                    </fieldset>
                )}

                <Button type="submit" disabled={busy} fullWidth className="gap-2 active:scale-[0.99]">
                    {busy && <span className="w-4 h-4 border-2 border-abyss/30 border-t-abyss rounded-full animate-spin" />}
                    {busy ? t("checkout.placingOrder") : `${t("checkout.placeOrderButton")} · ${format(grandTotal)}`}
                </Button>
            </form>

            <div className="md:col-span-2 animate-slide-up" style={{ animationDelay: "80ms" }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ash">Review</p>
                <h2 className="font-display text-lg mb-3">{t("checkout.orderSummary")}</h2>
                <ul className="space-y-3 mb-4">
                    {items.map((item) => (
                        <li key={item.cart_item_id} className="flex justify-between text-sm">
                            <span className="text-ink/80 truncate pr-2">{item.name} × {item.quantity}</span>
                            <span className="price shrink-0">{format(item.subtotal)}</span>
                        </li>
                    ))}
                </ul>

                <div className="mb-4">
                    {!appliedCoupon ? (
                        <div className="flex gap-2">
                            <Input
                                aria-label="Coupon code"
                                placeholder="Have a code?"
                                value={couponInput}
                                onChange={(e) => setCouponInput(e.target.value)}
                                className="flex-1"
                            />
                            <Button type="button" variant="secondary" size="md" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()}>
                                {couponBusy ? "Checking…" : "Apply"}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between text-sm border border-teal/30 bg-teal/5 rounded-md px-3 py-2">
                            <span className="text-teal font-medium">"{appliedCoupon.code}" applied</span>
                            <button type="button" onClick={removeCoupon} className="text-ash hover:text-ink text-xs underline">
                                Remove
                            </button>
                        </div>
                    )}
                    {couponError && <p role="alert" className="text-coral text-xs mt-1">{couponError}</p>}
                </div>

                {form.buyer_protection_addon && (
                    <div className="flex justify-between text-sm text-ash mb-2">
                        <span>{t("checkout.buyerProtection.title")}</span>
                        <span>{format(buyerProtectionFee)}</span>
                    </div>
                )}
                {pointsToRedeem > 0 && (
                    <div className="flex justify-between text-sm text-teal mb-2">
                        <span>Loyalty points redeemed</span>
                        <span>-{format(loyaltyDiscount)}</span>
                    </div>
                )}
                {appliedCoupon && (
                    <div className="flex justify-between text-sm text-teal mb-2">
                        <span>Code "{appliedCoupon.code}"</span>
                        <span>-{format(appliedCoupon.discountAmount)}</span>
                    </div>
                )}
                <div className="flex justify-between border-t border-line pt-3">
                    <span className="text-sm">{t("common.total")}</span>
                    <span className="price font-medium">{format(grandTotal)}</span>
                </div>
            </div>
        </div>
    );
}
