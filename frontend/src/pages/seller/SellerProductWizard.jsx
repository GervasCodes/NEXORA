import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import Button from "../../components/ui/Button";
import MediaSelectStep from "../../components/wizard/MediaSelectStep";
import PhotoEditor from "../../components/wizard/PhotoEditor";
import VideoEditor from "../../components/wizard/VideoEditor";
import DetailsStep from "../../components/wizard/DetailsStep";
import useObjectUrl from "../../components/wizard/useObjectUrl";
import { useLanguage } from "../../context/LanguageContext";
import { mediaReducer, initialMediaState, newClientId, kindOf, allUploaded, hasPhoto, defaultEdits } from "../../utils/mediaReducer";
import { checkMediaFile } from "../../utils/mediaLimits";
import { decodeImage } from "../../utils/photoEdit";
import { uploadPending, saveOrder } from "../../utils/mediaPipeline";
import { saveMediaDraft, loadMediaDraft, clearMediaDraft } from "../../utils/mediaDraftStore";

// Name given to a draft created before the seller has typed a name (the draft
// API needs 3+ characters). The details step starts empty in that case.
export const DRAFT_PLACEHOLDER_NAME = "Untitled product";

const emptyForm = {
    name: "", description: "", price: "", discount_price: "", stock: "", brand: "",
    product_condition: "new", category_id: "", is_preorder: false, preorder_lead_time_days: ""
};
const buildPayload = (form) => ({
    ...form,
    preorder_lead_time_days: form.preorder_lead_time_days === "" ? null : form.preorder_lead_time_days
});

function EditThumb({ item, active, onClick, n }) {
    const { t } = useLanguage();
    const url = useObjectUrl(item.file) || item.url;
    return (
        <button type="button" onClick={onClick} aria-pressed={active} aria-label={t("wizard.editItemN", { n })}
            className={`w-16 h-16 rounded-md overflow-hidden border-2 flex-shrink-0 focus-ring ${active ? "border-teal" : "border-line"}`}>
            {item.kind === "video"
                ? <video src={url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                : url && <img src={url} alt="" className="w-full h-full object-cover" />}
        </button>
    );
}

export default function SellerProductWizard() {
    const { t } = useLanguage();
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const draftKey = `wizard:${id || "new"}`;

    const [step, setStep] = useState(1);
    const [state, dispatch] = useReducer(mediaReducer, initialMediaState);
    const [form, setForm] = useState(emptyForm);
    const [categories, setCategories] = useState([]);
    const [productId, setProductId] = useState(isEdit ? id : null);
    const [isDraft, setIsDraft] = useState(!isEdit);
    // Stock figure loaded with the product (see SellerProductForm).
    const stockBaseline = useRef(null);
    const [selectedId, setSelectedId] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [restored, setRestored] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saveState, setSaveState] = useState("idle");
    const headingRef = useRef(null);
    const removedServerIds = useRef([]);
    const creating = useRef(null);
    const [ready, setReady] = useState(false);

    useEffect(() => { api.get("/categories").then(({ data }) => setCategories(data.data)).catch(() => {}); }, []);

    // Load: existing product (edit) or a restored unfinished draft.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (isEdit) {
                try {
                    const [{ data: p }, { data: m }] = await Promise.all([
                        api.get(`/products/mine/${id}`),
                        api.get(`/products/${id}/media`)
                    ]);
                    if (cancelled) return;
                    const prod = p.data;
                    setForm({
                        name: prod.name === DRAFT_PLACEHOLDER_NAME ? "" : prod.name || "",
                        description: prod.description || "", price: prod.price || "", discount_price: prod.discount_price || "",
                        stock: prod.stock ?? "", brand: prod.brand || "", product_condition: prod.product_condition || "new",
                        category_id: prod.category_id || "", is_preorder: Boolean(prod.is_preorder),
                        preorder_lead_time_days: prod.preorder_lead_time_days ?? ""
                    });
                    setIsDraft(Boolean(prod.is_draft));
                    stockBaseline.current = prod.is_draft || prod.stock === null || prod.stock === undefined ? null : Number(prod.stock);
                    const items = m.data.map((row) => ({
                        clientId: `s${row.id}`, kind: row.kind, url: row.kind === "video" ? row.url : row.url,
                        status: "done", serverId: row.id,
                        edits: row.edits && typeof row.edits === "object" ? { ...defaultEdits(row.kind), ...row.edits } : defaultEdits(row.kind)
                    }));
                    const cover = m.data.find((row) => row.is_cover);
                    dispatch({ type: "hydrate", items, coverId: cover ? `s${cover.id}` : null });
                } catch (err) {
                    if (!cancelled) setError(extractErrorMessage(err));
                }
            } else {
                const saved = await loadMediaDraft(draftKey);
                if (cancelled || !saved?.items?.length) { setReady(true); return; }
                dispatch({ type: "hydrate", items: saved.items.map((i) => ({ ...i, progress: i.status === "done" ? 100 : 0, error: null })), coverId: saved.coverId });
                if (saved.meta?.form) setForm(saved.meta.form);
                if (saved.meta?.productId) setProductId(saved.meta.productId);
                setRestored(true);
            }
            setReady(true);
        })();
        return () => { cancelled = true; };
    }, [id, isEdit, draftKey]);

    // Persist to IndexedDB (debounced) so a refresh or crash keeps the work.
    useEffect(() => {
        if (!ready || isEdit) return undefined;
        const timer = setTimeout(() => {
            if (state.items.length === 0) clearMediaDraft(draftKey);
            else saveMediaDraft(draftKey, state, { productId, form });
        }, 500);
        return () => clearTimeout(timer);
    }, [state, form, productId, isEdit, draftKey, ready]);

    const pendingCount = state.items.filter((i) => i.status !== "done").length;
    useEffect(() => {
        if (!dirty && pendingCount === 0) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty, pendingCount]);

    // Move focus to the step heading whenever the step changes.
    useEffect(() => { headingRef.current?.focus(); }, [step]);

    const ensureDraft = useCallback(async () => {
        if (productId) return productId;
        if (creating.current) return creating.current;
        creating.current = api.post("/products/draft", { name: form.name.trim().length >= 3 ? form.name.trim() : DRAFT_PLACEHOLDER_NAME })
            .then(({ data }) => { setProductId(data.data.productId); setIsDraft(true); return data.data.productId; })
            .finally(() => { creating.current = null; });
        return creating.current;
    }, [productId, form.name]);

    const onFiles = useCallback((files) => {
        setNotice("");
        const entries = [];
        const problems = [];
        for (const file of files) {
            const kind = kindOf(file);
            if (!kind) { problems.push(t("media.notImage", { name: file.name })); continue; }
            const problem = checkMediaFile(file, kind);
            // Photos are re-encoded on the device, so only an absurd original is refused.
            if (problem && (kind === "video" || file.size > 40 * 1024 * 1024)) { problems.push(t(problem.key, problem.params)); continue; }
            entries.push({ clientId: newClientId(), kind, file });
        }
        if (entries.length) {
            dispatch({ type: "add", entries });
            entries.filter((e) => e.kind === "image").forEach((e) => {
                decodeImage(e.file).then((b) => b.close?.()).catch(() => dispatch({ type: "markUndecodable", clientId: e.clientId }));
            });
        }
        if (state.items.length + entries.length > 0 && entries.length < files.length - problems.length) problems.push(t("wizard.someSkipped"));
        if (problems.length) setNotice(problems.join(" "));
        setRestored(false);
    }, [state.items.length, t]);

    const removeWithServer = useCallback((action) => {
        if (action.type === "remove") {
            const item = state.items.find((i) => i.clientId === action.clientId);
            if (item?.serverId) removedServerIds.current.push(item.serverId);
            if (item?.staleServerId) removedServerIds.current.push(item.staleServerId);
        }
        dispatch(action);
        setDirty(true);
    }, [state.items]);

    const goStep2 = async () => {
        setError("");
        setBusy(true);
        try {
            await ensureDraft();
            setSelectedId((cur) => cur || state.items[0]?.clientId || null);
            setStep(2);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const flushRemovals = async (pid) => {
        const ids = [...removedServerIds.current];
        removedServerIds.current = [];
        await Promise.all(ids.map((mid) => api.delete(`/products/${pid}/media/${mid}`).catch(() => {})));
    };

    const uploadAndContinue = async () => {
        setError("");
        setBusy(true);
        try {
            const pid = await ensureDraft();
            await flushRemovals(pid);
            const { failed, serverIds } = await uploadPending(pid, state.items, dispatch, t);
            if (failed > 0) { setError(t("wizard.someFailed", { count: failed })); return; }
            // The reducer state is one render behind; resolve ids from this run + earlier ones.
            const serverIdOf = (i) => serverIds.get(i.clientId) ?? i.serverId;
            await saveOrder(pid, state.items, state.coverId, serverIdOf);
            setStep(3);
        } catch (err) {
            setError(err?.response ? extractErrorMessage(err) : err.message);
        } finally {
            setBusy(false);
        }
    };

    // Autosave the details of a draft.
    useEffect(() => {
        if (step !== 3 || !productId || !isDraft || !dirty) return undefined;
        const timer = setTimeout(async () => {
            setSaveState("saving");
            try { await api.put(`/products/draft/${productId}`, buildPayload(form)); setSaveState("saved"); }
            catch { setSaveState("error"); }
        }, 1500);
        return () => clearTimeout(timer);
    }, [form, step, productId, isDraft, dirty]);

    const publish = async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            const pid = await ensureDraft();
            if (isDraft) await api.post(`/products/draft/${pid}/publish`, buildPayload(form));
            else await api.put(`/products/${pid}`, {
                ...buildPayload(form),
                ...(stockBaseline.current === null ? {} : { stock_baseline: stockBaseline.current })
            });
            setDirty(false);
            await clearMediaDraft(draftKey);
            navigate("/seller/products");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const stepLabels = [t("wizard.stepSelect"), t("wizard.stepEdit"), t("wizard.stepDetails")];
    const selected = state.items.find((i) => i.clientId === selectedId) || state.items[0];
    const uploading = state.items.some((i) => i.status === "uploading");

    return (
        <div className="max-w-3xl">
            <PageMeta title={t("seller.productForm.metaTitle")} noIndex />
            <h1 className="font-display text-2xl mb-4">{isEdit ? t("seller.productForm.editTitle") : t("seller.productForm.newTitle")}</h1>

            <ol className="flex gap-2 mb-6 text-sm" aria-label={t("wizard.steps")}>
                {stepLabels.map((label, i) => (
                    <li key={label} aria-current={step === i + 1 ? "step" : undefined}
                        className={`flex-1 rounded-md border px-3 py-2 min-h-[44px] flex items-center ${step === i + 1 ? "border-teal bg-teal/10 text-teal font-medium" : step > i + 1 ? "border-line text-ash" : "border-line text-ash opacity-70"}`}>
                        {i + 1}. {label}
                    </li>
                ))}
            </ol>

            {restored && <p role="status" className="text-sm text-teal mb-3">{t("wizard.restored")}</p>}
            {error && <p role="alert" className="text-coral text-sm mb-3">{error}</p>}

            <h2 ref={headingRef} tabIndex={-1} className="sr-only">{stepLabels[step - 1]}</h2>

            {step === 1 && (
                <>
                    <MediaSelectStep state={state} dispatch={removeWithServer} onFiles={onFiles} notice={notice}
                        onEdit={(cid) => { setSelectedId(cid); goStep2(); }} />
                    <div className="mt-6 flex items-center gap-3">
                        <Button type="button" onClick={goStep2} disabled={busy || state.items.length === 0}>{t("wizard.next")}</Button>
                        {state.items.length > 0 && !hasPhoto(state) && <span className="text-xs text-ash">{t("wizard.needPhoto")}</span>}
                    </div>
                </>
            )}

            {step === 2 && (
                <section aria-labelledby="wizard-edit-title">
                    <h2 id="wizard-edit-title" className="font-display text-xl mb-1">{t("wizard.step2Title")}</h2>
                    <p className="text-sm text-ash mb-4">{t("wizard.step2Hint")}</p>
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-4" role="group" aria-label={t("wizard.mediaList")}>
                        {state.items.map((item, i) => (
                            <EditThumb key={item.clientId} item={item} n={i + 1} active={selected?.clientId === item.clientId} onClick={() => setSelectedId(item.clientId)} />
                        ))}
                    </div>
                    {selected && selected.kind === "image" && (
                        <PhotoEditor key={selected.clientId} item={selected} onChange={(edits) => { dispatch({ type: "setEdits", clientId: selected.clientId, edits }); setDirty(true); }} onClose={() => {}} />
                    )}
                    {selected && selected.kind === "video" && (
                        <VideoEditor key={selected.clientId} item={selected} onChange={(edits) => { dispatch({ type: "setEdits", clientId: selected.clientId, edits }); setDirty(true); }} onClose={() => {}} />
                    )}

                    {state.items.some((i) => i.status !== "queued") && (
                        <ul className="mt-4 space-y-1" aria-label={t("wizard.uploadStatus")}>
                            {state.items.map((i, n) => (
                                <li key={i.clientId} className="text-sm flex items-center gap-2">
                                    <span className="w-24 text-ash">{i.kind === "video" ? t("wizard.video") : t("wizard.photo")} {n + 1}</span>
                                    {i.status === "uploading" && <span role="status">{i.progress}%</span>}
                                    {i.status === "done" && <span className="text-teal">✓ {t("wizard.uploaded")}</span>}
                                    {i.status === "error" && <span role="alert" className="text-coral">{i.error}</span>}
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-6 flex flex-wrap gap-3">
                        <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={busy || uploading}>{t("wizard.back")}</Button>
                        <Button type="button" onClick={uploadAndContinue} disabled={busy || uploading || state.items.length === 0}>
                            {busy || uploading ? t("wizard.uploading") : allUploaded(state) ? t("wizard.next") : t("wizard.uploadContinue")}
                        </Button>
                    </div>
                </section>
            )}

            {step === 3 && (
                <form onSubmit={publish}>
                    <DetailsStep form={form} setForm={setForm} categories={categories} onEdited={() => setDirty(true)} productId={productId} />
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <Button type="button" variant="secondary" onClick={() => setStep(2)} disabled={busy}>{t("wizard.back")}</Button>
                        <Button type="submit" disabled={busy}>{busy ? t("seller.productForm.publishing") : isEdit && !isDraft ? t("seller.productForm.saveChanges") : t("seller.productForm.publish")}</Button>
                        {saveState === "saving" && <span role="status" className="text-xs text-ash">{t("seller.productForm.savingDraft")}</span>}
                        {saveState === "saved" && <span role="status" className="text-xs text-ash">{t("seller.productForm.draftSaved")}</span>}
                        {saveState === "error" && <span role="alert" className="text-xs text-coral">{t("seller.productForm.saveDraftFailed")}</span>}
                    </div>
                </form>
            )}
        </div>
    );
}
