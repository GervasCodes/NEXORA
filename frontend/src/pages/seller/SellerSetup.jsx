import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";

// (Onboarding) - the three choices map straight
// onto seller_profiles.merchant_type (migration 062: product/service/
// hybrid). "product" is the DB column's own default, so a seller who
// skips this (or leaves it on the preselected option) needs no extra
// API call - createSellerProfile already omits merchant_type from its
// INSERT and lets the column default apply, exactly as it did before
// this phase. Only a non-default pick needs the follow-up call, reusing
// the same PUT /seller/merchant-type endpoint Settings (Phase 3) and the
// in-dashboard Services upgrade prompt already use - see
// sellerRepository.setMerchantType's comment for why that's a dedicated
// setter rather than folded into the generic profile update.
const MERCHANT_TYPE_OPTIONS = [
    {
        value: "product",
        label: "Products",
        description: "List physical products for sale.",
        subtitle: "Give your store a name to start listing products."
    },
    {
        value: "service",
        label: "Services",
        description: "Offer bookable services - accommodation, transportation, tours, and more.",
        subtitle: "Give your store a name to start listing bookable services."
    },
    {
        value: "hybrid",
        label: "Products & Services",
        description: "Sell products and offer bookable services from the same store.",
        subtitle: "Give your store a name to start listing products and services."
    }
];

export default function SellerSetup() {
    const { refreshProfile } = useOutletContext();
    const navigate = useNavigate();
    const [storeTypes, setStoreTypes] = useState([]);
    const [form, setForm] = useState({ store_name: "", store_description: "", store_type_id: "" });
    const [merchantType, setMerchantType] = useState("product");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.get("/store-types").then(({ data }) => setStoreTypes(data.data)).catch(() => {});
    }, []);

    const selectedOption = MERCHANT_TYPE_OPTIONS.find((o) => o.value === merchantType) ?? MERCHANT_TYPE_OPTIONS[0];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            await api.post("/seller/profile", form);

            // "product" is already the column default, so only a
            // non-default pick needs the follow-up call - keeps skip/
            // product behavior identical to before this phase.
            if (merchantType !== "product") {
                try {
                    await api.put("/seller/merchant-type", { merchant_type: merchantType });
                } catch {
                    // The store itself was created successfully; merchant
                    // type can still be changed from Settings afterward
                    // (Phase 3), so this shouldn't block onboarding.
                }
            }

            refreshProfile();
            navigate("/seller");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-16">
            <PageMeta title="Set Up Your Store" noIndex />
            <h1 className="font-display text-2xl mb-1">Set up your store</h1>
            <p className="text-ash text-sm mb-8">{selectedOption.subtitle}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm mb-1">What will you offer?</label>
                    <div className="grid gap-2">
                        {MERCHANT_TYPE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setMerchantType(option.value)}
                                aria-pressed={merchantType === option.value}
                                className={`text-left border rounded-lg p-3 transition-colors ${
                                    merchantType === option.value ? "border-ink bg-line/30" : "border-line hover:border-ink"
                                }`}
                            >
                                <p className="font-medium text-sm mb-0.5">{option.label}</p>
                                <p className="text-xs text-ash">{option.description}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm mb-1">Store name</label>
                    <input required minLength={3} maxLength={150}
                        value={form.store_name}
                        onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">Store type</label>
                    <select
                        value={form.store_type_id}
                        onChange={(e) => setForm({ ...form, store_type_id: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                    >
                        <option value="">Select a store type…</option>
                        {storeTypes.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm mb-1">Store description (optional)</label>
                    <textarea rows={4} maxLength={1000}
                        value={form.store_description}
                        onChange={(e) => setForm({ ...form, store_description: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                <Button type="submit" disabled={submitting} fullWidth>
                    {submitting ? "Creating store…" : "Create store"}
                </Button>
            </form>
        </div>
    );
}
