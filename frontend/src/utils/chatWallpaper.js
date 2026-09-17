// Phase 12 (Messaging UI Modernization) - chat wallpaper/theme system.
// Confirmed missing entirely: MessageBubble.jsx/components/chat/ had no
// concept of a background theme, so every conversation rendered on the
// same plain page background.
//
// Deliberately a single global choice (same convention CurrencyContext.js
// and LanguageContext.jsx already use for a device-wide preference),
// not a per-conversation setting - a chat wallpaper is a personal taste
// thing, not something that needs to vary conversation-to-conversation.
// Stored client-side only (localStorage), not synced to the backend:
// this is a device display preference like the currency/language
// choices above it, not data another device or the other participant
// needs to see.
//
// Every preset here intentionally stays light/pastel rather than a true
// dark background - MessageBubble.jsx hardcodes bubble colors (dark
// "mine" bubble with light text, light "theirs" bubble with dark text)
// independent of any wallpaper, and both remain legible against every
// preset below without needing a matching rework of bubble contrast.
const STORAGE_KEY = "nexora_chat_wallpaper";

const dotPattern = (colorVar) =>
    `radial-gradient(rgb(var(${colorVar}) / 0.35) 1px, transparent 1px)`;

export const CHAT_WALLPAPERS = [
    {
        id: "default",
        labelKey: "chat.wallpaperDefault",
        className: "bg-paper",
        style: null
    },
    {
        id: "azure",
        labelKey: "chat.wallpaperAzure",
        className: "bg-azure/10",
        style: null
    },
    {
        id: "mango",
        labelKey: "chat.wallpaperMango",
        className: "bg-mango/10",
        style: null
    },
    {
        id: "teal",
        labelKey: "chat.wallpaperTeal",
        className: "bg-teal/10",
        style: null
    },
    {
        id: "dots",
        labelKey: "chat.wallpaperDots",
        className: "bg-paper",
        style: { backgroundImage: dotPattern("--color-ash"), backgroundSize: "16px 16px" }
    }
];

const DEFAULT_WALLPAPER_ID = CHAT_WALLPAPERS[0].id;

export const getWallpaper = (id) =>
    CHAT_WALLPAPERS.find((w) => w.id === id) || CHAT_WALLPAPERS[0];

export const loadStoredWallpaperId = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return CHAT_WALLPAPERS.some((w) => w.id === stored) ? stored : DEFAULT_WALLPAPER_ID;
    } catch {
        return DEFAULT_WALLPAPER_ID;
    }
};

export const storeWallpaperId = (id) => {
    try {
        localStorage.setItem(STORAGE_KEY, id);
    } catch {
        // Storage can fail (private browsing, quota) - the choice just
        // won't persist across reloads, which is a harmless downgrade,
        // not an error worth surfacing to the user.
    }
};
