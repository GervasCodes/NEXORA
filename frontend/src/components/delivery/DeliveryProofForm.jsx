import { useState } from "react";
import Button from "../ui/Button";
import { useLanguage } from "../../context/LanguageContext";

// Proof of delivery: the buyer's handover code, or - when the buyer
// can't give it - a drop-off photo plus the rider's GPS position.
export default function DeliveryProofForm({ busy, onSubmit, onCancel }) {
    const { t } = useLanguage();
    const [mode, setMode] = useState("code");
    const [code, setCode] = useState("");
    const [photo, setPhoto] = useState(null);
    const [error, setError] = useState("");
    const [locating, setLocating] = useState(false);

    const submitCode = (e) => {
        e.preventDefault();
        const trimmed = code.trim();
        if (trimmed.length < 4 || trimmed.length > 6) {
            setError(t("delivery.agent.proof.codeInvalid"));
            return;
        }
        setError("");
        onSubmit({ handoverCode: trimmed });
    };

    const submitPhoto = (e) => {
        e.preventDefault();
        if (!photo) {
            setError(t("delivery.agent.proof.photoRequired"));
            return;
        }
        if (!navigator.geolocation) {
            setError(t("delivery.agent.proof.noLocation"));
            return;
        }
        setError("");
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                onSubmit({ photo, lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            () => {
                setLocating(false);
                setError(t("delivery.agent.proof.noLocation"));
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    return (
        <div className="mt-3 border border-line rounded-lg p-3 bg-line/10">
            <p className="text-sm font-medium mb-2">{t("delivery.agent.proof.title")}</p>
            <div className="flex gap-1 mb-3" role="tablist">
                {["code", "photo"].map((m) => (
                    <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={mode === m}
                        onClick={() => { setMode(m); setError(""); }}
                        className={`text-xs px-3 py-1.5 rounded-full ${mode === m ? "bg-ink text-paper" : "text-ash hover:bg-line/50"}`}
                    >
                        {t(m === "code" ? "delivery.agent.proof.useCode" : "delivery.agent.proof.usePhoto")}
                    </button>
                ))}
            </div>

            {mode === "code" ? (
                <form onSubmit={submitCode} className="space-y-2">
                    <label htmlFor="handover-code" className="block text-xs text-ash">{t("delivery.agent.proof.codeLabel")}</label>
                    <input
                        id="handover-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
                        className="w-full border border-line rounded-md px-3 py-3 text-xl tracking-[0.4em] text-center focus-ring bg-paper"
                    />
                    <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={busy}>{t("delivery.agent.proof.confirm")}</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>
                    </div>
                </form>
            ) : (
                <form onSubmit={submitPhoto} className="space-y-2">
                    <label htmlFor="dropoff-photo" className="block text-xs text-ash">{t("delivery.agent.proof.photoLabel")}</label>
                    <input
                        id="dropoff-photo"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                        className="w-full text-sm"
                    />
                    <p className="text-xs text-ash">{t("delivery.agent.proof.photoHint")}</p>
                    <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={busy || locating}>
                            {locating ? t("delivery.agent.proof.locating") : t("delivery.agent.proof.confirm")}
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>
                    </div>
                </form>
            )}

            {error && <p role="alert" className="text-coral text-xs mt-2">{error}</p>}
        </div>
    );
}
