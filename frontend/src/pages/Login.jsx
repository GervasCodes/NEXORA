import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import PageMeta from "../components/PageMeta";

export default function Login() {
    const { login, verifyLoginOtp, resendLoginOtp } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [form, setForm] = useState({ email: "", password: "" });
    const [step, setStep] = useState("credentials"); // 'credentials' | 'otp'
    const [preAuthToken, setPreAuthToken] = useState(null);
    const [maskedEmail, setMaskedEmail] = useState("");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleCredentials = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const result = await login(form.email, form.password);

        setSubmitting(false);

        if (!result.success) {
            setError(result.message);
            return;
        }

        setPreAuthToken(result.preAuthToken);
        setMaskedEmail(result.maskedEmail);
        setStep("otp");
    };

    const handleOtp = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const result = await verifyLoginOtp(preAuthToken, code);

        setSubmitting(false);

        if (result.success) {
            navigate("/");
        } else {
            setError(result.message);
        }
    };

    const handleResend = async () => {
        setError("");
        setNotice("");
        const result = await resendLoginOtp(preAuthToken);
        setNotice(result.success ? t("auth.otp.resendSuccess") : "");
        if (!result.success) setError(result.message);
    };

    if (step === "otp") {
        return (
            <div className="max-w-sm mx-auto px-4 py-20">
                <h1 className="font-display text-2xl mb-1">{t("auth.otp.title")}</h1>
                <p className="text-ash text-sm mb-8">
                    {(() => {
                        const [before, after] = t("auth.otp.description").split("{email}");
                        return (
                            <>
                                {before}
                                <span className="font-medium text-ink">{maskedEmail}</span>
                                {after}
                            </>
                        );
                    })()}
                </p>

                <form onSubmit={handleOtp} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">{t("auth.otp.codeLabel")}</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                            className="w-full border border-line rounded-md px-3 py-2 text-center text-lg tracking-[0.5em] font-mono focus-ring"
                            placeholder="000000"
                        />
                    </div>

                    {error && <p role="alert" className="text-coral text-sm">{error}</p>}
                    {notice && !error && <p className="text-teal text-sm">{notice}</p>}

                    <Button
                        type="submit"
                        disabled={submitting || code.length !== 6}
                        fullWidth
                    >
                        {submitting ? t("auth.otp.verifying") : t("auth.otp.verifyButton")}
                    </Button>
                </form>

                <div className="flex items-center justify-between mt-6 text-sm">
                    <button
                        type="button"
                        onClick={() => { setStep("credentials"); setCode(""); setError(""); setNotice(""); }}
                        className="text-ash hover:text-ink transition-colors"
                    >
                        ← {t("auth.otp.useDifferentAccount")}
                    </button>
                    <button type="button" onClick={handleResend} className="text-teal hover:underline">
                        {t("auth.otp.resendCode")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto px-4 py-20">
            <PageMeta title="Sign In" />
            <h1 className="font-display text-2xl mb-1">{t("auth.welcomeBack")}</h1>
            <p className="text-ash text-sm mb-8">{t("auth.signInSubtitle")}</p>

            <form onSubmit={handleCredentials} className="space-y-4">
                <Input
                    label={t("auth.emailLabel")}
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-medium text-ink">{t("auth.passwordLabel")}</label>
                        <Link to="/forgot-password" className="text-xs text-teal hover:underline">{t("auth.forgotPasswordLink")}</Link>
                    </div>
                    <Input
                        type="password"
                        required
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                <Button
                    type="submit"
                    disabled={submitting}
                    fullWidth
                    className="gap-2"
                >
                    {submitting && <span className="w-4 h-4 border-2 border-abyss/30 border-t-abyss rounded-full animate-spin" />}
                    {submitting ? t("auth.signingIn") : t("auth.signInButton")}
                </Button>
            </form>

            <p className="text-sm text-ash mt-6">
                {t("auth.newHere")} <Link to="/register" className="text-teal hover:underline">{t("auth.registerLink")}</Link>
            </p>
        </div>
    );
}
