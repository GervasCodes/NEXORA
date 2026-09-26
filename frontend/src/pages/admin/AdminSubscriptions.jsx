import { Fragment, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import EmptyState from "../../components/ui/EmptyState";
import Button from "../../components/ui/Button";

const STATUS_STYLES = {
    active: "bg-teal/10 text-teal",
    pending: "bg-mango/10 text-mango-dark",
    past_due: "bg-coral/10 text-coral",
    cancelled: "bg-line text-ash",
    expired: "bg-line text-ash"
};

// Features are stored as a JSON array of bullet strings; the admin edits
// them as one bullet per line.
const featuresToText = (features) => (Array.isArray(features) ? features.join("\n") : "");
const textToFeatures = (text) =>
    String(text || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

const FIELD_CLASS = "w-full border border-line rounded-md px-3 py-2 text-sm focus-ring";
const LABEL_CLASS = "block text-xs text-ash mb-1";

const EMPTY_NEW_PLAN = {
    code: "",
    name: "",
    description: "",
    price: "",
    billingCycle: "monthly",
    commissionRateOverride: "",
    maxActiveListings: "",
    sponsorshipCreditsPerMonth: "0",
    sortOrder: "",
    featuresText: ""
};

export default function AdminSubscriptions() {
    const [plans, setPlans] = useState([]);
    const [subscriptions, setSubscriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const { user } = useAuth();
    const isSuperAdmin = user?.admin_level === "super_admin";
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState({});
    const [saving, setSaving] = useState(false);
    const [showNewPlan, setShowNewPlan] = useState(false);
    const [newPlan, setNewPlan] = useState(EMPTY_NEW_PLAN);
    const [creating, setCreating] = useState(false);

    const load = () => {
        setLoading(true);
        Promise.all([api.get("/admin/subscription-plans"), api.get("/admin/subscriptions")])
            .then(([plansRes, subsRes]) => {
                setPlans(plansRes.data.data);
                setSubscriptions(subsRes.data.data);
            })
            .catch(() => toast?.error("Couldn't load subscription data."))
            .finally(() => setLoading(false));
    };

    useEffect(load, [toast]);

    const startEdit = (plan) => {
        setEditingId(plan.id);
        setDraft({
            name: plan.name ?? "",
            description: plan.description ?? "",
            featuresText: featuresToText(plan.features),
            price: plan.price,
            commissionRateOverride: plan.commissionRateOverride ?? "",
            maxActiveListings: plan.maxActiveListings ?? "",
            sponsorshipCreditsPerMonth: plan.sponsorshipCreditsPerMonth ?? 0,
            isActive: plan.isActive
        });
    };

    const saveEdit = async (planId) => {
        if (!draft.name.trim()) {
            toast?.error("Plan name can't be blank.");
            return;
        }

        setSaving(true);
        try {
            await api.put(`/admin/subscription-plans/${planId}`, {
                name: draft.name.trim(),
                description: draft.description.trim() || null,
                features: textToFeatures(draft.featuresText),
                price: Number(draft.price),
                commissionRateOverride: draft.commissionRateOverride === "" ? null : Number(draft.commissionRateOverride),
                maxActiveListings: draft.maxActiveListings === "" ? null : Number(draft.maxActiveListings),
                sponsorshipCreditsPerMonth: Number(draft.sponsorshipCreditsPerMonth || 0),
                isActive: draft.isActive
            });
            setEditingId(null);
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const openNewPlan = () => {
        const nextOrder = plans.reduce((max, p) => Math.max(max, Number(p.sortOrder) || 0), -1) + 1;
        setNewPlan({ ...EMPTY_NEW_PLAN, sortOrder: String(nextOrder) });
        setShowNewPlan(true);
    };

    const closeNewPlan = () => {
        setShowNewPlan(false);
        setNewPlan(EMPTY_NEW_PLAN);
    };

    const createPlan = async (e) => {
        e.preventDefault();

        const code = newPlan.code.trim();
        if (plans.some((p) => p.code === code)) {
            toast?.error(`A plan with the code "${code}" already exists.`);
            return;
        }

        setCreating(true);
        try {
            await api.post("/admin/subscription-plans", {
                code,
                name: newPlan.name.trim(),
                description: newPlan.description.trim() || null,
                price: Number(newPlan.price),
                billingCycle: newPlan.billingCycle,
                commissionRateOverride: newPlan.commissionRateOverride === "" ? null : Number(newPlan.commissionRateOverride),
                maxActiveListings: newPlan.maxActiveListings === "" ? null : Number(newPlan.maxActiveListings),
                sponsorshipCreditsPerMonth: Number(newPlan.sponsorshipCreditsPerMonth || 0),
                sortOrder: Number(newPlan.sortOrder || 0),
                features: textToFeatures(newPlan.featuresText)
            });
            toast?.success(`Plan "${newPlan.name.trim()}" created.`);
            closeNewPlan();
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div className="animate-fade-in space-y-10">
            <PageMeta title="Subscriptions" noIndex />
            <div>
                <h1 className="font-display text-2xl mb-1">Subscription plans</h1>
                <p className="text-ash text-sm mb-6">
                    Name, description, feature bullets, pricing, commission overrides, listing limits, and included sponsorship credits (1 credit = 1 campaign-day) for each tier. Pricing changes apply to new/renewing subscriptions - already-active periods keep the rate a seller was quoted.
                </p>

                {isSuperAdmin && (
                    <div className="mb-6">
                        {!showNewPlan ? (
                            <Button size="sm" onClick={openNewPlan}>New plan</Button>
                        ) : (
                            <form onSubmit={createPlan} className="border border-line rounded-lg p-4 space-y-4">
                                <div>
                                    <h2 className="font-display text-lg mb-1">Create a plan</h2>
                                    <p className="text-ash text-xs">
                                        New plans are active immediately and show up on the seller pricing page - untick "Active" after creating to hide one. The code can't be changed later. Any plan whose code isn't "free" counts as a paid tier and unlocks Analytics &amp; AI.
                                    </p>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div>
                                        <label htmlFor="new-plan-code" className={LABEL_CLASS}>Code</label>
                                        <input id="new-plan-code" required maxLength={30} placeholder="e.g. business"
                                            value={newPlan.code}
                                            onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                                            className={FIELD_CLASS} />
                                    </div>
                                    <div>
                                        <label htmlFor="new-plan-name" className={LABEL_CLASS}>Name</label>
                                        <input id="new-plan-name" required maxLength={100} placeholder="e.g. Business"
                                            value={newPlan.name}
                                            onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                                            className={FIELD_CLASS} />
                                    </div>
                                    <div>
                                        <label htmlFor="new-plan-cycle" className={LABEL_CLASS}>Billing cycle</label>
                                        <select id="new-plan-cycle" value={newPlan.billingCycle}
                                            onChange={(e) => setNewPlan({ ...newPlan, billingCycle: e.target.value })}
                                            className={FIELD_CLASS}>
                                            <option value="monthly">Monthly</option>
                                            <option value="annual">Annual (credits x 12 per period)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="new-plan-price" className={LABEL_CLASS}>Price / cycle</label>
                                        <input id="new-plan-price" required type="number" min="0" step="0.01"
                                            value={newPlan.price}
                                            onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                                            className={FIELD_CLASS} />
                                    </div>
                                    <div>
                                        <label htmlFor="new-plan-commission" className={LABEL_CLASS}>Commission override (%)</label>
                                        <input id="new-plan-commission" type="number" min="0" max="100" step="0.01"
                                            placeholder="platform default"
                                            value={newPlan.commissionRateOverride}
                                            onChange={(e) => setNewPlan({ ...newPlan, commissionRateOverride: e.target.value })}
                                            className={FIELD_CLASS} />
                                    </div>
                                    <div>
                                        <label htmlFor="new-plan-listings" className={LABEL_CLASS}>Max listings</label>
                                        <input id="new-plan-listings" type="number" min="1" step="1"
                                            placeholder="unlimited"
                                            value={newPlan.maxActiveListings}
                                            onChange={(e) => setNewPlan({ ...newPlan, maxActiveListings: e.target.value })}
                                            className={FIELD_CLASS} />
                                    </div>
                                    <div>
                                        <label htmlFor="new-plan-credits" className={LABEL_CLASS}>Sponsorship credits / month</label>
                                        <input id="new-plan-credits" type="number" min="0" max="1000" step="1"
                                            value={newPlan.sponsorshipCreditsPerMonth}
                                            onChange={(e) => setNewPlan({ ...newPlan, sponsorshipCreditsPerMonth: e.target.value })}
                                            className={FIELD_CLASS} />
                                    </div>
                                    <div>
                                        <label htmlFor="new-plan-order" className={LABEL_CLASS}>Display order (lower shows first)</label>
                                        <input id="new-plan-order" type="number" min="0" step="1"
                                            value={newPlan.sortOrder}
                                            onChange={(e) => setNewPlan({ ...newPlan, sortOrder: e.target.value })}
                                            className={FIELD_CLASS} />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="new-plan-description" className={LABEL_CLASS}>Description (optional)</label>
                                    <input id="new-plan-description" maxLength={255}
                                        value={newPlan.description}
                                        onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
                                        className={FIELD_CLASS} />
                                </div>
                                <div>
                                    <label htmlFor="new-plan-features" className={LABEL_CLASS}>Feature bullets (one per line, up to 12)</label>
                                    <textarea id="new-plan-features" rows={5}
                                        value={newPlan.featuresText}
                                        onChange={(e) => setNewPlan({ ...newPlan, featuresText: e.target.value })}
                                        className={FIELD_CLASS} />
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create plan"}</Button>
                                    <button type="button" onClick={closeNewPlan} disabled={creating}
                                        className="text-sm text-ash hover:text-ink px-2 py-2 disabled:opacity-60">Cancel</button>
                                </div>
                            </form>
                        )}
                    </div>
                )}

                <div className="overflow-x-auto border border-line rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-line/30 text-left">
                            <tr>
                                <th className="px-4 py-2">Plan</th>
                                <th className="px-4 py-2">Price / cycle</th>
                                <th className="px-4 py-2">Commission override</th>
                                <th className="px-4 py-2">Max listings</th>
                                <th className="px-4 py-2">Sponsorship credits / month</th>
                                <th className="px-4 py-2">Active</th>
                                <th className="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {plans.map((plan) => (
                                <Fragment key={plan.id}>
                                <tr>
                                    {editingId === plan.id ? (
                                        <td className="px-4 py-2 font-medium">
                                            <input type="text" value={draft.name} maxLength={100} aria-label="Plan name"
                                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                                className="w-40 border border-line rounded-md px-2 py-1 text-sm focus-ring" />
                                            <span className="block text-ash text-xs mt-1">({plan.code})</span>
                                        </td>
                                    ) : (
                                        <td className="px-4 py-2 font-medium align-top">
                                            {plan.name} <span className="text-ash text-xs">({plan.code})</span>
                                            {plan.description && (
                                                <p className="text-xs text-ash font-normal mt-0.5 max-w-xs">{plan.description}</p>
                                            )}
                                            {plan.features?.length > 0 && (
                                                <p className="text-xs text-ash font-normal mt-0.5 max-w-xs truncate" title={plan.features.join("\n")}>
                                                    {plan.features.join(" · ")}
                                                </p>
                                            )}
                                        </td>
                                    )}
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
                                                <input type="number" min="0" step="1" value={draft.sponsorshipCreditsPerMonth}
                                                    onChange={(e) => setDraft({ ...draft, sponsorshipCreditsPerMonth: e.target.value })}
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
                                            <td className="px-4 py-2">{plan.sponsorshipCreditsPerMonth} day{plan.sponsorshipCreditsPerMonth === 1 ? "" : "s"}</td>
                                            <td className="px-4 py-2">{plan.isActive ? "Yes" : "No"}</td>
                                            <td className="px-4 py-2">
                                                {isSuperAdmin && (
                                                    <button onClick={() => startEdit(plan)} className="text-azure text-xs font-semibold hover:underline">Edit</button>
                                                )}
                                            </td>
                                        </>
                                    )}
                                </tr>
                                {editingId === plan.id && (
                                    <tr className="bg-line/10">
                                        <td colSpan={7} className="px-4 py-3">
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                    <label htmlFor={`plan-${plan.id}-description`} className={LABEL_CLASS}>Description (optional)</label>
                                                    <input id={`plan-${plan.id}-description`} maxLength={255}
                                                        value={draft.description}
                                                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                                        className={FIELD_CLASS} />
                                                </div>
                                                <div>
                                                    <label htmlFor={`plan-${plan.id}-features`} className={LABEL_CLASS}>Feature bullets (one per line, up to 12)</label>
                                                    <textarea id={`plan-${plan.id}-features`} rows={5}
                                                        value={draft.featuresText}
                                                        onChange={(e) => setDraft({ ...draft, featuresText: e.target.value })}
                                                        className={FIELD_CLASS} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div>
                <h2 className="font-display text-xl mb-1">Seller subscriptions</h2>
                <p className="text-ash text-sm mb-6">Most recent 500 subscription records, newest first.</p>

                {subscriptions.length === 0 ? (
                    <EmptyState title="No paid subscriptions yet." />
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
