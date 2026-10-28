import { useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { downloadImportTemplate, downloadStockCsv, importStockItems, newRequestId } from "../../../api/stock";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { daysAgoDar, todayDar } from "../../../utils/darDate";

const EXPORTS = ["sales", "purchases", "movements", "items", "valuation"];
const RANGED = new Set(["sales", "purchases", "movements"]);
const ACTION_TONE = { create: "text-teal", update: "text-azure", error: "text-coral" };

// Import items / opening stock (preview first) and export your records as CSV. Exports keep
// working after a plan ends, during the grace period.
export default function StockImportExport() {
    const { t, language } = useLanguage();
    const toast = useToast();
    const { access } = useOutletContext() || {};
    const readOnly = !!access?.read_only;
    const costOk = !!access?.features?.stock_cost_reports;

    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const keyRef = useRef(newRequestId());
    const fileRef = useRef(null);

    const [range, setRange] = useState({ from: daysAgoDar(29), to: todayDar() });
    const [exporting, setExporting] = useState("");

    const choose = (e) => {
        setFile(e.target.files?.[0] || null);
        setPreview(null); setResult(null); setError("");
        keyRef.current = newRequestId();
    };

    const runPreview = async () => {
        if (!file) { setError(t("stock.p8.io.chooseFile")); return; }
        setBusy(true); setError(""); setResult(null);
        try { setPreview(await importStockItems(file, { dryRun: true })); } catch (err) { setPreview(null); setError(extractErrorMessage(err)); } finally { setBusy(false); }
    };

    const apply = async () => {
        setBusy(true); setError("");
        try {
            const res = await importStockItems(file, { dryRun: false, idempotencyKey: keyRef.current });
            setResult(res); setPreview(null); setFile(null);
            if (fileRef.current) fileRef.current.value = "";
            toast?.success(t("stock.p8.io.done", { created: res.summary.created, updated: res.summary.updated }));
        } catch (err) { setError(extractErrorMessage(err)); } finally { setBusy(false); }
    };

    const exportKind = async (kind) => {
        setExporting(kind);
        try { await downloadStockCsv(kind, RANGED.has(kind) ? range : undefined); } catch (err) { toast?.error(await readBlobError(err)); } finally { setExporting(""); }
    };

    return (
        <div className="grid lg:grid-cols-2 gap-6">
            <section className="border border-line rounded-lg p-4 space-y-3 self-start" aria-labelledby="io-import">
                <h2 id="io-import" className="font-display text-lg">{t("stock.p8.io.importTitle")}</h2>
                <p className="text-sm text-ash">{t("stock.p8.io.importHelp")}</p>
                <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => downloadImportTemplate(language === "sw" ? "sw" : "en").catch((err) => toast?.error(extractErrorMessage(err)))}>{t("stock.p8.io.template")}</Button>
                {readOnly ? <p className="text-sm text-coral">{t("stock.p8.io.readOnly")}</p> : (
                    <>
                        <label className="text-xs text-ash flex flex-col gap-1">{t("stock.p8.io.file")}
                            <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose}
                                className="text-sm min-h-[44px] file:mr-3 file:min-h-[44px] file:px-3 file:border file:border-line file:rounded-md file:bg-paper" /></label>
                        <Button type="button" className="min-h-[44px]" onClick={runPreview} disabled={busy || !file}>{busy && !preview ? t("stock.saving") : t("stock.p8.io.preview")}</Button>
                    </>
                )}
                <div aria-live="polite">{error && <p className="text-coral text-sm" role="alert">{error}</p>}</div>

                {preview && (
                    <div>
                        <p className="text-sm font-medium">{t("stock.p8.io.summary", { create: preview.summary.create, update: preview.summary.update, error: preview.summary.error })}</p>
                        {preview.limit_warning && <p className="text-xs text-mango-dark mt-1" role="note">{t("stock.p8.io.limitWarning", { max: preview.limit_warning.max_items, count: preview.limit_warning.would_have })}</p>}
                        {preview.ignored_columns.length > 0 && <p className="text-xs text-ash mt-1">{t("stock.p8.io.ignored", { columns: preview.ignored_columns.join(", ") })}</p>}
                        <div className="overflow-x-auto mt-2 max-h-80 overflow-y-auto border border-line rounded-lg">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-paper"><tr className="text-left text-ash"><th className="p-2">{t("stock.p8.io.row")}</th><th className="p-2">{t("stock.p8.io.action")}</th><th className="p-2">{t("stock.p8.rep.item")}</th><th className="p-2">{t("stock.p8.io.notes")}</th></tr></thead>
                                <tbody>{preview.rows.map((r) => (
                                    <tr key={r.row} className="border-t border-line align-top">
                                        <td className="p-2">{r.row}</td>
                                        <td className={`p-2 font-medium ${ACTION_TONE[r.action]}`}>{t(`stock.p8.io.act.${r.action}`)}</td>
                                        <td className="p-2">{r.data.name || "-"}</td>
                                        <td className="p-2">{[...r.errors.map((e) => e.message), ...r.warnings].join(" ")}</td>
                                    </tr>))}</tbody>
                            </table>
                        </div>
                        {preview.rows_truncated && <p className="text-xs text-ash mt-1">{t("stock.p8.io.truncated")}</p>}
                        <Button type="button" className="min-h-[44px] mt-3 w-full" onClick={apply} disabled={busy || preview.summary.create + preview.summary.update === 0}>
                            {busy ? t("stock.saving") : t("stock.p8.io.apply", { count: preview.summary.create + preview.summary.update })}
                        </Button>
                        {preview.summary.error > 0 && <p className="text-xs text-ash mt-1">{t("stock.p8.io.skipNote")}</p>}
                    </div>
                )}

                {result && (
                    <div role="status">
                        <p className="text-sm font-medium text-teal">{t("stock.p8.io.done", { created: result.summary.created, updated: result.summary.updated })}</p>
                        {result.limit_warning && <p className="text-xs text-mango-dark">{t("stock.p8.io.limitWarning", { max: result.limit_warning.max_items, count: result.limit_warning.would_have })}</p>}
                        {result.rows.length > 0 && (
                            <ul className="text-xs text-coral mt-2 list-disc pl-4">{result.rows.map((r) => <li key={r.row}>{t("stock.p8.io.rowFailed", { row: r.row, message: (r.errors || []).map((e) => e.message).join(" ") })}</li>)}</ul>
                        )}
                    </div>
                )}
            </section>

            <section className="border border-line rounded-lg p-4 space-y-3 self-start" aria-labelledby="io-export">
                <h2 id="io-export" className="font-display text-lg">{t("stock.p8.io.exportTitle")}</h2>
                <p className="text-sm text-ash">{t("stock.p8.io.exportHelp")}</p>
                <div className="flex flex-wrap gap-3">
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.p8.from")}
                        <Input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} className="min-h-[44px]" /></label>
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.p8.to")}
                        <Input type="date" value={range.to} min={range.from} max={todayDar()} onChange={(e) => setRange({ ...range, to: e.target.value })} className="min-h-[44px]" /></label>
                </div>
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {EXPORTS.map((k) => (
                        <li key={k} className="p-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm">{t(`stock.p8.io.kind.${k}`)}<span className="block text-xs text-ash">{RANGED.has(k) ? t("stock.p8.io.inRange") : t("stock.p8.io.allActive")}</span></span>
                            <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" disabled={exporting === k || (k === "valuation" && !costOk)} onClick={() => exportKind(k)}>
                                {k === "valuation" && !costOk ? t("stock.p8.io.notInPlan") : exporting === k ? t("stock.saving") : t("stock.p8.io.download")}
                            </Button>
                        </li>))}
                </ul>
            </section>
        </div>
    );
}

// A failed blob download carries its JSON error as a Blob.
async function readBlobError(err) {
    try {
        const data = err?.response?.data;
        if (data instanceof Blob) return JSON.parse(await data.text()).message || extractErrorMessage(err);
    } catch { /* fall through */ }
    return extractErrorMessage(err);
}
