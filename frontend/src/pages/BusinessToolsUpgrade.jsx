import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";

// Upgrade a business-tools-only account to a full marketplace seller. It is
// the same account: stock, items and sales history carry over untouched; the
// account just enters the normal seller identity review.
export default function BusinessToolsUpgrade() {
    const { t } = useLanguage();
    const { updateUser } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const [ownerPhoto, setOwnerPhoto] = useState(null);
    const [idType, setIdType] = useState("national_id");
    const [idFile, setIdFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!ownerPhoto || !idFile) { setError(t("business.filesRequired")); return; }

        const formData = new FormData();
        formData.append("owner_photo", ownerPhoto);
        formData.append(idType, idFile);

        setBusy(true);
        try {
            const { data } = await api.post("/business-tools/convert", formData);
            // The account is now a marketplace seller under review; refresh the
            // cached user so the rest of the app routes it accordingly.
            updateUser(data.data.user);
            toast?.success(t("business.upgradeDone"));
            navigate("/seller", { replace: true });
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const fileClass = "w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper";

    return (
        <div className="max-w-md">
            <PageMeta title={t("business.upgradeTitle")} noIndex />
            <h2 className="font-display text-2xl mb-1">{t("business.upgradeTitle")}</h2>
            <p className="text-ash text-sm mb-6">{t("business.upgradeBody")}</p>

            <form onSubmit={submit} className="space-y-4">
                <div>
                    <label className="block text-sm mb-1">{t("auth.verify.ownerPhotoSeller")}</label>
                    <input type="file" accept="image/*" required className={fileClass}
                        onChange={(e) => setOwnerPhoto(e.target.files?.[0] || null)} />
                    <p className="text-xs text-ash mt-1">{t("auth.verify.selfieHint")}</p>
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("auth.verify.idDocTypeLabel")}</label>
                    <select value={idType} onChange={(e) => setIdType(e.target.value)} className={`${fileClass} mb-2`}>
                        <option value="national_id">{t("auth.verify.nationalId")}</option>
                        <option value="voter_id">{t("auth.verify.voterId")}</option>
                    </select>
                    <input type="file" accept="application/pdf" required className={fileClass}
                        onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
                    <p className="text-xs text-ash mt-1">{t("auth.verify.idDocumentHint")}</p>
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                <Button type="submit" disabled={busy}>
                    {busy ? t("business.upgrading") : t("business.upgradeSubmit")}
                </Button>
            </form>
        </div>
    );
}
