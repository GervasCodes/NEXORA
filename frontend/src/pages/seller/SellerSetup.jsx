import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import Input from "../../components/ui/Input";
import { useLanguage } from "../../context/LanguageContext";

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
        labelKey: "seller.setup.type.product.label",
        descriptionKey: "seller.setup.type.product.description",
        subtitleKey: "seller.setup.type.product.subtitle"
    },
    {
        value: "service",
        labelKey: "seller.setup.type.service.label",
        descriptionKey: "seller.setup.type.service.description",
        subtitleKey: "seller.setup.type.service.subtitle"
    },
    {
        value: "hybrid",
        labelKey: "seller.setup.type.hybrid.label",
        descriptionKey: "seller.setup.type.hybrid.description",
        subtitleKey: "seller.setup.type.hybrid.subtitle"
    }
];

export default function SellerSetup() {
    const { t } = useLanguage();
    const { refreshProfile } = useOutletContext();
    const navigate = useNavigate();
    const [storeTypes, setStoreTypes] = useState([]);
    const [form, setForm] = useState({ store_name: "", store_description: "", store_type_id: "" });
    const [merchantType, setMerchantType] = useState("product");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [storeTypesFailed, setStoreTypesFailed] = useState(false);

    const loadStoreTypes = () => {
        setStoreTypesFailed(false);
        api.get("/store-types")
            .then(({ data }) => setStoreTypes(data.data))
            .catch(() => setStoreTypesFailed(true));
    };

    useEffect(loadStoreTypes, []);

    const selectedOption = MERCHANT_TYPE_OPTIONS.find((o) => o.value === merchantType) ?? MERCHANT_TYPE_OPTIONS[0];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const storeName = form.store_name.trim();
        if (storeName.length < 3) {
            setError(t("seller.setup.nameTooShort"));
            return;
        }
        setSubmitting(true);
        try {
            // merchant_type now travels in the same request as store
            // creation (remediation) - previously a non-default
            // pick needed a second PUT /seller/merchant-type call after
            // the store already existed, and a failure there was
            // silently swallowed, so a seller could pick "Services" and
            // end up with a product-only store with no visible error.
            // One request means one place that can fail and one error
            // to show.
            await api.post("/seller/profile", { ...form, store_name: storeName, merchant_type: merchantType });

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
            <PageMeta title={t("seller.setup.metaTitle")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.setup.title")}</h1>
            <p className="text-ash text-sm mb-8">{t(selectedOption.subtitleKey)}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <p className="block text-sm mb-1">{t("seller.setup.offerQuestion")}</p>
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
                                <p className="font-medium text-sm mb-0.5">{t(option.labelKey)}</p>
                                <p className="text-xs text-ash">{t(option.descriptionKey)}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <Input
                    label={t("seller.setup.storeName")}
                    required minLength={3} maxLength={150}
                    autoFocus
                    autoComplete="organization"
                    value={form.store_name}
                    onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                />

                <div>
                    <label htmlFor="storeTypeId" className="block text-sm mb-1">{t("seller.setup.storeType")}</label>
                    <select
                        id="storeTypeId"
                        value={form.store_type_id}
                        onChange={(e) => setForm({ ...form, store_type_id: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                    >
                        <option value="">{t("seller.setup.selectStoreType")}</option>
                        {storeTypes.map((st) => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                        ))}
                    </select>
                    {storeTypesFailed && (
                        <p role="alert" className="text-xs text-coral mt-1">
                            {t("seller.setup.storeTypesFailed")}{" "}
                            <button type="button" onClick={loadStoreTypes} className="underline">{t("seller.setup.tryAgain")}</button>
                            {" "}{t("seller.setup.pickLater")}
                        </p>
                    )}
                </div>

                <div>
                    <Input
                        as="textarea"
                        label={t("seller.setup.descriptionLabel")}
                        rows={4} maxLength={1000}
                        value={form.store_description}
                        onChange={(e) => setForm({ ...form, store_description: e.target.value })}
                    />
                    <p className="text-xs text-ash text-right mt-1" aria-live="off">{form.store_description.length}/1000</p>
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                <Button type="submit" disabled={submitting} fullWidth>
                    {submitting ? t("seller.setup.creating") : t("seller.setup.create")}
                </Button>
            </form>
        </div>
    );
}
