
export const STORE_THEMES = [
    { key: "default", label: "Default", swatch: "bg-ink", text: "text-ink", bg: "bg-ink", border: "border-ink", badgeText: "text-paper" },
    { key: "teal", label: "Teal", swatch: "bg-teal", text: "text-teal", bg: "bg-teal", border: "border-teal", badgeText: "text-frost" },
    { key: "coral", label: "Coral", swatch: "bg-coral", text: "text-coral", bg: "bg-coral", border: "border-coral", badgeText: "text-paper" },
    { key: "mango", label: "Mango", swatch: "bg-mango", text: "text-mango", bg: "bg-mango", border: "border-mango", badgeText: "text-paper" },
    { key: "azure", label: "Azure", swatch: "bg-azure", text: "text-azure", bg: "bg-azure", border: "border-azure", badgeText: "text-paper" }
];

const THEMES_BY_KEY = STORE_THEMES.reduce((acc, theme) => {
    acc[theme.key] = theme;
    return acc;
}, {});

// Falls back to "default" for an unset/unrecognized value, so a store
// page never breaks if a seller's stored value predates a preset being
// renamed/removed.
export const getStoreTheme = (key) => THEMES_BY_KEY[key] || THEMES_BY_KEY.default;
