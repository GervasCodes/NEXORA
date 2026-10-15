import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDateTime } from "../../utils/format";
import PageMeta from "../../components/PageMeta";
import Skeleton from "../../components/Skeleton";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/ToastContext";

// Delivery business-management (Round 4, Phase 9). A delivery business is
// owned by an approved delivery_agent account: it has a roster of riders,
// a fleet overview (their Nexora work + independent jobs) and independent
// jobs that never touch Nexora orders or wallets (fees are record-only).

const TABS = ["overview", "roster", "jobs"];
const PAGE_SIZE = 20;
const STATUSES = ["created", "assigned", "picked_up", "delivered", "cancelled"];

const todayString = () => new Date().toISOString().slice(0, 10);
const daysAgoString = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const riderName = (a) => `${a.first_name || ""} ${a.last_name || ""}`.trim();
const percent = (ratio) => (ratio === null || ratio === undefined ? "-" : `${Math.round(ratio * 100)}%`);

function Stat({ label, value, mono, highlight }) {
    return (
        <div className={`border rounded-lg p-4 ${highlight ? "border-teal/30 bg-teal/5" : "border-line"}`}>
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`text-lg font-medium ${mono ? "price" : ""}`}>{value}</p>
        </div>
    );
}

function SetupForm({ onCreated }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!name.trim()) { setError(t("delivery.business.nameRequired")); return; }
        setSaving(true);
        try {
            const { data } = await api.post("/delivery-business", { name: name.trim() });
            toast?.success(t("delivery.business.created"));
            onCreated(data.data);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="max-w-md border border-line rounded-lg p-5 space-y-4">
            <div>
                <h3 className="font-display text-lg">{t("delivery.business.setupTitle")}</h3>
                <p className="text-sm text-ash mt-1">{t("delivery.business.setupBody")}</p>
            </div>
            <label className="text-xs text-ash flex flex-col gap-1">
                {t("delivery.business.businessName")}
                <Input type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {error && <p className="text-coral text-sm" role="alert">{error}</p>}
            <Button type="submit" disabled={saving}>
                {saving ? t("delivery.business.creating") : t("delivery.business.create")}
            </Button>
        </form>
    );
}

// ------------------------------------------------------------- Overview

function OverviewTab({ refreshSignal }) {
    const { t } = useLanguage();
    const [from, setFrom] = useState(daysAgoString(29));
    const [to, setTo] = useState(todayString());
    const [applied, setApplied] = useState({ from: daysAgoString(29), to: todayString() });
    const [rangeError, setRangeError] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setError("");
        api.get("/delivery-business/overview", { params: applied })
            .then(({ data: res }) => setData(res.data))
            .catch((err) => setError(extractErrorMessage(err)));
    }, [applied]);
    useEffect(load, [load, refreshSignal]);

    const apply = () => {
        if (!from || !to || new Date(to) < new Date(from)) { setRangeError(t("delivery.business.dateRangeError")); return; }
        setRangeError("");
        setApplied({ from, to });
    };

    if (error) return <ErrorState title={t("delivery.business.loadError")} hint={error} onRetry={load} />;

    const openJobs = data
        ? (data.open_jobs.created || 0) + (data.open_jobs.assigned || 0) + (data.open_jobs.picked_up || 0)
        : 0;

    return (
        <div>
            <div className="flex flex-wrap items-end gap-3 mb-6">
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("delivery.business.from")}
                    <Input type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("delivery.business.to")}
                    <Input type="date" min={from} max={todayString()} value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
                <Button size="sm" onClick={apply}>{t("delivery.business.apply")}</Button>
                {rangeError && <p className="text-coral text-xs" role="alert">{rangeError}</p>}
            </div>

            {!data ? (
                <Skeleton className="h-48 w-full" />
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                        <Stat label={t("delivery.business.statDelivered")} value={data.combined.delivered} />
                        <Stat label={t("delivery.business.statRevenue")} value={formatMoney(data.combined.revenue)} mono highlight />
                        <Stat label={t("delivery.business.statRoster")} value={data.roster_size} />
                        <Stat label={t("delivery.business.statNexora")} value={formatMoney(data.nexora.earnings)} mono />
                        <Stat label={t("delivery.business.statIndependent")} value={formatMoney(data.independent.fees_collected)} mono />
                        <Stat label={t("delivery.business.statOpenJobs")} value={openJobs} />
                    </div>

                    <p className="text-sm font-medium mb-3">{t("delivery.business.agentsTitle")}</p>
                    {data.agents.length === 0 ? (
                        <EmptyState title={t("delivery.business.noRiders")} />
                    ) : (
                        <div className="overflow-x-auto border border-line rounded-lg">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-ash border-b border-line">
                                        <th className="p-3 font-medium">{t("delivery.business.colRider")}</th>
                                        <th className="p-3 font-medium text-right">{t("delivery.business.colNexora")}</th>
                                        <th className="p-3 font-medium text-right">{t("delivery.business.colNexoraEarn")}</th>
                                        <th className="p-3 font-medium text-right">{t("delivery.business.colIndep")}</th>
                                        <th className="p-3 font-medium text-right">{t("delivery.business.colIndepFees")}</th>
                                        <th className="p-3 font-medium text-right">{t("delivery.business.colCompletion")}</th>
                                        <th className="p-3 font-medium text-right">{t("delivery.business.colRating")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.agents.map((a) => (
                                        <tr key={a.agent_id} className="border-b border-line last:border-0">
                                            <td className="p-3 whitespace-nowrap">{riderName(a)}</td>
                                            <td className="p-3 text-right">{a.nexora.delivered}</td>
                                            <td className="p-3 text-right price">{formatMoney(a.nexora.earnings)}</td>
                                            <td className="p-3 text-right">{a.independent.delivered}</td>
                                            <td className="p-3 text-right price">{formatMoney(a.independent.fees_collected)}</td>
                                            <td className="p-3 text-right">{percent(a.completion_rate)}</td>
                                            <td className="p-3 text-right whitespace-nowrap">
                                                {a.average_rating !== null ? `${a.average_rating.toFixed(1)} ★ (${a.rating_count})` : "-"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-xs text-ash mt-3">{t("delivery.business.overviewNote")}</p>
                </>
            )}
        </div>
    );
}

// ---------------------------------------------------------------- Roster

function RosterTab({ onChanged }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [roster, setRoster] = useState(null);
    const [error, setError] = useState("");
    const [email, setEmail] = useState("");
    const [adding, setAdding] = useState(false);
    const [formError, setFormError] = useState("");
    const [confirmId, setConfirmId] = useState(null);

    const load = useCallback(() => {
        setError("");
        api.get("/delivery-business/roster")
            .then(({ data }) => setRoster(data.data))
            .catch((err) => setError(extractErrorMessage(err)));
    }, []);
    useEffect(load, [load]);

    const add = async (e) => {
        e.preventDefault();
        setFormError("");
        setAdding(true);
        try {
            await api.post("/delivery-business/roster", { email: email.trim() });
            toast?.success(t("delivery.business.added"));
            setEmail("");
            load();
            onChanged();
        } catch (err) {
            setFormError(extractErrorMessage(err));
        } finally {
            setAdding(false);
        }
    };

    const remove = async (agentId) => {
        try {
            await api.delete(`/delivery-business/roster/${agentId}`);
            toast?.success(t("delivery.business.removed"));
            setConfirmId(null);
            load();
            onChanged();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
            setConfirmId(null);
        }
    };

    if (error) return <ErrorState title={t("delivery.business.loadError")} hint={error} onRetry={load} />;

    return (
        <div>
            <form onSubmit={add} className="border border-line rounded-lg p-4 mb-6">
                <p className="text-sm font-medium mb-3">{t("delivery.business.rosterTitle")}</p>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs text-ash flex flex-col gap-1 flex-1 min-w-[12rem]">
                        {t("delivery.business.addByEmail")}
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </label>
                    <Button type="submit" size="sm" disabled={adding || !email.trim()}>
                        {adding ? t("delivery.business.adding") : t("delivery.business.addRider")}
                    </Button>
                </div>
                <p className="text-xs text-ash mt-2">{t("delivery.business.rosterHint")}</p>
                {formError && <p className="text-coral text-xs mt-2" role="alert">{formError}</p>}
            </form>

            {!roster ? (
                <Skeleton className="h-32 w-full" />
            ) : roster.length === 0 ? (
                <EmptyState title={t("delivery.business.noRoster")} />
            ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {roster.map((a) => (
                        <li key={a.agent_id} className="p-3 flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0">
                                <p className="truncate">{riderName(a)}</p>
                                <p className="text-xs text-ash truncate">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
                            </div>
                            {confirmId === a.agent_id ? (
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-ash">{t("delivery.business.confirmRemove")}</span>
                                    <Button size="sm" variant="secondary" onClick={() => remove(a.agent_id)}>{t("delivery.business.remove")}</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>{t("delivery.business.keep")}</Button>
                                </div>
                            ) : (
                                <Button size="sm" variant="ghost" onClick={() => setConfirmId(a.agent_id)}>{t("delivery.business.remove")}</Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ------------------------------------------------------------------ Jobs

function NewJobForm({ onCreated }) {
    const { t } = useLanguage();
    const toast = useToast();
    const empty = { reference: "", pickup: "", dropoff: "", customer: "", phone: "", description: "", fee: "" };
    const [form, setForm] = useState(empty);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!form.pickup.trim() || !form.dropoff.trim() || !form.customer.trim()) {
            setError(t("delivery.business.jobFieldsRequired"));
            return;
        }
        setSaving(true);
        try {
            await api.post("/delivery-business/jobs", {
                reference: form.reference.trim() || undefined,
                pickup_address: form.pickup.trim(),
                dropoff_address: form.dropoff.trim(),
                customer_name: form.customer.trim(),
                customer_phone: form.phone.trim() || undefined,
                description: form.description.trim() || undefined,
                fee_amount: form.fee === "" ? undefined : Number(form.fee)
            });
            toast?.success(t("delivery.business.jobCreated"));
            setForm(empty);
            onCreated();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="border border-line rounded-lg p-4 mb-6 space-y-3">
            <p className="text-sm font-medium">{t("delivery.business.newJob")}</p>
            <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-ash flex flex-col gap-1">{t("delivery.business.pickup")}
                    <Input type="text" maxLength={255} value={form.pickup} onChange={set("pickup")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("delivery.business.dropoff")}
                    <Input type="text" maxLength={255} value={form.dropoff} onChange={set("dropoff")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("delivery.business.customerName")}
                    <Input type="text" maxLength={120} value={form.customer} onChange={set("customer")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("delivery.business.customerPhone")}
                    <Input type="tel" maxLength={30} value={form.phone} onChange={set("phone")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("delivery.business.description")}
                    <Input type="text" maxLength={255} value={form.description} onChange={set("description")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("delivery.business.reference")}
                    <Input type="text" maxLength={40} value={form.reference} onChange={set("reference")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("delivery.business.fee")}
                    <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.fee} onChange={set("fee")} /></label>
            </div>
            {error && <p className="text-coral text-sm" role="alert">{error}</p>}
            <Button type="submit" size="sm" disabled={saving}>
                {saving ? t("delivery.business.creating") : t("delivery.business.createJob")}
            </Button>
        </form>
    );
}

function JobCard({ job, roster, onChanged }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    const run = async (request) => {
        setBusy(true);
        try {
            await request();
            toast?.success(t("delivery.business.updated"));
            onChanged();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const base = `/delivery-business/jobs/${job.id}`;
    const setStatus = (status) => run(() => api.put(`${base}/status`, { status }));
    const assign = (agentId) => run(() => api.put(`${base}/assign`, { agent_id: agentId ? Number(agentId) : null }));
    const setCollected = (collected) => run(() => api.put(`${base}/fee`, { collected }));

    const canAssign = job.status === "created" || job.status === "assigned";
    const closed = job.status === "delivered" || job.status === "cancelled";

    return (
        <li className="p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-medium truncate">
                        {job.reference ? `${job.reference} · ` : ""}{job.customer_name}
                    </p>
                    <p className="text-xs text-ash">{job.pickup_address} → {job.dropoff_address}</p>
                    {job.description && <p className="text-xs text-ash">{job.description}</p>}
                    <p className="text-xs text-ash mt-1">{formatDateTime(job.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-line/40">{t(`delivery.business.status_${job.status}`)}</span>
                    <p className="price mt-2">{formatMoney(job.fee_amount)}</p>
                    {job.status !== "cancelled" && (
                        <p className={`text-xs ${job.fee_collected ? "text-teal" : "text-ash"}`}>
                            {job.fee_collected ? t("delivery.business.feeCollected") : t("delivery.business.feePending")}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
                {canAssign && (
                    <select aria-label={t("delivery.business.assignTo")} disabled={busy}
                        className="border border-line rounded-md px-2 py-1.5 text-xs text-ink bg-transparent focus-ring"
                        value={job.assigned_agent_id || ""} onChange={(e) => assign(e.target.value)}>
                        <option value="">{t("delivery.business.unassigned")}</option>
                        {roster.map((a) => <option key={a.agent_id} value={a.agent_id}>{riderName(a)}</option>)}
                    </select>
                )}
                {!canAssign && job.agent_first_name && (
                    <span className="text-xs text-ash">{`${job.agent_first_name} ${job.agent_last_name || ""}`.trim()}</span>
                )}
                {job.status === "assigned" && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus("picked_up")}>
                        {t("delivery.business.markPickedUp")}
                    </Button>
                )}
                {job.status === "picked_up" && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus("delivered")}>
                        {t("delivery.business.markDelivered")}
                    </Button>
                )}
                {!closed && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus("cancelled")}>
                        {t("delivery.business.cancelJob")}
                    </Button>
                )}
                {job.status !== "cancelled" && (
                    job.fee_collected ? (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCollected(false)}>
                            {t("delivery.business.undoCollected")}
                        </Button>
                    ) : (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setCollected(true)}>
                            {t("delivery.business.markCollected")}
                        </Button>
                    )
                )}
            </div>
        </li>
    );
}

function JobsTab({ refreshSignal, onChanged }) {
    const { t } = useLanguage();
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [roster, setRoster] = useState([]);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setError("");
        api.get("/delivery-business/jobs", { params: { status: status || undefined, page, limit: PAGE_SIZE } })
            .then(({ data: res }) => setData(res.data))
            .catch((err) => setError(extractErrorMessage(err)));
    }, [status, page]);
    useEffect(load, [load, refreshSignal]);

    useEffect(() => {
        api.get("/delivery-business/roster").then(({ data: res }) => setRoster(res.data)).catch(() => setRoster([]));
    }, [refreshSignal]);

    const changed = () => { load(); onChanged(); };
    const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    if (error) return <ErrorState title={t("delivery.business.loadError")} hint={error} onRetry={load} />;

    return (
        <div>
            <p className="text-xs text-ash mb-4">{t("delivery.business.jobsHint")}</p>
            <NewJobForm onCreated={changed} />

            <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-display text-lg">{t("delivery.business.jobsTitle")}</h3>
                <select className="border border-line rounded-md px-3 py-2 text-sm text-ink bg-transparent focus-ring"
                    value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                    <option value="">{t("delivery.business.allStatuses")}</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{t(`delivery.business.status_${s}`)}</option>)}
                </select>
            </div>
            {roster.length === 0 && <p className="text-xs text-ash mb-3">{t("delivery.business.needRoster")}</p>}

            {!data ? (
                <Skeleton className="h-40 w-full" />
            ) : data.items.length === 0 ? (
                <EmptyState title={t("delivery.business.noJobs")} />
            ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {data.items.map((job) => <JobCard key={job.id} job={job} roster={roster} onChanged={changed} />)}
                </ul>
            )}

            {pages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("delivery.business.prev")}</Button>
                    <span className="text-ash">{t("delivery.business.pageOf", { page, pages })}</span>
                    <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("delivery.business.next")}</Button>
                </div>
            )}
        </div>
    );
}

// ------------------------------------------------------------------ Page

export default function DeliveryBusiness() {
    const { t } = useLanguage();
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get("tab");
    const tab = TABS.includes(requested) ? requested : "overview";

    // undefined = still loading, null = no business yet.
    const [business, setBusiness] = useState(undefined);
    const [error, setError] = useState("");
    const [refreshSignal, setRefreshSignal] = useState(0);
    const bump = useCallback(() => setRefreshSignal((n) => n + 1), []);

    const loadBusiness = useCallback(() => {
        setError("");
        api.get("/delivery-business/me")
            .then(({ data }) => setBusiness(data.data))
            .catch((err) => setError(extractErrorMessage(err)));
    }, []);
    useEffect(loadBusiness, [loadBusiness]);

    const tabLabels = {
        overview: t("delivery.business.tabOverview"),
        roster: t("delivery.business.tabRoster"),
        jobs: t("delivery.business.tabJobs")
    };

    // DeliveryLayout already renders the page <h1>; this is an <h2>.
    const header = (
        <>
            <PageMeta title={t("delivery.business.title")} noIndex />
            <h2 className="font-display text-2xl mb-1">{business ? business.name : t("delivery.business.title")}</h2>
            <p className="text-ash text-sm mb-6">{t("delivery.business.subtitle")}</p>
        </>
    );

    if (error) return <div>{header}<ErrorState title={t("delivery.business.loadError")} hint={error} onRetry={loadBusiness} /></div>;
    if (business === undefined) return <div>{header}<Skeleton className="h-40 w-full" /></div>;
    if (business === null) return <div>{header}<SetupForm onCreated={setBusiness} /></div>;

    return (
        <div className="animate-fade-in">
            {header}
            <div className="flex gap-1 border-b border-line mb-6 overflow-x-auto" role="tablist">
                {TABS.map((key) => (
                    <button key={key} type="button" role="tab" aria-selected={tab === key}
                        onClick={() => setSearchParams(key === "overview" ? {} : { tab: key }, { replace: true })}
                        className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                            tab === key ? "border-ink text-ink font-medium" : "border-transparent text-ash hover:text-ink"
                        }`}>
                        {tabLabels[key]}
                    </button>
                ))}
            </div>

            {tab === "overview" && <OverviewTab refreshSignal={refreshSignal} />}
            {tab === "roster" && <RosterTab onChanged={bump} />}
            {tab === "jobs" && <JobsTab refreshSignal={refreshSignal} onChanged={bump} />}
        </div>
    );
}
