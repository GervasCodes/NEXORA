import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import LocationPicker from "../../components/LocationPicker";
import PhoneInput from "../../components/PhoneInput";
import { STORE_THEMES } from "../../utils/storeThemes";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useLanguage } from "../../context/LanguageContext";

// Nexora Services Phase 3 (Merchant Type Switching) - reuses the same
// PUT /seller/merchant-type endpoint SellerSetup (Phase 2 onboarding)
// and SellerServices' MerchantTypeGate (in-dashboard upgrade prompt)
// already call. No new backend logic: the route/validator/service/
// repository already existed and had no restrictions on switching in
// either direction, so this is purely the general-purpose (all three
// options, either direction) UI for it living in Settings.
function useMerchantTypeOptions(t) {
    return [
        {
            value: "product",
            label: t("seller.store.merchantProductLabel"),
            description: t("seller.store.merchantProductDescription")
        },
        {
            value: "service",
            label: t("seller.store.merchantServiceLabel"),
            description: t("seller.store.merchantServiceDescription")
        },
        {
            value: "hybrid",
            label: t("seller.store.merchantHybridLabel"),
            description: t("seller.store.merchantHybridDescription")
        }
    ];
}

function MerchantTypeSection({ merchantType, onSwitch, switching, error, saved, t }) {
    const options = useMerchantTypeOptions(t);
    return (
        <div className="mb-8 pb-8 border-b border-line">
            <h2 className="text-sm font-medium mb-1">{t("seller.store.whatYouSell")}</h2>
            <p className="text-xs text-ash mb-3">
                {t("seller.store.whatYouSellHint")}
            </p>

            <div className="grid gap-2">
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        disabled={switching}
                        onClick={() => onSwitch(option.value)}
                        aria-pressed={merchantType === option.value}
                        className={`text-left border rounded-lg p-3 transition-colors disabled:opacity-60 ${
                            merchantType === option.value ? "border-ink bg-line/30" : "border-line hover:border-ink"
                        }`}
                    >
                        <p className="font-medium text-sm mb-0.5">{option.label}</p>
                        <p className="text-xs text-ash">{option.description}</p>
                    </button>
                ))}
            </div>

            {error && <p role="alert" className="text-coral text-sm mt-3">{error}</p>}
            {saved && <p className="text-teal text-sm mt-3">{t("seller.store.merchantTypeUpdated")}</p>}
        </div>
    );
}

export default function SellerStore() {
    const { t } = useLanguage();
    const { profile, refreshProfile } = useOutletContext();

    const [merchantSwitching, setMerchantSwitching] = useState(false);
    const [merchantError, setMerchantError] = useState("");
    const [merchantSaved, setMerchantSaved] = useState(false);

    const handleMerchantTypeSwitch = async (merchantType) => {
        if (merchantType === profile.merchant_type) return;
        setMerchantSwitching(true);
        setMerchantError("");
        setMerchantSaved(false);
        try {
            await api.put("/seller/merchant-type", { merchant_type: merchantType });
            await refreshProfile?.();
            setMerchantSaved(true);
        } catch (err) {
            setMerchantError(extractErrorMessage(err));
        } finally {
            setMerchantSwitching(false);
        }
    };

    const [storeTypes, setStoreTypes] = useState([]);
    const [form, setForm] = useState({
        store_name: profile.store_name || "",
        store_description: profile.store_description || "",
        store_tagline: profile.store_tagline || "",
        store_type_id: profile.store_type_id || "",
        business_email: profile.business_email || "",
        business_phone: profile.business_phone || "",
        country: profile.country || "",
        region: profile.region || "",
        city: profile.city || "",
        address: profile.address || "",
        store_theme: profile.store_theme || "default",
        social_instagram: profile.social_instagram || "",
        social_facebook: profile.social_facebook || "",
        social_whatsapp: profile.social_whatsapp || ""
    });
    const [pickupPin, setPickupPin] = useState(
        profile.pickup_lat != null && profile.pickup_lng != null
            ? { lat: profile.pickup_lat, lng: profile.pickup_lng }
            : null
    );
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);

    useEffect(() => {
        api.get("/store-types").then(({ data }) => setStoreTypes(data.data)).catch(() => {});
    }, []);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        setSaved(false);
        try {
            await api.put("/seller/profile", {
                ...form,
                pickup_lat: pickupPin?.lat ?? null,
                pickup_lng: pickupPin?.lng ?? null
            });
            refreshProfile();
            setSaved(true);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingLogo(true);
        setError("");
        try {
            const body = new FormData();
            body.append("logo", file);
            await api.post("/seller/upload-logo", body);
            refreshProfile();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingLogo(false);
            e.target.value = "";
        }
    };

    const handleBannerUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingBanner(true);
        setError("");
        try {
            const body = new FormData();
            body.append("banner", file);
            await api.post("/seller/upload-banner", body);
            refreshProfile();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingBanner(false);
            e.target.value = "";
        }
    };

    return (
        <div className="max-w-lg">
            <PageMeta title="Store Settings" noIndex />
            <h1 className="font-display text-2xl mb-6">{t("seller.store.title")}</h1>

            <MerchantTypeSection
                merchantType={profile.merchant_type || "product"}
                onSwitch={handleMerchantTypeSwitch}
                switching={merchantSwitching}
                error={merchantError}
                saved={merchantSaved}
                t={t}
            />

            <div className="grid grid-cols-2 gap-4 mb-8">
                <div>
                    <p className="text-sm mb-2">{t("seller.store.logo")}</p>
                    <div className="w-24 h-24 rounded-md overflow-hidden border border-line bg-line/30 mb-2">
                        {profile.store_logo && <img src={profile.store_logo} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <label className="inline-block text-xs border border-line px-3 py-1.5 rounded-md cursor-pointer hover:border-ink transition-colors">
                        {uploadingLogo ? t("seller.store.uploading") : t("seller.store.changeLogo")}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} className="hidden" />
                    </label>
                </div>

                <div>
                    <p className="text-sm mb-2">{t("seller.store.banner")}</p>
                    <div className="w-full h-24 rounded-md overflow-hidden border border-line bg-line/30 mb-2">
                        {profile.store_banner && <img src={profile.store_banner} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <label className="inline-block text-xs border border-line px-3 py-1.5 rounded-md cursor-pointer hover:border-ink transition-colors">
                        {uploadingBanner ? t("seller.store.uploading") : t("seller.store.changeBanner")}
                        <input type="file" accept="image/*" onChange={handleBannerUpload} disabled={uploadingBanner} className="hidden" />
                    </label>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm mb-1">{t("seller.store.storeName")}</label>
                    <input minLength={3} maxLength={150} value={form.store_name} onChange={update("store_name")}
                        className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("seller.store.storeTagline")}</label>
                    <p className="text-xs text-ash mb-2">
                        {t("seller.store.storeTaglineHint")}
                    </p>
                    <input maxLength={150} value={form.store_tagline} onChange={update("store_tagline")}
                        placeholder={t("seller.store.optional")}
                        className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("seller.store.storeDescription")}</label>
                    <textarea rows={3} maxLength={1000} value={form.store_description} onChange={update("store_description")}
                        className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("seller.store.storeType")}</label>
                    <select value={form.store_type_id} onChange={update("store_type_id")}
                        className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper">
                        <option value="">{t("seller.store.selectStoreType")}</option>
                        {storeTypes.map((st) => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("seller.store.storeTheme")}</label>
                    <p className="text-xs text-ash mb-2">
                        {t("seller.store.storeThemeHint")}
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                        {STORE_THEMES.map((theme) => (
                            <button
                                key={theme.key}
                                type="button"
                                onClick={() => setForm({ ...form, store_theme: theme.key })}
                                title={theme.label}
                                aria-label={theme.label}
                                aria-pressed={form.store_theme === theme.key}
                                className={`w-9 h-9 rounded-full ${theme.swatch} flex items-center justify-center ring-offset-2 ring-offset-paper transition-shadow ${
                                    form.store_theme === theme.key ? "ring-2 ring-ink" : ""
                                }`}
                            >
                                {form.store_theme === theme.key && (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-paper">
                                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("seller.store.socialLinks")}</label>
                    <p className="text-xs text-ash mb-2">
                        {t("seller.store.socialLinksHint")}
                    </p>
                    <div className="space-y-2">
                        <input value={form.social_instagram} onChange={update("social_instagram")}
                            placeholder={t("seller.store.instagramPlaceholder")} maxLength={150}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                        <input value={form.social_facebook} onChange={update("social_facebook")}
                            placeholder={t("seller.store.facebookPlaceholder")} maxLength={150}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                        <input value={form.social_whatsapp} onChange={update("social_whatsapp")}
                            placeholder={t("seller.store.whatsappPlaceholder")} maxLength={20}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">{t("seller.store.businessEmail")}</label>
                        <input type="email" value={form.business_email} onChange={update("business_email")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">{t("seller.store.businessPhone")}</label>
                        <PhoneInput
                            value={form.business_phone}
                            onChange={(business_phone) => setForm({ ...form, business_phone })}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">{t("seller.store.country")}</label>
                        <input value={form.country} onChange={update("country")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">{t("seller.store.region")}</label>
                        <input value={form.region} onChange={update("region")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">{t("seller.store.city")}</label>
                        <input value={form.city} onChange={update("city")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">{t("seller.store.address")}</label>
                        <input value={form.address} onChange={update("address")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring" />
                    </div>
                </div>

                <div>
                    <LocationPicker
                        value={pickupPin}
                        onChange={setPickupPin}
                        label={t("seller.store.pickupLocationLabel")}
                        placedHint={t("seller.store.pickupPlacedHint")}
                        emptyHint={t("seller.store.pickupEmptyHint")}
                    />
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}
                {saved && <p className="text-teal text-sm">{t("seller.store.settingsSaved")}</p>}

                <Button type="submit" disabled={submitting}>
                    {submitting ? t("seller.store.saving") : t("seller.store.saveChanges")}
                </Button>
            </form>
        </div>
    );
}
