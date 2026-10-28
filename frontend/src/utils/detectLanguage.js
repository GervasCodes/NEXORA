// Phase 1: pick the first-visit language. A saved choice always wins
// (handled by the caller). Otherwise Kiswahili is the default for Swahili
// browsers and for devices set to a Tanzanian time zone; everyone else
// gets English.
export const SWAHILI_TIME_ZONES = ["Africa/Dar_es_Salaam", "Africa/Dodoma"];

export function detectDefaultLanguage() {
    try {
        const prefs = (typeof navigator !== "undefined" &&
            (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
        if (prefs.some((l) => typeof l === "string" && l.toLowerCase().startsWith("sw"))) return "sw";
    } catch { /* ignore */ }
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (SWAHILI_TIME_ZONES.includes(tz)) return "sw";
    } catch { /* ignore */ }
    return "en";
}
