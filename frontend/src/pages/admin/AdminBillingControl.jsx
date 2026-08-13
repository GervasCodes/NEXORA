import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageLoader from "../../components/PageLoader";

const FLAGS = [
    {
        key: "monetization_subscriptions_enabled",
        label: "Subscriptions",
        description: "When off, sellers can pick any plan for free - it activates immediately, no payment request."
    },
    {
        key: "monetization_commission_enabled",
        label: "Commission",
        description: "When off, platform commission is a flat 0% on every sale, ignoring the rate and any plan override."
    },
    {
        key: "monetization_sponsorship_enabled",
        label: "Sponsorship & featured placement",
        description: "When off, product sponsorship, featured-store, and department-sponsorship campaigns are free and auto-approved."
    },
    {
        key: "monetization_verification_fee_enabled",
        label: "Seller verification fee",
        description: "When off, the one-time Verified Seller fee is waived - the badge activates as soon as account verification is approved."
    }
];

function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

export default function AdminBillingControl() {
    const [status, setStatus] = useState(null);
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [savingKey, setSavingKey] = useState(null);

    const [scheduleForm, setScheduleForm] = useState({ setting_key: FLAGS[0].key, enabled: true, scheduled_at: "" });
    const [scheduling, setScheduling] = useState(false);
    const [scheduleError, setScheduleError] = useState("");

    const load = () => {
        setLoading(true);
        Promise.all([api.get("/admin/monetization"), api.get("/admin/monetization/schedule")])
            .then(([statusRes, scheduleRes]) => {
                setStatus(statusRes.data.data);
                setSchedule(scheduleRes.data.data);
            })
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggleFlag = async (key, nextEnabled) => {
        setSavingKey(key);
        setError("");
        try {
            const { data } = await api.put("/admin/monetization", { [key]: nextEnabled });
            setStatus(data.data);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSavingKey(null);
        }
    };

    const submitSchedule = async (e) => {
        e.preventDefault();
        setScheduling(true);
        setScheduleError("");
        try {
            await api.post("/admin/monetization/schedule", scheduleForm);
            setScheduleForm({ ...scheduleForm, scheduled_at: "" });
            load();
        } catch (err) {
            setScheduleError(extractErrorMessage(err));
        } finally {
            setScheduling(false);
        }
    };

    const cancelSchedule = async (id) => {
        try {
            await api.delete(`/admin/monetization/schedule/${id}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Billing control center</h1>
            <p className="text-ash text-sm mb-8">
                Turn each monetization stream on or off platform-wide. Everything defaults to free during launch - enabling
                a flag here takes effect immediately for every seller/provider, no redeploy needed.
            </p>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <div className="border border-line rounded-lg divide-y divide-line max-w-2xl mb-8">
                {FLAGS.map((flag) => {
                    const flagStatus = status?.[flag.key];
                    const enabled = Boolean(flagStatus?.enabled);
                    return (
                        <div key={flag.key} className="p-4 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium">{flag.label}</p>
                                <p className="text-xs text-ash mt-0.5 max-w-md">{flag.description}</p>
                                <p className="text-xs text-ash mt-2">
                                    {enabled ? "Enabled" : "Free during launch"}
                                    {flagStatus?.lastChangedAt && (
                                        <>
                                            {" · last changed "}
                                            {formatDate(flagStatus.lastChangedAt)}
                                            {flagStatus.lastChangedBy?.email ? ` by ${flagStatus.lastChangedBy.email}` : ""}
                                        </>
                                    )}
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={savingKey === flag.key}
                                onClick={() => toggleFlag(flag.key, !enabled)}
                                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                    enabled
                                        ? "bg-teal/10 border-teal text-teal"
                                        : "bg-paper border-line text-ash"
                                }`}
                            >
                                {savingKey === flag.key ? "Saving…" : enabled ? "Enabled" : "Disabled"}
                            </button>
                        </div>
                    );
                })}
            </div>

            <h2 className="font-display text-lg mb-1">Scheduled activations</h2>
            <p className="text-ash text-sm mb-4">
                Schedule a flag to flip automatically at a future date/time instead of flipping it live now.
            </p>

            <form onSubmit={submitSchedule} className="border border-line rounded-lg p-4 max-w-2xl space-y-3 mb-6">
                {scheduleError && <p role="alert" className="text-coral text-sm">{scheduleError}</p>}
                <div className="flex flex-wrap gap-3">
                    <select
                        value={scheduleForm.setting_key}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, setting_key: e.target.value })}
                        className="border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    >
                        {FLAGS.map((flag) => (
                            <option key={flag.key} value={flag.key}>{flag.label}</option>
                        ))}
                    </select>
                    <select
                        value={scheduleForm.enabled ? "enable" : "disable"}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, enabled: e.target.value === "enable" })}
                        className="border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    >
                        <option value="enable">Enable</option>
                        <option value="disable">Disable</option>
                    </select>
                    <input
                        type="datetime-local"
                        required
                        value={scheduleForm.scheduled_at}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_at: e.target.value })}
                        className="border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                    <button
                        type="submit"
                        disabled={scheduling}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-ink text-paper disabled:opacity-50"
                    >
                        {scheduling ? "Scheduling…" : "Schedule"}
                    </button>
                </div>
            </form>

            {schedule.length > 0 && (
                <div className="border border-line rounded-lg divide-y divide-line max-w-2xl">
                    {schedule.map((row) => {
                        const flag = FLAGS.find((f) => f.key === row.setting_key);
                        return (
                            <div key={row.id} className="p-3 flex items-center justify-between gap-4 text-sm">
                                <span>
                                    {flag?.label || row.setting_key} → {row.scheduled_value ? "Enable" : "Disable"} at{" "}
                                    {formatDate(row.scheduled_at)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => cancelSchedule(row.id)}
                                    className="text-coral text-xs hover:underline shrink-0"
                                >
                                    Cancel
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
