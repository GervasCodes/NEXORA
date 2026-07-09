import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";

export default function SellerStore() {
    const { profile, refreshProfile } = useOutletContext();

    const [storeTypes, setStoreTypes] = useState([]);
    const [form, setForm] = useState({
        store_name: profile.store_name || "",
        store_description: profile.store_description || "",
        store_type_id: profile.store_type_id || "",
        business_email: profile.business_email || "",
        business_phone: profile.business_phone || "",
        country: profile.country || "",
        region: profile.region || "",
        city: profile.city || "",
        address: profile.address || ""
    });
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
            await api.put("/seller/profile", form);
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
            <h1 className="font-display text-2xl mb-6">Store settings</h1>

            <div className="grid grid-cols-2 gap-4 mb-8">
                <div>
                    <p className="text-sm mb-2">Logo</p>
                    <div className="w-24 h-24 rounded-md overflow-hidden border border-line bg-line/30 mb-2">
                        {profile.store_logo && <img src={profile.store_logo} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <label className="inline-block text-xs border border-line px-3 py-1.5 rounded-md cursor-pointer hover:border-ink transition-colors">
                        {uploadingLogo ? "Uploading…" : "Change logo"}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} className="hidden" />
                    </label>
                </div>

                <div>
                    <p className="text-sm mb-2">Banner</p>
                    <div className="w-full h-24 rounded-md overflow-hidden border border-line bg-line/30 mb-2">
                        {profile.store_banner && <img src={profile.store_banner} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <label className="inline-block text-xs border border-line px-3 py-1.5 rounded-md cursor-pointer hover:border-ink transition-colors">
                        {uploadingBanner ? "Uploading…" : "Change banner"}
                        <input type="file" accept="image/*" onChange={handleBannerUpload} disabled={uploadingBanner} className="hidden" />
                    </label>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm mb-1">Store name</label>
                    <input minLength={3} maxLength={150} value={form.store_name} onChange={update("store_name")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">Store description</label>
                    <textarea rows={3} maxLength={1000} value={form.store_description} onChange={update("store_description")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">Store type</label>
                    <select value={form.store_type_id} onChange={update("store_type_id")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-white">
                        <option value="">Select a store type…</option>
                        {storeTypes.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">Business email</label>
                        <input type="email" value={form.business_email} onChange={update("business_email")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Business phone</label>
                        <input value={form.business_phone} onChange={update("business_phone")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">Country</label>
                        <input value={form.country} onChange={update("country")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Region</label>
                        <input value={form.region} onChange={update("region")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">City</label>
                        <input value={form.city} onChange={update("city")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Address</label>
                        <input value={form.address} onChange={update("address")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                {error && <p className="text-coral text-sm">{error}</p>}
                {saved && <p className="text-teal text-sm">Store settings saved.</p>}

                <button type="submit" disabled={submitting}
                    className="bg-mango text-ink px-6 py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                    {submitting ? "Saving…" : "Save changes"}
                </button>
            </form>
        </div>
    );
}
