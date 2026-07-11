import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "sw", label: "Kiswahili" }
];

const CURRENCIES = ["TZS", "EUR", "GBP", "KES", "UGX", "USD"].sort();

export default function Account() {
    const { user, updateUser, logout } = useAuth();
    const navigate = useNavigate();

    const [profile, setProfile] = useState(null);
    const [profileForm, setProfileForm] = useState({ first_name: "", last_name: "", email: "", phone: "" });
    const [settingsForm, setSettingsForm] = useState({ language: "en", theme: "system", currency: "TZS" });
    const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "" });
    const [deletePassword, setDeletePassword] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);

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
            setSettingsForm({
                language: data.data.language,
                theme: data.data.theme,
                currency: data.data.currency
            });
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

    const saveSettings = async (e) => {
        e.preventDefault();
        setBusy("settings");
        try {
            const { data } = await api.put("/account/settings", settingsForm);
            setProfile(data.data);
            updateUser(data.data);
            say("settings", "Settings saved.", false);
        } catch (err) {
            say("settings", extractErrorMessage(err), true);
        } finally {
            setBusy("");
        }
    };

    const savePassword = async (e) => {
        e.preventDefault();
        setBusy("password");
        try {
            await api.put("/account/password", passwordForm);
            setPasswordForm({ current_password: "", new_password: "" });
            say("password", "Password changed.", false);
        } catch (err) {
            say("password", extractErrorMessage(err), true);
        } finally {
            setBusy("");
        }
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

    if (!profile) return <div className="max-w-2xl mx-auto px-4 py-16 text-ash">Loading your account…</div>;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-12">
            <div>
                <h1 className="font-display text-2xl mb-1">Account</h1>
                <p className="text-ash text-sm">Signed in as {user?.role?.replace("_", " ")}.</p>
            </div>

            {/* Profile */}
            <section>
                <h2 className="font-display text-lg mb-4">Profile</h2>
                <form onSubmit={saveProfile} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
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
                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                        {busy === "profile" ? "Saving…" : "Save profile"}
                    </button>
                </form>
            </section>

            {/* Settings */}
            <section>
                <h2 className="font-display text-lg mb-1">Settings</h2>
                <p className="text-ash text-sm mb-4">Language, theme, and currency apply across NEXORA.</p>
                <form onSubmit={saveSettings} className="space-y-3">
                    <div>
                        <label className="block text-sm mb-1">Language</label>
                        <select value={settingsForm.language}
                            onChange={(e) => setSettingsForm({ ...settingsForm, language: e.target.value })}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-white">
                            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm mb-1">Theme</label>
                        <div className="flex gap-2">
                            {["light", "dark", "system"].map((t) => (
                                <button key={t} type="button"
                                    onClick={() => setSettingsForm({ ...settingsForm, theme: t })}
                                    className={`flex-1 text-sm px-3 py-2 rounded-md border transition-colors capitalize ${
                                        settingsForm.theme === t ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
                                    }`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm mb-1">Currency</label>
                        <select value={settingsForm.currency}
                            onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-white">
                            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <p className="text-xs text-ash mt-1">Product prices will display in this currency. Default is TZS.</p>
                    </div>

                    {status.settings && (
                        <p className={`text-sm ${status.settings.error ? "text-coral" : "text-teal"}`}>{status.settings.message}</p>
                    )}

                    <button type="submit" disabled={busy === "settings"}
                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                        {busy === "settings" ? "Saving…" : "Save settings"}
                    </button>
                </form>
            </section>

            {/* Password */}
            <section>
                <h2 className="font-display text-lg mb-4">Change password</h2>
                <form onSubmit={savePassword} className="space-y-3">
                    <div>
                        <label className="block text-sm mb-1">Current password</label>
                        <input type="password" required value={passwordForm.current_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">New password</label>
                        <input type="password" required minLength={8} value={passwordForm.new_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>

                    {status.password && (
                        <p className={`text-sm ${status.password.error ? "text-coral" : "text-teal"}`}>{status.password.message}</p>
                    )}

                    <button type="submit" disabled={busy === "password"}
                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                        {busy === "password" ? "Updating…" : "Update password"}
                    </button>
                </form>
            </section>

            {/* Danger zone */}
            <section className="border border-coral/30 rounded-lg p-5">
                <h2 className="font-display text-lg mb-1 text-coral">Delete account</h2>
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
                                Cancel
                            </button>
                        </div>
                    </form>
                )}
            </section>
        </div>
    );
}
