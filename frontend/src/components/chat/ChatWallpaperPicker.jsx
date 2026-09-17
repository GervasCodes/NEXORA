import { useLanguage } from "../../context/LanguageContext";
import { CHAT_WALLPAPERS } from "../../utils/chatWallpaper";

// Phase 12 (Messaging UI Modernization) - chat wallpaper/theme picker.
// A small popover (not a full settings page) since there's a handful of
// presets, not a form's worth of options - opened from the same header
// row as Search/Clear chat/Delete chat in ConversationThread.jsx, and
// only mounted while open (same convention MessageSearch already uses),
// so there's no internal open/closed state of its own here.
export default function ChatWallpaperPicker({ activeId, onSelect, onClose }) {
    const { t } = useLanguage();

    return (
        <>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- invisible click-catcher that closes the popover; keyboard users close it via the Close button below or by tabbing out */}
            <div className="fixed inset-0 z-10" onClick={onClose} />
            <div className="absolute right-0 top-full mt-2 z-20 glass-strong rounded-lg shadow-lg p-3 w-56 animate-scale-in">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-ink">{t("chat.wallpaper")}</p>
                    <button type="button" onClick={onClose} className="text-ash hover:text-ink text-xs" aria-label="Close">
                        ✕
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {CHAT_WALLPAPERS.map((wallpaper) => (
                        <button
                            key={wallpaper.id}
                            type="button"
                            onClick={() => onSelect(wallpaper.id)}
                            aria-label={t(wallpaper.labelKey)}
                            aria-current={activeId === wallpaper.id}
                            className={`aspect-square rounded-md border-2 transition-colors ${wallpaper.className} ${
                                activeId === wallpaper.id ? "border-mango" : "border-line hover:border-ash"
                            }`}
                            style={wallpaper.style || undefined}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}
