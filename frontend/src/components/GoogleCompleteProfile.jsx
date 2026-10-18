import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import Button from "./ui/Button";
import PhoneInput from "./PhoneInput";
import UsernameField from "./UsernameField";
import { isValidUsernameFormat, randomSuggestionDigits, suggestUsername } from "../utils/username";

// Round 5, phase 7: the one extra step a NEW Google user goes through - phone,
// username and terms - before a buyer account is created. Google already gave
// us a verified name and email (shown read-only).
export default function GoogleCompleteProfile({ ticket, profile, referralCode = "", returnTo = null }) {
    const { completeGoogleSignup } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();

    const suggestion = useMemo(
        () => suggestUsername(profile?.first_name, randomSuggestionDigits()),
        [profile?.first_name]
    );
    const [phone, setPhone] = useState("");
    const [username, setUsername] = useState("");
    const [usernameStatus, setUsernameStatus] = useState("idle");
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const name = username.trim();
        if (!name) return setError(t("username.required"));
        if (!isValidUsernameFormat(name) || ["invalid", "reserved", "taken"].includes(usernameStatus)) {
            return setError(t("username.pickAvailable"));
        }
        if (usernameStatus === "checking") return setError(t("username.stillChecking"));
        if (phone.replace(/[^\d]/g, "").length < 7) return setError(t("auth.invalidPhoneError"));
        if (!termsAccepted) return setError(t("auth.termsRequiredError"));

        setSubmitting(true);
        const result = await completeGoogleSignup({
            ticket,
            phone,
            username: name,
            terms_accepted: true,
            ...(referralCode ? { referral_code: referralCode } : {})
        });
        setSubmitting(false);

        if (result.success) navigate(returnTo || "/");
        else setError(result.message);
    };

    return (
        <div className="max-w-sm mx-auto px-4 py-16">
            <h1 className="font-display text-2xl mb-1">{t("auth.google.completeTitle")}</h1>
            <p className="text-ash text-sm mb-6">{t("auth.google.completeIntro")}</p>

            <div className="border border-line rounded-md px-3 py-2 mb-6 text-sm">
                <p className="font-medium">{[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")}</p>
                <p className="text-ash">{profile?.email}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <UsernameField
                    id="googleUsername"
                    value={username}
                    onChange={setUsername}
                    onStatusChange={setUsernameStatus}
                    suggestion={suggestion}
                />

                <div>
                    <label htmlFor="googlePhone" className="block text-sm font-medium text-ink mb-1.5">{t("auth.phoneLabel")}</label>
                    <PhoneInput id="googlePhone" value={phone} onChange={setPhone} required />
                    <p className="mt-1 text-xs text-ash">{t("auth.phoneHint")}</p>
                </div>

                <div className="flex items-start gap-2">
                    <input
                        type="checkbox"
                        id="googleTerms"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-1 focus-ring"
                    />
                    <label htmlFor="googleTerms" className="text-xs text-ash">
                        {t("auth.termsPrefix")}{" "}
                        <Link to="/legal/terms-of-service" target="_blank" className="text-teal hover:underline">
                            {t("auth.termsOfService")}
                        </Link>{" "}
                        {t("auth.and")}{" "}
                        <Link to="/legal/privacy-policy" target="_blank" className="text-teal hover:underline">
                            {t("auth.privacyPolicy")}
                        </Link>.
                    </label>
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                <Button type="submit" disabled={submitting} fullWidth className="gap-2">
                    {submitting && <span className="w-4 h-4 border-2 border-abyss/30 border-t-abyss rounded-full animate-spin" />}
                    {submitting ? t("auth.creatingAccount") : t("auth.google.completeButton")}
                </Button>
            </form>
        </div>
    );
}
