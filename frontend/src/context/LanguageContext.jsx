import { createContext, useContext, useState, useCallback, useMemo } from "react";

const LanguageContext = createContext(null);

const STORAGE_KEY = "nexora_language";
export const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "sw", label: "Kiswahili" }
];

// Core, high-visibility strings (nav, common actions, account) translated
// so switching language is visibly real-time across the app shell. Not
// every string in NEXORA is wired through t() yet - untranslated strings
// simply fall back to the English source text (via the `|| key` below),
// so adding coverage elsewhere later is a drop-in change, not a redesign.
const DICTIONARY = {
    en: {
        "nav.dashboard": "Dashboard",
        "nav.deliveries": "Deliveries",
        "nav.admin": "Admin",
        "nav.messages": "Messages",
        "nav.orders": "Orders",
        "nav.cart": "Cart",
        "nav.account": "Account",
        "nav.signOut": "Sign out",
        "nav.signIn": "Sign in",
        "nav.join": "Join",
        "nav.searchPlaceholder": "Search products, brands...",
        "nav.search": "Search",
        "nav.go": "Go",
        "account.title": "Account",
        "account.signedInAs": "Signed in as",
        "account.profile": "Profile",
        "account.settings": "Settings",
        "account.settingsHint": "Language, theme, and currency apply across NEXORA instantly.",
        "account.language": "Language",
        "account.theme": "Theme",
        "account.currency": "Currency",
        "account.changePassword": "Change password",
        "account.changePasswordHint": "For your security, we'll email you a verification code before you can set a new password.",
        "account.changePasswordButton": "Change Password",
        "account.deleteAccount": "Delete account",
        "common.save": "Save",
        "common.saving": "Saving…",
        "common.cancel": "Cancel",
        "common.continue": "Continue",
        "common.loading": "Loading…"
    },
    sw: {
        "nav.dashboard": "Dashibodi",
        "nav.deliveries": "Usafirishaji",
        "nav.admin": "Msimamizi",
        "nav.messages": "Ujumbe",
        "nav.orders": "Maagizo",
        "nav.cart": "Kikapu",
        "nav.account": "Akaunti",
        "nav.signOut": "Toka",
        "nav.signIn": "Ingia",
        "nav.join": "Jiunge",
        "nav.searchPlaceholder": "Tafuta bidhaa, chapa...",
        "nav.search": "Tafuta",
        "nav.go": "Nenda",
        "account.title": "Akaunti",
        "account.signedInAs": "Umeingia kama",
        "account.profile": "Wasifu",
        "account.settings": "Mipangilio",
        "account.settingsHint": "Lugha, mandhari, na sarafu vinatumika kote NEXORA papo hapo.",
        "account.language": "Lugha",
        "account.theme": "Mandhari",
        "account.currency": "Sarafu",
        "account.changePassword": "Badilisha nenosiri",
        "account.changePasswordHint": "Kwa usalama wako, tutakutumia msimbo wa uthibitisho kwa barua pepe kabla ya kuweka nenosiri jipya.",
        "account.changePasswordButton": "Badilisha Nenosiri",
        "account.deleteAccount": "Futa akaunti",
        "common.save": "Hifadhi",
        "common.saving": "Inahifadhi…",
        "common.cancel": "Ghairi",
        "common.continue": "Endelea",
        "common.loading": "Inapakia…"
    }
};

const loadStoredLanguage = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return DICTIONARY[stored] ? stored : "en";
};

export function LanguageProvider({ children }) {
    const [language, setLanguageState] = useState(loadStoredLanguage);

    const setLanguage = useCallback((next) => {
        if (!DICTIONARY[next]) return;
        localStorage.setItem(STORAGE_KEY, next);
        setLanguageState(next);
    }, []);

    const syncFromProfile = useCallback((profileLanguage) => {
        if (!DICTIONARY[profileLanguage]) return;
        if (localStorage.getItem(STORAGE_KEY)) return;
        setLanguage(profileLanguage);
    }, [setLanguage]);

    // Falls back to the key's English text (or the key itself) so
    // untranslated strings never render blank.
    const t = useCallback((key) => {
        return DICTIONARY[language]?.[key] || DICTIONARY.en[key] || key;
    }, [language]);

    const value = useMemo(
        () => ({ language, setLanguage, syncFromProfile, t }),
        [language, setLanguage, syncFromProfile, t]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
