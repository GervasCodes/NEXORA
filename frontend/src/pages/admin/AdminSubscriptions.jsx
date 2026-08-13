import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";

const STATUS_STYLES = {
    active: "bg-teal/10 text-teal",
    pending: "bg-mango/10 text-mango-dark",
    past_due: "bg-coral/10 text-coral",
    cancelled: "bg-line text-ash",
    expired: "bg-line text-ash"
};

export default function AdminSubscriptions() {
    const [plans, setPlans] = useState([]);
    const [subscriptions, setSubscriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState({});
    const [saving, setSaving] = useState(false);

    const load = () => {
        setLoading(true);
        Promise.all([api.get("/admin/subscription-plans"), api.get("/admin/subscriptions")])
            .then(([plansRes, subsRes]) => {
                setPlans(plansRes.data.data);
                setSubscriptions(subsRes.data.data);
            })
            .catch(() => setError("Couldn't load subscription data."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const startEdit = (plan) => {
        setEditingId(plan.id);
        setDraft({
            price: plan.price,
            commissionRateOverride: plan.commissionRateOverride ?? "",
            maxActiveListings: plan.maxActiveListings ?? "",
            isActive: plan.isActive
        });
    };

    const saveEdit = async (planId) => {
        setSaving(true);
        setError("");
        try {
            await api.put(`/admin/subscription-plans/${planId}`, {
                price: Number(draft.price),
                commissionRateOverride: draft.commissionRateOverride === "" ? null : Number(draft.commissionRateOverride),
                maxActiveListings: draft.maxActiveListings === "" ? null : Number(draft.maxActiveListings),
                isActive: draft.isActive
            });
            setEditingId(null);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div className="animate-fade-in space-y-10">
            <PageMeta title="Subscriptions" noIndex />
            <div>
                <h1 className="font-display text-2xl mb-1">Subscription plans</h1>
                <p className="text-ash text-sm mb-6">
                    Pricing, commission overrides, and listing limits for each tier. Changes apply to new/renewing subscriptions - already-active periods keep the rate a seller was quoted.
                </p>

                {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

                <div className="overflow-x-auto border border-line rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-line/30 text-left">
                            <tr>
                                <th className="px-4 py-2">Plan</th>
                                <th className="px-4 py-2">Price / cycle</th>
                                <th className="px-4 py-2">Commission override</th>
                                <th className="px-4 py-2">Max listings</th>
                                <th className="px-4 py-2">Active</th>
                                <th className="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {plans.map((plan) => (
                                <tr key={plan.id}>
                                    <td className="px-4 py-2 font-medium">{plan.name} <span className="text-ash text-xs">({plan.code})</span></td>
                                    {editingId === plan.id ? (
                                        <>
                                            <td className="px-4 py-2">
                                                <input type="number" value={draft.price}
                                                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                                                    className="w-28 border border-line rounded-md px-2 py-1 text-sm focus-ring" />
                                                <span className="text-xs text-ash ml-1">/{plan.billingCycle}</span>
                                            </td>
                                            <td className="px-4 py-2">
                                                <input type="number" step="0.01" value={draft.commissionRateOverride}
                                                    placeholder="platform default"
                                                    onChange={(e) => setDraft({ ...draft, commissionRateOverride: e.target.value })}
                                                    className="w-28 border border-line rounded-md px-2 py-1 text-sm focus-ring" />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input type="number" value={draft.maxActiveListings}
                                                    placeholder="unlimited"
                                                    onChange={(e) => setDraft({ ...draft, maxActiveListings: e.target.value })}
                                                    className="w-24 border border-line rounded-md px-2 py-1 text-sm focus-ring" />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input type="checkbox" checked={draft.isActive}
                                                    onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <button disabled={saving} onClick={() => saveEdit(plan.id)}
                                                    className="text-teal text-xs font-semibold hover:underline mr-3 disabled:opacity-60">Save</button>
                                                <button onClick={() => setEditingId(null)} className="text-ash text-xs hover:underline">Cancel</button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-2">{formatMoney(plan.price)} / {plan.billingCycle}</td>
                                            <td className="px-4 py-2">{plan.commissionRateOverride !== null ? `${plan.commissionRateOverride}%` : "platform default"}</td>
                                            <td className="px-4 py-2">{plan.maxActiveListings ?? "unlimited"}</td>
                                            <td className="px-4 py-2">{plan.isActive ? "Yes" : "No"}</td>
                                            <td className="px-4 py-2">
                                                <button onClick={() => startEdit(plan)} className="text-azure text-xs font-semibold hover:underline">Edit</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div>
                <h2 className="font-display text-xl mb-1">Seller subscriptions</h2>
                <p className="text-ash text-sm mb-6">Most recent 500 subscription records, newest first.</p>

                {subscriptions.length === 0 ? (
                    <p className="text-ash text-sm">No paid subscriptions yet.</p>
                ) : (
                    <ul className="divide-y divide-line border-y border-line">
                        {subscriptions.map((s) => (
                            <li key={s.id} className="py-3 flex flex-wrap items-center gap-3 px-2 -mx-2 rounded-md transition-colors hover:bg-line/30">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{s.first_name} {s.last_name}</p>
                                    <p className="text-xs text-ash truncate">{s.email}</p>
                                </div>
                                <p className="text-xs text-ash">{s.plan_name} - {formatMoney(s.price)}</p>
                                <p className="text-xs text-ash">
                                    {s.current_period_end ? `until ${formatDate(s.current_period_end)}` : formatDate(s.created_at)}
                                </p>
                                <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_STYLES[s.status] || "bg-line text-ash"}`}>
                                    {s.status.replace("_", " ")}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
