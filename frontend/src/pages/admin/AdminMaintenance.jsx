import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageLoader from "../../components/PageLoader";
import { formatDateTime } from "../../utils/format";

// Unified "Maintenance Management" screen. Departments and services keep
// their own dedicated admin pages (AdminCategories.jsx,
// AdminServiceCategories.jsx) for editing name/description/cover/order -
// this page is purely about the on/off switch, pulled together with the
// new platform-wide modules so an admin has one place to see everything
// that's currently taken offline.
//
// Departments additionally support a scheduled start/end window (see
// category.service.js#scheduleMaintenance) - services and modules stay
// instant-only, so only the departments section renders schedule fields
// and the "Departments under maintenance" dashboard panel above it.
// Departments and services now have three fully separate statuses
// (see migration 078): 'active' (live), 'maintenance' (still linked,
// shoppers see a maintenance page/message), and 'deactivated' (hidden
// completely - no listing, no maintenance page, not even reachable by
// direct link). Modules stay a plain on/off switch - there's no
// "hide the feature but still let people navigate to it" concept for
// those, so they keep the old two-state activate/deactivate pattern.
const SECTION_COPY = {
    departments: {
        title: "Departments",
        blurb: "Storefront departments shoppers browse from the homepage. Maintenance keeps the page reachable with a maintenance message; Deactivate hides the department completely.",
        activatePath: (item) => `/categories/${item.id}/activate`,
        maintenancePath: (item) => `/categories/${item.id}/maintenance`,
        deactivatePath: (item) => `/categories/${item.id}/deactivate`,
        schedulePath: (item) => `/categories/${item.id}/schedule-maintenance`,
        cancelSchedulePath: (item) => `/categories/${item.id}/cancel-scheduled-maintenance`,
        schedulable: true,
        hasStatus: true
    },
    services: {
        title: "Services",
        blurb: "Service categories under the Services department. Maintenance keeps the page reachable with a maintenance message; Deactivate hides the category completely.",
        activatePath: (item) => `/service-categories/${item.id}/activate`,
        maintenancePath: (item) => `/service-categories/${item.id}/maintenance`,
        deactivatePath: (item) => `/service-categories/${item.id}/deactivate`,
        hasStatus: true
    },
    modules: {
        title: "Modules",
        blurb: "Platform-wide features not tied to a single department. Turning one off blocks that feature everywhere it's used.",
        activatePath: (item) => `/admin/maintenance/modules/${item.key}/activate`,
        deactivatePath: (item) => `/admin/maintenance/modules/${item.key}/deactivate`
    }
};

function StatusBadge({ isActive, status }) {
    if (status === "deactivated") {
        return <span className="text-xs font-medium px-2 py-1 rounded-full bg-ash/10 text-ash">Deactivated</span>;
    }
    if (status === "maintenance") {
        return <span className="text-xs font-medium px-2 py-1 rounded-full bg-coral/10 text-coral">Under maintenance</span>;
    }
    return (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${isActive ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
            {isActive ? "Live" : "Under maintenance"}
        </span>
    );
}

// Simple confirm prompt for true deactivation - no message field, since
// nothing is ever shown to shoppers for a deactivated item.
function DeactivateConfirmPrompt({ open, onCancel, onConfirm, itemName }) {
    const [submitting, setSubmitting] = useState(false);

    if (!open) return null;

    const submit = async () => {
        setSubmitting(true);
        await onConfirm();
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-abyss/40 flex items-center justify-center z-50 px-4">
            <div className="bg-frost rounded-lg p-5 w-full max-w-sm">
                <h3 className="font-display text-lg mb-1">Deactivate "{itemName}"?</h3>
                <p className="text-xs text-ash mb-4">
                    This hides it completely - no listing, no maintenance page, not reachable by direct link either.
                    Use "Put into maintenance" instead if you just want to show a maintenance message.
                </p>
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="text-sm text-ash hover:text-ink px-3 py-2">
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={submitting}
                        className="bg-coral text-frost px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {submitting ? "Deactivating…" : "Deactivate"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Small note under a department's name showing its scheduled window, if
// any: either "goes into maintenance at ..." (still active, waiting on
// scheduled_start) or "restores automatically at ..." (already in
// maintenance, waiting on scheduled_end).
function ScheduleNote({ item }) {
    if (!item.maintenance_scheduled_start && !item.maintenance_scheduled_end) return null;

    if (item.is_active && item.maintenance_scheduled_start) {
        return (
            <p className="text-xs text-mango-dark">
                Scheduled to enter maintenance at {formatDateTime(item.maintenance_scheduled_start)}
                {item.maintenance_scheduled_end && ` until ${formatDateTime(item.maintenance_scheduled_end)}`}
            </p>
        );
    }

    if (!item.is_active && item.maintenance_scheduled_end) {
        return (
            <p className="text-xs text-teal">
                Restores automatically at {formatDateTime(item.maintenance_scheduled_end)}
            </p>
        );
    }

    return null;
}

function MessagePrompt({ open, onCancel, onConfirm, itemName }) {
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    if (!open) return null;

    const submit = async () => {
        setSubmitting(true);
        await onConfirm(message);
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-abyss/40 flex items-center justify-center z-50 px-4">
            <div className="bg-frost rounded-lg p-5 w-full max-w-sm">
                <h3 className="font-display text-lg mb-1">Put "{itemName}" into maintenance?</h3>
                <p className="text-xs text-ash mb-3">
                    Optionally leave a note for anyone who tries to access it. Shown on the maintenance page.
                </p>
                <textarea
                    autoFocus
                    rows={3}
                    maxLength={255}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. We're upgrading this section - back shortly."
                    className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring mb-4"
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="text-sm text-ash hover:text-ink px-3 py-2">
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={submitting}
                        className="bg-coral text-frost px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {submitting ? "Saving…" : "Deactivate"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Department-only prompt: same custom message field as MessagePrompt,
// plus optional start/end datetime pickers. Leaving both blank behaves
// exactly like the old instant "Deactivate" button (schedule-maintenance
// applies immediately when start_at is omitted - see
// category.repository.js#scheduleMaintenance); filling them in schedules
// a future window instead.
function DepartmentSchedulePrompt({ open, onCancel, onConfirm, itemName }) {
    const [message, setMessage] = useState("");
    const [startAt, setStartAt] = useState("");
    const [endAt, setEndAt] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [validationError, setValidationError] = useState("");

    if (!open) return null;

    const submit = async () => {
        if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
            setValidationError("End time must be after start time");
            return;
        }
        setValidationError("");
        setSubmitting(true);
        await onConfirm({
            message,
            start_at: startAt ? new Date(startAt).toISOString() : null,
            end_at: endAt ? new Date(endAt).toISOString() : null
        });
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-abyss/40 flex items-center justify-center z-50 px-4">
            <div className="bg-frost rounded-lg p-5 w-full max-w-sm">
                <h3 className="font-display text-lg mb-1">Put "{itemName}" into maintenance?</h3>
                <p className="text-xs text-ash mb-3">
                    Leave a note for anyone who tries to access it, and optionally schedule when maintenance
                    starts and ends. Shoppers get a toast the moment it enters or exits.
                </p>
                <textarea
                    autoFocus
                    rows={3}
                    maxLength={255}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. We're upgrading this department - back shortly."
                    className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring mb-3"
                />

                <div className="grid grid-cols-2 gap-2 mb-1">
                    <label className="block">
                        <span className="text-xs text-ash">Starts (optional)</span>
                        <input
                            type="datetime-local"
                            value={startAt}
                            onChange={(e) => setStartAt(e.target.value)}
                            className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring mt-0.5"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs text-ash">Ends (optional)</span>
                        <input
                            type="datetime-local"
                            value={endAt}
                            onChange={(e) => setEndAt(e.target.value)}
                            className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring mt-0.5"
                        />
                    </label>
                </div>
                <p className="text-[11px] text-ash mb-4">
                    Leave "Starts" blank to put it into maintenance immediately. Leave "Ends" blank to require a
                    manual reactivation.
                </p>

                {validationError && <p role="alert" className="text-coral text-xs mb-3">{validationError}</p>}

                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="text-sm text-ash hover:text-ink px-3 py-2">
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={submitting}
                        className="bg-coral text-frost px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {submitting ? "Saving…" : startAt ? "Schedule" : "Deactivate"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// "Dashboard" panel: every department currently under maintenance, at a
// glance, with a one-click instant reactivate - the thing an admin
// checking in on the site actually wants to see first, rather than
// scrolling the full department list below to spot which ones are off.
function DepartmentsUnderMaintenance({ departments, busyId, onActivate }) {
    const affected = departments.filter((d) => d.status === "maintenance");

    return (
        <div className="mb-10 glass-strong border border-coral/20 rounded-lg p-4">
            <h2 className="font-display text-lg mb-1">Departments under maintenance</h2>
            <p className="text-xs text-ash mb-3">
                {affected.length === 0
                    ? "Nothing right now - every department is live."
                    : `${affected.length} department${affected.length === 1 ? "" : "s"} currently unavailable to shoppers.`}
            </p>

            {affected.length > 0 && (
                <ul className="divide-y divide-line border-y border-line">
                    {affected.map((item) => (
                        <li key={item.id} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{item.name}</p>
                                {item.maintenance_message && (
                                    <p className="text-xs text-ash truncate">"{item.maintenance_message}"</p>
                                )}
                                <ScheduleNote item={item} />
                            </div>

                            <button
                                onClick={() => onActivate("departments", item)}
                                disabled={busyId === `departments-${item.id}`}
                                className="text-xs px-3 py-1.5 rounded-md border border-teal/40 text-teal hover:bg-teal/10 transition-colors disabled:opacity-50"
                            >
                                {busyId === `departments-${item.id}` ? "Working…" : "Reactivate now"}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function MaintenanceSection({ sectionKey, items, busyId, onActivate, onRequestMaintenance, onRequestDeactivate, onCancelSchedule }) {
    const copy = SECTION_COPY[sectionKey];

    return (
        <div className="mb-10">
            <h2 className="font-display text-lg mb-1">{copy.title}</h2>
            <p className="text-xs text-ash mb-3">{copy.blurb}</p>

            <ul className="divide-y divide-line border-y border-line">
                {items.map((item) => {
                    const id = item.key || item.id;
                    const showCancelSchedule = copy.schedulable && item.status === "active" && item.maintenance_scheduled_start;
                    const busy = busyId === `${sectionKey}-${id}`;

                    return (
                        <li key={id} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{item.name}</p>
                                {item.status === "maintenance" && item.maintenance_message && (
                                    <p className="text-xs text-ash truncate">"{item.maintenance_message}"</p>
                                )}
                                {sectionKey === "modules" && !item.is_active && item.maintenance_message && (
                                    <p className="text-xs text-ash truncate">"{item.maintenance_message}"</p>
                                )}
                                {sectionKey === "modules" && item.description && (
                                    <p className="text-xs text-ash truncate">{item.description}</p>
                                )}
                                {copy.schedulable && <ScheduleNote item={item} />}
                            </div>

                            <StatusBadge isActive={item.is_active} status={item.status} />

                            {showCancelSchedule && (
                                <button
                                    onClick={() => onCancelSchedule(sectionKey, item)}
                                    disabled={busy}
                                    className="text-xs px-3 py-1.5 rounded-md border border-line text-ash hover:text-ink transition-colors disabled:opacity-50"
                                >
                                    Cancel schedule
                                </button>
                            )}

                            {copy.hasStatus ? (
                                <>
                                    {item.status !== "active" && (
                                        <button
                                            onClick={() => onActivate(sectionKey, item)}
                                            disabled={busy}
                                            className="text-xs px-3 py-1.5 rounded-md border border-teal/40 text-teal hover:bg-teal/10 transition-colors disabled:opacity-50"
                                        >
                                            {busy ? "Working…" : "Activate"}
                                        </button>
                                    )}
                                    {item.status !== "maintenance" && (
                                        <button
                                            onClick={() => onRequestMaintenance(sectionKey, item)}
                                            disabled={busy}
                                            className="text-xs px-3 py-1.5 rounded-md border border-mango/40 text-mango-dark hover:bg-mango/10 transition-colors disabled:opacity-50"
                                        >
                                            {busy ? "Working…" : "Put into maintenance"}
                                        </button>
                                    )}
                                    {item.status !== "deactivated" && (
                                        <button
                                            onClick={() => onRequestDeactivate(sectionKey, item, true)}
                                            disabled={busy}
                                            className="text-xs px-3 py-1.5 rounded-md border border-coral/40 text-coral hover:bg-coral/10 transition-colors disabled:opacity-50"
                                        >
                                            {busy ? "Working…" : "Deactivate"}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={() => (item.is_active ? onRequestDeactivate(sectionKey, item, false) : onActivate(sectionKey, item))}
                                    disabled={busy}
                                    className={`text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
                                        item.is_active
                                            ? "border border-coral/40 text-coral hover:bg-coral/10"
                                            : "border border-teal/40 text-teal hover:bg-teal/10"
                                    }`}
                                >
                                    {busy ? "Working…" : item.is_active ? "Deactivate" : "Activate"}
                                </button>
                            )}
                        </li>
                    );
                })}
                {items.length === 0 && (
                    <li className="py-6 text-sm text-ash text-center">Nothing here yet.</li>
                )}
            </ul>
        </div>
    );
}

export default function AdminMaintenance() {
    const [overview, setOverview] = useState({ departments: [], services: [], modules: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [prompt, setPrompt] = useState(null); // { sectionKey, item, mode: "maintenance" | "deactivate" }

    const load = () => {
        api.get("/admin/maintenance/overview")
            .then(({ data }) => setOverview(data.data))
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const activate = async (sectionKey, item) => {
        const id = item.key || item.id;
        setBusyId(`${sectionKey}-${id}`);
        setError("");
        try {
            await api.put(SECTION_COPY[sectionKey].activatePath(item));
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    // Modules only (no separate "maintenance" concept for those - see
    // copy.hasStatus check in MaintenanceSection): toggles the single
    // on/off switch, optionally with a message.
    const deactivate = async (sectionKey, item, message) => {
        const id = item.key || item.id;
        setBusyId(`${sectionKey}-${id}`);
        setError("");
        try {
            await api.put(SECTION_COPY[sectionKey].deactivatePath(item), { message });
            setPrompt(null);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    // Departments/services only: puts the item into maintenance (still
    // linked, shoppers see a maintenance message) - distinct from
    // trueDeactivate below.
    const enterMaintenance = async (sectionKey, item, message) => {
        const id = item.id;
        setBusyId(`${sectionKey}-${id}`);
        setError("");
        try {
            await api.put(SECTION_COPY[sectionKey].maintenancePath(item), { message });
            setPrompt(null);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    // Departments/services only: hides the item completely.
    const trueDeactivate = async (sectionKey, item) => {
        const id = item.id;
        setBusyId(`${sectionKey}-${id}`);
        setError("");
        try {
            await api.put(SECTION_COPY[sectionKey].deactivatePath(item));
            setPrompt(null);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const scheduleDepartment = async (item, { message, start_at, end_at }) => {
        const id = item.id;
        setBusyId(`departments-${id}`);
        setError("");
        try {
            await api.put(SECTION_COPY.departments.schedulePath(item), { message, start_at, end_at });
            setPrompt(null);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const cancelSchedule = async (sectionKey, item) => {
        const id = item.id;
        setBusyId(`${sectionKey}-${id}`);
        setError("");
        try {
            await api.put(SECTION_COPY[sectionKey].cancelSchedulePath(item));
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Maintenance Management</h1>
            <p className="text-sm text-ash mb-6">
                Take a department, service, or platform module offline for maintenance. Anyone who tries to
                access it sees a maintenance page instead of an error - everything else on NEXORA keeps working.
                Shoppers get a live toast the moment a department enters or exits maintenance.
            </p>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <DepartmentsUnderMaintenance
                departments={overview.departments}
                busyId={busyId}
                onActivate={activate}
            />

            <MaintenanceSection
                sectionKey="departments"
                items={overview.departments}
                busyId={busyId}
                onActivate={activate}
                onRequestMaintenance={(sectionKey, item) => setPrompt({ sectionKey, item, mode: "maintenance" })}
                onRequestDeactivate={(sectionKey, item) => setPrompt({ sectionKey, item, mode: "deactivate" })}
                onCancelSchedule={cancelSchedule}
            />
            <MaintenanceSection
                sectionKey="services"
                items={overview.services}
                busyId={busyId}
                onActivate={activate}
                onRequestMaintenance={(sectionKey, item) => setPrompt({ sectionKey, item, mode: "maintenance" })}
                onRequestDeactivate={(sectionKey, item) => setPrompt({ sectionKey, item, mode: "deactivate" })}
                onCancelSchedule={cancelSchedule}
            />
            <MaintenanceSection
                sectionKey="modules"
                items={overview.modules}
                busyId={busyId}
                onActivate={activate}
                onRequestDeactivate={(sectionKey, item) => setPrompt({ sectionKey, item, mode: "maintenance" })}
                onCancelSchedule={cancelSchedule}
            />

            {prompt?.mode === "deactivate" ? (
                <DeactivateConfirmPrompt
                    open={!!prompt}
                    itemName={prompt?.item?.name}
                    onCancel={() => setPrompt(null)}
                    onConfirm={() => trueDeactivate(prompt.sectionKey, prompt.item)}
                />
            ) : prompt?.sectionKey === "departments" ? (
                <DepartmentSchedulePrompt
                    open={!!prompt}
                    itemName={prompt?.item?.name}
                    onCancel={() => setPrompt(null)}
                    onConfirm={(payload) => scheduleDepartment(prompt.item, payload)}
                />
            ) : (
                <MessagePrompt
                    open={!!prompt}
                    itemName={prompt?.item?.name}
                    onCancel={() => setPrompt(null)}
                    onConfirm={(message) => (
                        prompt.sectionKey === "modules"
                            ? deactivate(prompt.sectionKey, prompt.item, message)
                            : enterMaintenance(prompt.sectionKey, prompt.item, message)
                    )}
                />
            )}
        </div>
    );
}
