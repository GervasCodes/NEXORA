import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import useObjectUrl from "./useObjectUrl";
import { defaultEdits } from "../../utils/mediaReducer";
import { MAX_VIDEO_SECONDS } from "../../utils/mediaLimits";

const BTN = "min-h-[44px] min-w-[44px] px-3 rounded-md border border-line text-sm hover:border-ink focus-ring";
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Trim / mute / cover-frame editor. Nothing is re-encoded: the choices are
// saved as metadata and applied by Cloudinary transformations on delivery.
export default function VideoEditor({ item, onChange, onClose }) {
    const { t } = useLanguage();
    const url = useObjectUrl(item.file) || item.url;
    const ref = useRef(null);
    const [duration, setDuration] = useState(0);
    const edits = { ...defaultEdits("video"), ...item.edits };
    const end = edits.trimEnd ?? duration;
    const tooLong = duration > 0 && end - edits.trimStart > MAX_VIDEO_SECONDS;

    useEffect(() => {
        const v = ref.current;
        if (!v) return undefined;
        const onMeta = () => {
            setDuration(v.duration || 0);
            // A long video starts trimmed to the allowed length.
            if (v.duration > MAX_VIDEO_SECONDS && edits.trimEnd == null) {
                onChange({ trimStart: 0, trimEnd: MAX_VIDEO_SECONDS });
            }
        };
        v.addEventListener("loadedmetadata", onMeta);
        if (v.readyState >= 1) onMeta();
        return () => v.removeEventListener("loadedmetadata", onMeta);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    const seek = (time) => { if (ref.current) ref.current.currentTime = time; };

    return (
        <section aria-labelledby="video-editor-title" className="border border-line rounded-lg p-4">
            <h3 id="video-editor-title" className="font-display text-lg mb-3">{t("wizard.editVideo")}</h3>
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption -- seller's own product demo, no caption track */}
                    <video ref={ref} src={url} controls muted={edits.mute} playsInline className="w-full rounded-md bg-black max-h-[420px]" />
                </div>
                <div>
                    <p className="text-sm text-ash mb-3">{t("wizard.length", { len: fmt(Math.max(0, end - edits.trimStart)), total: fmt(duration) })}</p>
                    <div className="mb-3">
                        <label htmlFor="ve-start" className="flex justify-between text-sm mb-1"><span>{t("wizard.trimStart")}</span><span className="text-ash">{fmt(edits.trimStart)}</span></label>
                        <input id="ve-start" type="range" min={0} max={Math.max(0, end - 0.5)} step={0.1} value={edits.trimStart}
                            onChange={(e) => { const v = Number(e.target.value); onChange({ trimStart: v, coverTime: Math.max(edits.coverTime, v) }); seek(v); }} className="w-full min-h-[44px]" />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="ve-end" className="flex justify-between text-sm mb-1"><span>{t("wizard.trimEnd")}</span><span className="text-ash">{fmt(end)}</span></label>
                        <input id="ve-end" type="range" min={Math.min(duration, edits.trimStart + 0.5)} max={duration} step={0.1} value={end}
                            onChange={(e) => { const v = Number(e.target.value); onChange({ trimEnd: v >= duration - 0.05 ? null : v }); seek(v); }} className="w-full min-h-[44px]" />
                    </div>
                    {tooLong && <p role="alert" className="text-coral text-sm mb-3">{t("wizard.tooLong", { max: MAX_VIDEO_SECONDS })}</p>}
                    <label className="flex items-center gap-2 min-h-[44px] text-sm mb-3 cursor-pointer">
                        <input type="checkbox" checked={edits.mute} onChange={(e) => onChange({ mute: e.target.checked })} className="accent-teal w-5 h-5" />
                        {t("wizard.mute")}
                    </label>
                    <div className="mb-4">
                        <p className="text-sm mb-1">{t("wizard.coverFrame")} <span className="text-ash">({fmt(edits.coverTime)})</span></p>
                        <button type="button" className={BTN} onClick={() => onChange({ coverTime: Math.min(Math.max(ref.current?.currentTime ?? 0, edits.trimStart), end) })}>
                            {t("wizard.useCurrentFrame")}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className={`${BTN} bg-mango text-abyss border-mango font-medium`} onClick={onClose} disabled={tooLong}>{t("wizard.done")}</button>
                        <button type="button" className={BTN} onClick={() => onChange(defaultEdits("video"))}>{t("wizard.reset")}</button>
                    </div>
                </div>
            </div>
        </section>
    );
}
