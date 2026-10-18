import { useCallback, useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../context/ToastContext";
import { useLanguage } from "../../context/LanguageContext";

const FIELD_CLASS = "w-full border border-line rounded-md px-3 py-2 text-sm focus-ring";
const LABEL_CLASS = "block text-xs text-ash mb-1";
const VEHICLES = ["boda", "bajaj", "car"];
const EMPTY_WINDOW = { region: "Dar es Salaam", label: "", start_hour: "7", end_hour: "10", multiplier: "1.4", buffer_minutes: "5", is_active: true };

const toLocalInput = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function Section({ title, help, children }) {
    return (
        <section className="border border-line rounded-lg p-4 mb-6 space-y-3">
            <div>
                <h2 className="font-display text-lg mb-1">{title}</h2>
                {help && <p className="text-ash text-xs">{help}</p>}
            </div>
            {children}
        </section>
    );
}

function Field({ id, label, children }) {
    return (
        <div>
            <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
            {children}
        </div>
    );
}

export default function AdminDeliveryRates() {
    const { t } = useLanguage();
    const toast = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [preview, setPreview] = useState({ distance_km: "7", vehicle: "boda" });
    const [previewResult, setPreviewResult] = useState(null);

    const [card, setCard] = useState({ vehicle_type: "boda", fuel_product: "petrol", min_fee: "", per_km_rate: "", effective_from: toLocalInput(new Date()) });
    const [fuel, setFuel] = useState({ region: "Dar es Salaam", product: "petrol", cap_price: "", effective_from: toLocalInput(new Date()) });
    const [settings, setSettings] = useState(null);
    const [windowForm, setWindowForm] = useState(EMPTY_WINDOW);
    const [editingWindowId, setEditingWindowId] = useState(null);

    const load = useCallback(() => {
        return api.get("/admin/delivery-rates")
            .then(({ data: res }) => {
                setData(res.data);
                setSettings((prev) => prev || {
                    fuel_passthrough_pct: String(res.data.settings.fuelPassThroughPct),
                    fuel_baseline_cap: String(res.data.settings.fuelBaselineCap),
                    fuel_max_monthly_change_pct: String(res.data.settings.fuelMaxMonthlyChangePct),
                    default_delivery_vehicle: res.data.settings.defaultVehicle,
                    delivery_handling_buffer_minutes: String(res.data.settings.handlingBufferMinutes),
                    delivery_default_region: res.data.settings.defaultRegion
                });
            })
            .catch((err) => toast?.error(extractErrorMessage(err)));
    }, [toast]);

    useEffect(() => {
        load().finally(() => setLoading(false));
    }, [load]);

    const runPreview = useCallback(() => {
        if (!(Number(preview.distance_km) > 0)) return;
        api.get("/admin/delivery-rates/preview", { params: { distance_km: preview.distance_km, vehicle: preview.vehicle } })
            .then(({ data: res }) => setPreviewResult(res.data))
            .catch(() => setPreviewResult(null));
    }, [preview.distance_km, preview.vehicle]);

    useEffect(() => {
        runPreview();
    }, [runPreview, data]);

    const submit = (request, doneKey, after) => async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const res = await request();
            toast?.success(t(doneKey));
            after?.(res);
            await load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const saveCard = submit(
        () => api.post("/admin/delivery-rates/cards", { ...card, effective_from: new Date(card.effective_from).toISOString() }),
        "admin.rates.cardSaved",
        () => setCard((c) => ({ ...c, min_fee: "", per_km_rate: "" }))
    );

    const saveFuel = submit(
        () => api.post("/admin/delivery-rates/fuel", { ...fuel, effective_from: new Date(fuel.effective_from).toISOString() }),
        "admin.rates.fuelSaved",
        (res) => {
            if (res?.data?.data?.limited) {
                toast?.error(t("admin.rates.fuelLimited", { cap: formatMoney(res.data.data.appliedCap) }));
            }
            setFuel((f) => ({ ...f, cap_price: "" }));
        }
    );

    const saveSettings = submit(
        () => api.put("/admin/delivery-rates/settings", settings),
        "admin.rates.settingsSaved",
        () => setSettings(null)
    );

    const saveWindow = submit(
        () => (editingWindowId
            ? api.put(`/admin/delivery-rates/eta/${editingWindowId}`, windowForm)
            : api.post("/admin/delivery-rates/eta", windowForm)),
        "admin.rates.windowSaved",
        () => { setWindowForm(EMPTY_WINDOW); setEditingWindowId(null); }
    );

    const removeWindow = async (id) => {
        if (!window.confirm(t("admin.rates.windowDeleteConfirm"))) return;
        try {
            await api.delete(`/admin/delivery-rates/eta/${id}`);
            toast?.success(t("admin.rates.windowDeleted"));
            await load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        }
    };

    const startEditWindow = (row) => {
        setEditingWindowId(row.id);
        setWindowForm({
            region: row.region, label: row.label || "", start_hour: String(row.start_hour), end_hour: String(row.end_hour),
            multiplier: String(row.multiplier), buffer_minutes: String(row.buffer_minutes), is_active: Boolean(row.is_active)
        });
    };

    if (loading || !data || !settings) return <PageLoader />;

    const vehicleLabel = (v) => t(`admin.rates.vehicle.${v}`);
    const fuelNow = data.currentFuel;

    return (
        <div>
            <PageMeta title={t("admin.rates.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("admin.rates.title")}</h1>
            <p className="text-ash text-sm mb-6">{t("admin.rates.intro")}</p>

            <Section title={t("admin.rates.preview.title")} help={t("admin.rates.preview.help")}>
                <div className="grid gap-3 sm:grid-cols-3">
                    <Field id="pv-km" label={t("admin.rates.preview.distance")}>
                        <input id="pv-km" type="number" min="0.5" max="200" step="0.5" inputMode="decimal" value={preview.distance_km}
                            onChange={(e) => setPreview({ ...preview, distance_km: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="pv-vehicle" label={t("admin.rates.vehicleLabel")}>
                        <select id="pv-vehicle" value={preview.vehicle} onChange={(e) => setPreview({ ...preview, vehicle: e.target.value })} className={FIELD_CLASS}>
                            {VEHICLES.map((v) => <option key={v} value={v}>{vehicleLabel(v)}</option>)}
                        </select>
                    </Field>
                </div>
                {previewResult && (
                    <div className="rounded-md bg-teal/10 text-teal px-3 py-2 text-sm">
                        <p className="font-medium">
                            {t("admin.rates.preview.result", {
                                km: previewResult.distanceKm,
                                vehicle: vehicleLabel(preview.vehicle),
                                fee: formatMoney(previewResult.fee)
                            })}
                        </p>
                        <p className="text-xs mt-0.5">
                            {previewResult.method === "rate_card"
                                ? t("admin.rates.preview.rateCard", { factor: previewResult.fuel?.factor ?? 1 })
                                : t("admin.rates.preview.bands")}
                        </p>
                    </div>
                )}
                <p className="text-ash text-xs">{t("admin.rates.preview.riderPayNote")}</p>
            </Section>

            <Section title={t("admin.rates.cards.title")} help={t("admin.rates.cards.help")}>
                <div className="grid gap-3 sm:grid-cols-3">
                    {data.currentCards.map((c) => (
                        <div key={c.id} className="border border-line rounded-md p-3 text-sm">
                            <p className="font-medium">{vehicleLabel(c.vehicle_type)}</p>
                            <p className="text-ash text-xs">{t("admin.rates.cards.current", { min: formatMoney(c.min_fee), perKm: formatMoney(c.per_km_rate) })}</p>
                            <p className="text-ash text-xs">{t("admin.rates.cards.since", { date: formatDate(c.effective_from) })}</p>
                        </div>
                    ))}
                </div>
                <form onSubmit={saveCard} className="grid gap-3 sm:grid-cols-5 items-end">
                    <Field id="rc-vehicle" label={t("admin.rates.vehicleLabel")}>
                        <select id="rc-vehicle" value={card.vehicle_type} onChange={(e) => setCard({ ...card, vehicle_type: e.target.value })} className={FIELD_CLASS}>
                            {VEHICLES.map((v) => <option key={v} value={v}>{vehicleLabel(v)}</option>)}
                        </select>
                    </Field>
                    <Field id="rc-min" label={t("admin.rates.cards.minFee")}>
                        <input id="rc-min" type="number" min="0" step="100" inputMode="numeric" required value={card.min_fee}
                            onChange={(e) => setCard({ ...card, min_fee: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="rc-km" label={t("admin.rates.cards.perKm")}>
                        <input id="rc-km" type="number" min="0" step="50" inputMode="numeric" required value={card.per_km_rate}
                            onChange={(e) => setCard({ ...card, per_km_rate: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="rc-from" label={t("admin.rates.effectiveFrom")}>
                        <input id="rc-from" type="datetime-local" required value={card.effective_from}
                            onChange={(e) => setCard({ ...card, effective_from: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Button size="sm" type="submit" disabled={busy}>{t("admin.rates.cards.save")}</Button>
                </form>
                {data.cards.length === 0 ? <EmptyState title={t("admin.rates.cards.empty")} /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-ash">
                                <th className="py-1 pr-3">{t("admin.rates.vehicleLabel")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.cards.minFee")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.cards.perKm")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.effectiveFrom")}</th>
                                <th className="py-1">{t("admin.rates.by")}</th>
                            </tr></thead>
                            <tbody>
                                {data.cards.map((c) => (
                                    <tr key={c.id} className="border-t border-line">
                                        <td className="py-1 pr-3">{vehicleLabel(c.vehicle_type)}</td>
                                        <td className="py-1 pr-3">{formatMoney(c.min_fee)}</td>
                                        <td className="py-1 pr-3">{formatMoney(c.per_km_rate)}</td>
                                        <td className="py-1 pr-3">{formatDate(c.effective_from)}</td>
                                        <td className="py-1">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            <Section title={t("admin.rates.fuel.title")} help={t("admin.rates.fuel.help")}>
                <p className="text-sm">
                    {fuelNow?.cap != null
                        ? t("admin.rates.fuel.now", { region: fuelNow.region, cap: formatMoney(fuelNow.cap), factor: fuelNow.factor })
                        : t("admin.rates.fuel.none")}
                </p>
                {fuelNow?.limited && <p className="text-xs text-coral">{t("admin.rates.fuel.limitedNote", { entered: formatMoney(fuelNow.enteredCap) })}</p>}
                <form onSubmit={saveFuel} className="grid gap-3 sm:grid-cols-5 items-end">
                    <Field id="fu-region" label={t("admin.rates.fuel.region")}>
                        <input id="fu-region" required value={fuel.region} onChange={(e) => setFuel({ ...fuel, region: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="fu-product" label={t("admin.rates.fuel.product")}>
                        <select id="fu-product" value={fuel.product} onChange={(e) => setFuel({ ...fuel, product: e.target.value })} className={FIELD_CLASS}>
                            <option value="petrol">{t("admin.rates.fuel.petrol")}</option>
                            <option value="diesel">{t("admin.rates.fuel.diesel")}</option>
                        </select>
                    </Field>
                    <Field id="fu-cap" label={t("admin.rates.fuel.cap")}>
                        <input id="fu-cap" type="number" min="1" step="1" inputMode="numeric" required value={fuel.cap_price}
                            onChange={(e) => setFuel({ ...fuel, cap_price: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="fu-from" label={t("admin.rates.effectiveFrom")}>
                        <input id="fu-from" type="datetime-local" required value={fuel.effective_from}
                            onChange={(e) => setFuel({ ...fuel, effective_from: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Button size="sm" type="submit" disabled={busy}>{t("admin.rates.fuel.save")}</Button>
                </form>
                {data.fuel.length === 0 ? <EmptyState title={t("admin.rates.fuel.empty")} /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-ash">
                                <th className="py-1 pr-3">{t("admin.rates.fuel.region")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.fuel.product")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.fuel.cap")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.effectiveFrom")}</th>
                                <th className="py-1">{t("admin.rates.by")}</th>
                            </tr></thead>
                            <tbody>
                                {data.fuel.map((f) => (
                                    <tr key={f.id} className="border-t border-line">
                                        <td className="py-1 pr-3">{f.region}</td>
                                        <td className="py-1 pr-3">{t(`admin.rates.fuel.${f.product}`)}</td>
                                        <td className="py-1 pr-3">{formatMoney(f.cap_price)}</td>
                                        <td className="py-1 pr-3">{formatDate(f.effective_from)}</td>
                                        <td className="py-1">{[f.first_name, f.last_name].filter(Boolean).join(" ") || "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <form onSubmit={saveSettings} className="border-t border-line pt-3 space-y-3">
                    <h3 className="text-sm font-medium">{t("admin.rates.settings.title")}</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Field id="st-pass" label={t("admin.rates.settings.passThrough")}>
                            <input id="st-pass" type="number" min="0" max="100" step="1" inputMode="numeric" value={settings.fuel_passthrough_pct}
                                onChange={(e) => setSettings({ ...settings, fuel_passthrough_pct: e.target.value })} className={FIELD_CLASS} />
                        </Field>
                        <Field id="st-base" label={t("admin.rates.settings.baseline")}>
                            <input id="st-base" type="number" min="1" step="1" inputMode="numeric" value={settings.fuel_baseline_cap}
                                onChange={(e) => setSettings({ ...settings, fuel_baseline_cap: e.target.value })} className={FIELD_CLASS} />
                        </Field>
                        <Field id="st-max" label={t("admin.rates.settings.maxChange")}>
                            <input id="st-max" type="number" min="0" max="100" step="1" inputMode="numeric" value={settings.fuel_max_monthly_change_pct}
                                onChange={(e) => setSettings({ ...settings, fuel_max_monthly_change_pct: e.target.value })} className={FIELD_CLASS} />
                        </Field>
                        <Field id="st-vehicle" label={t("admin.rates.settings.defaultVehicle")}>
                            <select id="st-vehicle" value={settings.default_delivery_vehicle}
                                onChange={(e) => setSettings({ ...settings, default_delivery_vehicle: e.target.value })} className={FIELD_CLASS}>
                                {VEHICLES.map((v) => <option key={v} value={v}>{vehicleLabel(v)}</option>)}
                            </select>
                        </Field>
                        <Field id="st-region" label={t("admin.rates.settings.defaultRegion")}>
                            <input id="st-region" value={settings.delivery_default_region}
                                onChange={(e) => setSettings({ ...settings, delivery_default_region: e.target.value })} className={FIELD_CLASS} />
                        </Field>
                        <Field id="st-handling" label={t("admin.rates.settings.handling")}>
                            <input id="st-handling" type="number" min="0" max="240" step="1" inputMode="numeric" value={settings.delivery_handling_buffer_minutes}
                                onChange={(e) => setSettings({ ...settings, delivery_handling_buffer_minutes: e.target.value })} className={FIELD_CLASS} />
                        </Field>
                    </div>
                    <Button size="sm" type="submit" disabled={busy}>{t("admin.rates.settings.save")}</Button>
                </form>
            </Section>

            <Section title={t("admin.rates.eta.title")} help={t("admin.rates.eta.help")}>
                {data.adjustments.length === 0 ? <EmptyState title={t("admin.rates.eta.empty")} /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-ash">
                                <th className="py-1 pr-3">{t("admin.rates.fuel.region")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.eta.label")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.eta.hours")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.eta.multiplier")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.eta.buffer")}</th>
                                <th className="py-1 pr-3">{t("admin.rates.eta.active")}</th>
                                <th className="py-1" />
                            </tr></thead>
                            <tbody>
                                {data.adjustments.map((row) => (
                                    <tr key={row.id} className="border-t border-line">
                                        <td className="py-1 pr-3">{row.region}</td>
                                        <td className="py-1 pr-3">{row.label || "-"}</td>
                                        <td className="py-1 pr-3">{row.start_hour}:00 - {row.end_hour}:00</td>
                                        <td className="py-1 pr-3">x{Number(row.multiplier)}</td>
                                        <td className="py-1 pr-3">+{row.buffer_minutes} min</td>
                                        <td className="py-1 pr-3">{row.is_active ? t("admin.rates.eta.yes") : t("admin.rates.eta.no")}</td>
                                        <td className="py-1 whitespace-nowrap">
                                            <button type="button" className="text-teal text-xs mr-3 focus-ring" onClick={() => startEditWindow(row)}>{t("admin.rates.eta.edit")}</button>
                                            <button type="button" className="text-coral text-xs focus-ring" onClick={() => removeWindow(row.id)}>{t("admin.rates.eta.delete")}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <form onSubmit={saveWindow} className="grid gap-3 sm:grid-cols-6 items-end">
                    <Field id="w-region" label={t("admin.rates.fuel.region")}>
                        <input id="w-region" required value={windowForm.region} onChange={(e) => setWindowForm({ ...windowForm, region: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="w-label" label={t("admin.rates.eta.label")}>
                        <input id="w-label" maxLength={60} value={windowForm.label} onChange={(e) => setWindowForm({ ...windowForm, label: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="w-start" label={t("admin.rates.eta.startHour")}>
                        <input id="w-start" type="number" min="0" max="24" required inputMode="numeric" value={windowForm.start_hour}
                            onChange={(e) => setWindowForm({ ...windowForm, start_hour: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="w-end" label={t("admin.rates.eta.endHour")}>
                        <input id="w-end" type="number" min="0" max="24" required inputMode="numeric" value={windowForm.end_hour}
                            onChange={(e) => setWindowForm({ ...windowForm, end_hour: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="w-mult" label={t("admin.rates.eta.multiplier")}>
                        <input id="w-mult" type="number" min="0.5" max="5" step="0.05" required inputMode="decimal" value={windowForm.multiplier}
                            onChange={(e) => setWindowForm({ ...windowForm, multiplier: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <Field id="w-buffer" label={t("admin.rates.eta.buffer")}>
                        <input id="w-buffer" type="number" min="0" max="240" inputMode="numeric" value={windowForm.buffer_minutes}
                            onChange={(e) => setWindowForm({ ...windowForm, buffer_minutes: e.target.value })} className={FIELD_CLASS} />
                    </Field>
                    <label className="flex items-center gap-2 text-xs text-ash sm:col-span-3">
                        <input type="checkbox" checked={windowForm.is_active} onChange={(e) => setWindowForm({ ...windowForm, is_active: e.target.checked })} />
                        {t("admin.rates.eta.active")}
                    </label>
                    <div className="sm:col-span-3 flex gap-2">
                        <Button size="sm" type="submit" disabled={busy}>{editingWindowId ? t("admin.rates.eta.update") : t("admin.rates.eta.add")}</Button>
                        {editingWindowId && (
                            <Button size="sm" variant="secondary" type="button" onClick={() => { setEditingWindowId(null); setWindowForm(EMPTY_WINDOW); }}>
                                {t("admin.rates.eta.cancel")}
                            </Button>
                        )}
                    </div>
                </form>
            </Section>
        </div>
    );
}
