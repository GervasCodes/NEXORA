import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { renderPhoto, FILTER_PRESETS } from "../../utils/photoEdit";
import { defaultEdits } from "../../utils/mediaReducer";

const ASPECTS = ["original", "1:1", "4:5", "16:9"];
const BTN = "min-h-[44px] min-w-[44px] px-3 rounded-md border border-line text-sm hover:border-ink focus-ring";

function Slider({ id, label, value, min, max, step = 1, onChange }) {
    return (
        <div className="mb-3">
            <label htmlFor={id} className="flex justify-between text-sm mb-1"><span>{label}</span><span className="text-ash">{value}</span></label>
            <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full min-h-[44px]" />
        </div>
    );
}

// Non-circular, keyboard-accessible photo editor (all controls are native
// buttons / range inputs). Edits are baked on-device when uploading.
export default function PhotoEditor({ item, onChange, onClose }) {
    const { t } = useLanguage();
    const edits = { ...defaultEdits("image"), ...item.edits };
    const [preview, setPreview] = useState(null);
    const [failed, setFailed] = useState(false);
    const timer = useRef(null);

    useEffect(() => {
        if (!item.file || item.undecodable) return undefined;
        clearTimeout(timer.current);
        let cancelled = false;
        let objectUrl;
        timer.current = setTimeout(async () => {
            try {
                const file = await renderPhoto(item.file, edits, { maxEdge: 640, quality: 0.8 });
                if (cancelled) return;
                objectUrl = URL.createObjectURL(file);
                setPreview((old) => { if (old) URL.revokeObjectURL(old); return objectUrl; });
                setFailed(false);
            } catch {
                if (!cancelled) setFailed(true);
            }
        }, 120);
        return () => { cancelled = true; clearTimeout(timer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.file, item.undecodable, JSON.stringify(edits)]);

    useEffect(() => () => { setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; }); }, []);

    const set = (patch) => onChange(patch);

    if (item.undecodable || failed) {
        return (
            <section aria-labelledby="photo-editor-title" className="border border-line rounded-lg p-4">
                <h3 id="photo-editor-title" className="font-display text-lg mb-2">{t("wizard.editPhoto")}</h3>
                <p className="text-sm text-ash mb-3">{t("wizard.cannotEdit")}</p>
                <button type="button" className={BTN} onClick={onClose}>{t("wizard.done")}</button>
            </section>
        );
    }

    return (
        <section aria-labelledby="photo-editor-title" className="border border-line rounded-lg p-4">
            <h3 id="photo-editor-title" className="font-display text-lg mb-3">{t("wizard.editPhoto")}</h3>
            <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
                <div className="bg-line/30 rounded-md flex items-center justify-center min-h-[240px] p-2">
                    {preview
                        ? <img src={preview} alt={t("wizard.previewAlt")} className="max-h-[420px] max-w-full rounded" />
                        : <p className="text-sm text-ash" role="status">{t("wizard.rendering")}</p>}
                </div>
                <div>
                    <fieldset className="mb-4">
                        <legend className="text-sm mb-1">{t("wizard.crop")}</legend>
                        <div className="flex flex-wrap gap-2" role="radiogroup">
                            {ASPECTS.map((a) => (
                                <button key={a} type="button" role="radio" aria-checked={edits.aspect === a}
                                    className={`${BTN} ${edits.aspect === a ? "bg-teal/10 border-teal text-teal" : ""}`}
                                    onClick={() => set({ aspect: a, panX: 0, panY: 0, zoom: 1 })}>
                                    {a === "original" ? t("wizard.original") : a}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    {edits.aspect !== "original" && (
                        <>
                            <Slider id="pe-zoom" label={t("wizard.zoom")} value={edits.zoom} min={1} max={4} step={0.1} onChange={(v) => set({ zoom: v })} />
                            <Slider id="pe-panx" label={t("wizard.panX")} value={edits.panX} min={-1} max={1} step={0.1} onChange={(v) => set({ panX: v })} />
                            <Slider id="pe-pany" label={t("wizard.panY")} value={edits.panY} min={-1} max={1} step={0.1} onChange={(v) => set({ panY: v })} />
                        </>
                    )}
                    <div className="flex gap-2 mb-4">
                        <button type="button" className={BTN} onClick={() => set({ rotate: (edits.rotate + 270) % 360 })} aria-label={t("wizard.rotateLeft")}>⟲</button>
                        <button type="button" className={BTN} onClick={() => set({ rotate: (edits.rotate + 90) % 360 })} aria-label={t("wizard.rotateRight")}>⟳</button>
                    </div>
                    <Slider id="pe-bright" label={t("wizard.brightness")} value={edits.brightness} min={-100} max={100} onChange={(v) => set({ brightness: v })} />
                    <Slider id="pe-contrast" label={t("wizard.contrast")} value={edits.contrast} min={-100} max={100} onChange={(v) => set({ contrast: v })} />
                    <Slider id="pe-sat" label={t("wizard.saturation")} value={edits.saturation} min={-100} max={100} onChange={(v) => set({ saturation: v })} />
                    <fieldset className="mb-4">
                        <legend className="text-sm mb-1">{t("wizard.filters")}</legend>
                        <div className="flex flex-wrap gap-2" role="radiogroup">
                            {Object.keys(FILTER_PRESETS).map((f) => (
                                <button key={f} type="button" role="radio" aria-checked={edits.filter === f}
                                    className={`${BTN} ${edits.filter === f ? "bg-teal/10 border-teal text-teal" : ""}`}
                                    onClick={() => set({ filter: f })}>
                                    {t(`wizard.filter.${f}`)}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    <div className="flex gap-2">
                        <button type="button" className={`${BTN} bg-mango text-abyss border-mango font-medium`} onClick={onClose}>{t("wizard.done")}</button>
                        <button type="button" className={BTN} onClick={() => set(defaultEdits("image"))}>{t("wizard.reset")}</button>
                    </div>
                </div>
            </div>
        </section>
    );
}
