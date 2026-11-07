import { useLanguage } from "../../context/LanguageContext";
import en from "../../i18n/en";

/**
 * Translation helper for the shared loader components. Behaves like
 * `useLanguage().t`, but still renders English text when the component is
 * mounted outside a <LanguageProvider> (isolated unit tests, error
 * boundaries that render above the provider).
 */
const fallbackT = (key, params) => {
    const template = en[key] || key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : ""));
};

export default function useT() {
    const ctx = useLanguage();
    return ctx?.t || fallbackT;
}
