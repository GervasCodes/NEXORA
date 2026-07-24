// Phase 7A (Store Themes). The fixed set of accent-color presets a
// seller can pick for their public store page - mirrors the backend's
// seller.constants.js STORE_THEMES list (kept in sync manually since
// frontend/backend are separate packages, same as other duplicated
// constants in this codebase e.g. database/migrate.js's SSL comment).
//
// Class names are written out in full (not built with template
// literals like `text-${key}`) so Tailwind's content scanner - a plain
// regex over the source files, not a code path it executes - picks
// every one of them up regardless of which theme a given store
// actually has selected.
export const STORE_THEMES = [
    { key: "default", label: "Default", swatch: "bg-ink", text: "text-ink", bg: "bg-ink", border: "border-ink" },
    { key: "teal", label: "Teal", swatch: "bg-teal", text: "text-teal", bg: "bg-teal", border: "border-teal" },
    { key: "coral", label: "Coral", swatch: "bg-coral", text: "text-coral", bg: "bg-coral", border: "border-coral" },
    { key: "mango", label: "Mango", swatch: "bg-mango", text: "text-mango", bg: "bg-mango", border: "border-mango" },
    { key: "azure", label: "Azure", swatch: "bg-azure", text: "text-azure", bg: "bg-azure", border: "border-azure" }
];

const THEMES_BY_KEY = STORE_THEMES.reduce((acc, theme) => {
    acc[theme.key] = theme;
    return acc;
}, {});

// Falls back to "default" for an unset/unrecognized value, so a store
// page never breaks if a seller's stored value predates a preset being
// renamed/removed.
export const getStoreTheme = (key) => THEMES_BY_KEY[key] || THEMES_BY_KEY.default;
