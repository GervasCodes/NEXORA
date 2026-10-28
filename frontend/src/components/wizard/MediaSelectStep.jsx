import { useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import useObjectUrl from "./useObjectUrl";
import { MAX_IMAGES_PER_PRODUCT, MAX_VIDEOS_PER_PRODUCT } from "../../utils/mediaLimits";

const ACCEPT = "image/*,video/*,.heic,.heif,.avif";
const BTN = "min-h-[44px] min-w-[44px] px-3 rounded-md border border-line text-sm hover:border-ink focus-ring disabled:opacity-40";

function Thumb({ item, index, total, isCover, dispatch, onEdit, dragState }) {
    const { t } = useLanguage();
    const objectUrl = useObjectUrl(item.file);
    const src = objectUrl || item.url;
    const label = item.kind === "video" ? t("wizard.video") : t("wizard.photo");
    const move = (to) => dispatch({ type: "move", from: index, to });

    const onKeyDown = (e) => {
        if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); move(index - 1); }
        if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); move(index + 1); }
    };

    return (
        <li
            draggable
            onDragStart={() => { dragState.current = index; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.stopPropagation();
                if (dragState.current != null && dragState.current !== index) dispatch({ type: "move", from: dragState.current, to: index });
                dragState.current = null;
            }}
            onDragEnd={() => { dragState.current = null; }}
            className="w-36 border border-line rounded-lg p-2 bg-paper"
            aria-label={t("wizard.itemOf", { label, n: index + 1, total })}
        >
            <div className="relative w-full aspect-square rounded-md overflow-hidden bg-line/40">
                {item.kind === "video"
                    ? <video src={src} muted playsInline preload="metadata" className="w-full h-full object-cover" aria-label={t("wizard.videoPreview", { n: index + 1 })} />
                    : src && <img src={src} alt={isCover ? t("wizard.coverAlt") : t("wizard.photoAlt", { n: index + 1 })} className="w-full h-full object-cover" />}
                {isCover && (
                    <span className="absolute top-1 left-1 text-[11px] font-medium bg-mango text-abyss rounded-full px-2 py-0.5">{t("wizard.cover")}</span>
                )}
                {item.kind === "video" && (
                    <span className="absolute bottom-1 left-1 text-[11px] bg-abyss/70 text-frost rounded px-1.5">▶ {t("wizard.video")}</span>
                )}
                {item.status === "uploading" && (
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-abyss/40" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-teal" style={{ width: `${item.progress}%` }} />
                    </div>
                )}
                {item.status === "done" && <span className="absolute top-1 right-1 text-[11px] bg-teal text-white rounded-full px-1.5" aria-label={t("wizard.uploaded")}>✓</span>}
            </div>
            {item.status === "error" && <p role="alert" className="text-coral text-xs mt-1">{item.error}</p>}
            <div className="flex flex-wrap gap-1 mt-2" onKeyDown={onKeyDown}>
                <button type="button" className={BTN} onClick={() => move(index - 1)} disabled={index === 0} aria-label={t("wizard.moveEarlier", { label })}>←</button>
                <button type="button" className={BTN} onClick={() => move(index + 1)} disabled={index === total - 1} aria-label={t("wizard.moveLater", { label })}>→</button>
                <button type="button" className={BTN} onClick={() => onEdit(item.clientId)} aria-label={t("wizard.editItem", { label })}>✎</button>
                {item.kind === "image" && (
                    <button type="button" className={BTN} onClick={() => dispatch({ type: "setCover", clientId: item.clientId })} disabled={isCover} aria-pressed={isCover} aria-label={t("wizard.makeCover")}>{isCover ? "★" : "☆"}</button>
                )}
                <button type="button" className={`${BTN} hover:border-coral`} onClick={() => dispatch({ type: "remove", clientId: item.clientId })} aria-label={t("wizard.removeItem", { label })}>✕</button>
                {item.status === "error" && (
                    <button type="button" className={BTN} onClick={() => dispatch({ type: "retry", clientId: item.clientId })}>{t("wizard.retry")}</button>
                )}
            </div>
        </li>
    );
}

export default function MediaSelectStep({ state, dispatch, onFiles, onEdit, notice }) {
    const { t } = useLanguage();
    const dragState = useRef(null);
    const [over, setOver] = useState(false);
    const inputRef = useRef(null);

    const handle = (list) => {
        const files = Array.from(list || []);
        if (files.length) onFiles(files);
    };

    return (
        <section aria-labelledby="wizard-select-title">
            <h2 id="wizard-select-title" className="font-display text-xl mb-1">{t("wizard.step1Title")}</h2>
            <p className="text-sm text-ash mb-4">{t("wizard.step1Hint", { photos: MAX_IMAGES_PER_PRODUCT, videos: MAX_VIDEOS_PER_PRODUCT })}</p>

            <div
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); if (dragState.current == null) handle(e.dataTransfer.files); }}
                className={`rounded-lg border-2 border-dashed p-6 text-center mb-4 transition-colors ${over ? "border-teal bg-teal/5" : "border-line"}`}
            >
                <p className="text-sm text-ash mb-3">{t("wizard.dropHere")}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                    <button type="button" className={`${BTN} bg-mango text-abyss border-mango font-medium`} onClick={() => inputRef.current?.click()}>
                        {t("wizard.choose")}
                    </button>
                    <label className={`${BTN} inline-flex items-center cursor-pointer`}>
                        {t("wizard.camera")}
                        <input type="file" accept="image/*,video/*" capture="environment" className="sr-only" onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
                    </label>
                </div>
                <input ref={inputRef} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden="true"
                    onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
            </div>

            {notice && <p role="alert" className="text-coral text-sm mb-3">{notice}</p>}

            {state.items.length === 0 ? (
                <p className="text-sm text-ash">{t("wizard.noneYet")}</p>
            ) : (
                <>
                    <p className="text-xs text-ash mb-2">{t("wizard.reorderHint")}</p>
                    <ul className="flex flex-wrap gap-3" aria-label={t("wizard.mediaList")}>
                        {state.items.map((item, i) => (
                            <Thumb key={item.clientId} item={item} index={i} total={state.items.length}
                                isCover={item.clientId === state.coverId} dispatch={dispatch} onEdit={onEdit} dragState={dragState} />
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}
