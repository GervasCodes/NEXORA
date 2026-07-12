import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";
import { useCurrency, CURRENCIES } from "../context/CurrencyContext";

export default function Account() {
    const { user, updateUser, logout } = useAuth();
    const { theme, setTheme, syncFromProfile: syncTheme } = useTheme();
    const { language, setLanguage, syncFromProfile: syncLanguage, t } = useLanguage();
    const { currency, setCurrency, syncFromProfile: syncCurrency } = useCurrency();
    const navigate = useNavigate();

    const [profile, setProfile] = useState(null);
    const [profileForm, setProfileForm] = useState({ first_name: "", last_name: "", email: "", phone: "" });
    const [deletePassword, setDeletePassword] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);

    // --- OTP-gated password change ---
    // 'idle' -> tap "Change Password" -> 'otp' (code emailed, awaiting entry)
    // -> verified -> 'form' (new password field unlocked) -> 'idle' on success
    const [pwdStep, setPwdStep] = useState("idle");
    const [pwdCode, setPwdCode] = useState("");
    const [reauthToken, setReauthToken] = useState(null);
    const [newPassword, setNewPassword] = useState("");

    const [status, setStatus] = useState({});
    const [busy, setBusy] = useState("");

    const load = () => {
        api.get("/account").then(({ data }) => {
            setProfile(data.data);
            setProfileForm({
                first_name: data.data.first_name,
                last_name: data.data.last_name,
                email: data.data.email,
                phone: data.data.phone
            });
            // Only takes effect if this device doesn't already have a local
            // preference saved - see ThemeContext/LanguageContext/CurrencyContext.
            syncTheme(data.data.theme);
            syncLanguage(data.data.language);
            syncCurrency(data.data.currency);
        }).catch(() => {});
    };

    useEffect(load, []);

    const say = (key, message, error) => setStatus((s) => ({ ...s, [key]: { message, error } }));

    const saveProfile = async (e) => {
        e.preventDefault();
        setBusy("profile");
        try {
            const { data } = await api.put("/account/profile", profileForm);
            setProfile(data.data);
            updateUser(data.data);
            say("profile", "Profile updated.", false);
        } catch (err) {
            say("profile", extractErrorMessage(err), true);
        } finally {
            setBusy("");
        }
    };

    // Settings apply instantly (via context) the moment they're picked -
    // saving here just persists that choice to the account so it follows
    // the user to their next device/session.
    const persistSettings = async (patch) => {
        setBusy("settings");
        try {
            const { data } = await api.put("/account/settings", patch);
            setProfile(data.data);
            updateUser(data.data);
            say("settings", "Saved.", false);
        } catch (err) {
            say("settings", extractErrorMessage(err), true);
        } finally {
            setBusy("");
        }
    };

    const handleLanguageChange = (code) => {
        setLanguage(code);
        persistSettings({ language: code });
    };

    const handleThemeChange = (value) => {
        setTheme(value);
        persistSettings({ theme: value });
    };

    const handleCurrencyChange = (code) => {
        setCurrency(code);
        persistSettings({ currency: code });
    };

    // --- Password change (OTP-gated) ---
    const requestPasswordOtp = async () => {
        setBusy("password");
        setStatus((s) => ({ ...s, password: null }));
        try {
            await api.post("/account/password/request-otp");
            setPwdStep("otp");
            say("password", "We emailed you a 6-digit code.", false);
        } catch (err) {
            say("password", extractErrorMessage(err), true);
        } finally {
            setBusy("");
        }
    };

    const verifyPasswordOtp = async (e) => {
        e.preventDefault();
        setBusy("password");
        try {
            const { data } = await api.post("/account/password/verify-otp", { code: pwdCode });
            setReauthToken(data.data.reauth_token);
            setPwdStep("form");
            setPwdCode("");
            say("password", "Verified. Choose your new password.", false);
        } catch (err) {
            say("password", extractErrorMessage(err), true);
        } finally {
            setBusy("");
        }
    };

    const submitNewPassword = async (e) => {
        e.preventDefault();
        setBusy("password");
        try {
            await api.put("/account/password", { reauth_token: reauthToken, new_password: newPassword });
            setPwdStep("idle");
            setNewPassword("");
            setReauthToken(null);
            say("password", "Password changed.", false);
        } catch (err) {
            say("password", extractErrorMessage(err), true);
        } finally {
            setBusy("");
        }
    };

    const cancelPasswordChange = () => {
        setPwdStep("idle");
        setPwdCode("");
        setNewPassword("");
        setReauthToken(null);
        setStatus((s) => ({ ...s, password: null }));
    };

    const deleteAccount = async (e) => {
        e.preventDefault();
        setBusy("delete");
        try {
            await api.delete("/account", { data: { password: deletePassword } });
            logout();
            navigate("/");
        } catch (err) {
            say("delete", extractErrorMessage(err), true);
        } finally {
            setBusy("");
        }
    };

    if (!profile) return <div className="max-w-2xl mx-auto px-4 py-16 text-ash">{t("common.loading")}</div>;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-12">
            <div>
                <h1 className="font-display text-2xl mb-1">{t("account.title")}</h1>
                <p className="text-ash text-sm">{t("account.signedInAs")} {user?.role?.replace("_", " ")}.</p>
            </div>

            {/* Profile */}
            <section>
                <h2 className="font-display text-lg mb-4">{t("account.profile")}</h2>
                <form onSubmit={saveProfile} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm mb-1">First name</label>
                            <input value={profileForm.first_name}
                                onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                                className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                        </div>
                        <div>
                            <label className="block text-sm mb-1">Last name</label>
                            <input value={profileForm.last_name}
                                onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                                className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Email</label>
                        <input type="email" value={profileForm.email}
                            onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Phone</label>
                        <input value={profileForm.phone}
                            onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>

                    {status.profile && (
                        <p className={`text-sm ${status.profile.error ? "text-coral" : "text-teal"}`}>{status.profile.message}</p>
                    )}

                    <button type="submit" disabled={busy === "profile"}
                        className="w-full sm:w-auto bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                        {busy === "profile" ? t("common.saving") : t("common.save") + " profile"}
                    </button>
                </form>
            </section>

            {/* Settings - applied instantly via context, persisted in the background */}
            <section>
                <h2 className="font-display text-lg mb-1">{t("account.settings")}</h2>
                <p className="text-ash text-sm mb-4">{t("account.settingsHint")}</p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">{t("account.language")}</label>
                        <select value={language}
                            onChange={(e) => handleLanguageChange(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm mb-1">{t("account.theme")}</label>
                        <div className="flex gap-2">
                            {["light", "dark", "system"].map((tOpt) => (
                                <button key={tOpt} type="button"
                                    onClick={() => handleThemeChange(tOpt)}
                                    className={`flex-1 text-sm px-3 py-2 rounded-md border transition-colors capitalize ${
                                        theme === tOpt ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
                                    }`}>
                                    {tOpt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm mb-1">{t("account.currency")}</label>
                        <select value={currency}
                            onChange={(e) => handleCurrencyChange(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <p className="text-xs text-ash mt-1">Product prices will display in this currency. Default is TZS.</p>
                    </div>

                    {status.settings && (
                        <p className={`text-sm ${status.settings.error ? "text-coral" : "text-teal"}`}>{status.settings.message}</p>
                    )}
                </div>
            </section>

            {/* Password - OTP-gated, no current-password field anymore */}
            <section>
                <h2 className="font-display text-lg mb-1">{t("account.changePassword")}</h2>
                <p className="text-ash text-sm mb-4">{t("account.changePasswordHint")}</p>

                {pwdStep === "idle" && (
                    <button onClick={requestPasswordOtp} disabled={busy === "password"}
                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                        {busy === "password" ? "Sending code…" : t("account.changePasswordButton")}
                    </button>
                )}

                {pwdStep === "otp" && (
                    <form onSubmit={verifyPasswordOtp} className="space-y-3 max-w-xs">
                        <div>
                            <label className="block text-sm mb-1">Verification code</label>
                            <input type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6}
                                value={pwdCode}
                                onChange={(e) => setPwdCode(e.target.value.replace(/\D/g, ""))}
                                className="w-full border border-line rounded-md px-3 py-2 text-center text-lg tracking-[0.5em] font-mono focus-ring"
                                placeholder="000000" />
                        </div>

                        {status.password && (
                            <p className={`text-sm ${status.password.error ? "text-coral" : "text-teal"}`}>{status.password.message}</p>
                        )}

                        <div className="flex gap-2">
                            <button type="submit" disabled={busy === "password" || pwdCode.length !== 6}
                                className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                                {busy === "password" ? "Verifying…" : "Verify code"}
                            </button>
                            <button type="button" onClick={cancelPasswordChange}
                                className="text-sm border border-line px-4 py-2 rounded-md hover:border-ink transition-colors">
                                {t("common.cancel")}
                            </button>
                        </div>
                    </form>
                )}

                {pwdStep === "form" && (
                    <form onSubmit={submitNewPassword} className="space-y-3 max-w-xs">
                        <div>
                            <label className="block text-sm mb-1">New password</label>
                            <input type="password" required minLength={8} value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                        </div>

                        {status.password && (
                            <p className={`text-sm ${status.password.error ? "text-coral" : "text-teal"}`}>{status.password.message}</p>
                        )}

                        <div className="flex gap-2">
                            <button type="submit" disabled={busy === "password"}
                                className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                                {busy === "password" ? "Updating…" : "Set new password"}
                            </button>
                            <button type="button" onClick={cancelPasswordChange}
                                className="text-sm border border-line px-4 py-2 rounded-md hover:border-ink transition-colors">
                                {t("common.cancel")}
                            </button>
                        </div>
                    </form>
                )}

                {pwdStep === "idle" && status.password && (
                    <p className={`text-sm mt-2 ${status.password.error ? "text-coral" : "text-teal"}`}>{status.password.message}</p>
                )}
            </section>

            {/* Danger zone */}
            <section className="border border-coral/30 rounded-lg p-5">
                <h2 className="font-display text-lg mb-1 text-coral">{t("account.deleteAccount")}</h2>
                <p className="text-ash text-sm mb-4">
                    This permanently deletes your personal data and deactivates your account. This can't be undone.
                </p>

                {!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)}
                        className="text-sm border border-coral text-coral px-4 py-2 rounded-md hover:bg-coral/10 transition-colors">
                        Delete my account
                    </button>
                ) : (
                    <form onSubmit={deleteAccount} className="space-y-3">
                        <div>
                            <label className="block text-sm mb-1">Confirm your password</label>
                            <input type="password" required value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                        </div>

                        {status.delete && <p className="text-coral text-sm">{status.delete.message}</p>}

                        <div className="flex gap-2">
                            <button type="submit" disabled={busy === "delete"}
                                className="bg-coral text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                                {busy === "delete" ? "Deleting…" : "Permanently delete"}
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(false)}
                                className="text-sm border border-line px-4 py-2 rounded-md hover:border-ink transition-colors">
                                {t("common.cancel")}
                            </button>
                        </div>
                    </form>
                )}
            </section>
        </div>
    );
}
