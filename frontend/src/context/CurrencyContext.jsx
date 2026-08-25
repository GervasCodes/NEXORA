import { createContext, useContext, useState, useCallback, useMemo } from "react";

const CurrencyContext = createContext(null);

const STORAGE_KEY = "nexora_currency";
export const CURRENCIES = ["TZS", "EUR", "GBP", "KES", "UGX", "USD"].sort();


const RATES_PER_TZS = {
    TZS: 1,
    USD: 1 / 2600,
    EUR: 1 / 2820,
    GBP: 1 / 3300,
    KES: 1 / 20.1,
    UGX: 1 / 0.7
};

const CURRENCY_LOCALE = {
    TZS: "en-US",
    USD: "en-US",
    EUR: "de-DE",
    GBP: "en-GB",
    KES: "en-KE",
    UGX: "en-UG"
};

const loadStoredCurrency = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return CURRENCIES.includes(stored) ? stored : "TZS";
};

export function CurrencyProvider({ children }) {
    const [currency, setCurrencyState] = useState(loadStoredCurrency);

    const setCurrency = useCallback((next) => {
        if (!CURRENCIES.includes(next)) return;
        localStorage.setItem(STORAGE_KEY, next);
        setCurrencyState(next);
    }, []);

    const syncFromProfile = useCallback((profileCurrency) => {
        if (!CURRENCIES.includes(profileCurrency)) return;
        if (localStorage.getItem(STORAGE_KEY)) return;
        setCurrency(profileCurrency);
    }, [setCurrency]);

    // amountTzs: a price as stored in the database (always TZS).
    // Phase 2 (Remediation, E3): this converts a TZS settlement amount into
    // the buyer's chosen display currency and labels it accordingly - use
    // this for buyer-facing prices (product/service listings, cart,
    // checkout). It is display-only: the amount that actually settles is
    // still the TZS figure. For settlement-currency figures that must stay
    // in TZS regardless of the viewer's currency preference (seller
    // payouts, wallet balances, admin financial views), use
    // utils/format.js's formatMoney() instead and pair it with a visible
    // "TZS" label.
    const format = useCallback((amountTzs) => {
        const value = (Number(amountTzs) || 0) * RATES_PER_TZS[currency];
        const maximumFractionDigits = currency === "TZS" ? 0 : 2;

        return `${currency} ${value.toLocaleString(CURRENCY_LOCALE[currency] || "en-US", {
            maximumFractionDigits,
            minimumFractionDigits: currency === "TZS" ? 0 : 2
        })}`;
    }, [currency]);

    
    const toTzs = useCallback((amountInCurrency) => {
        if (amountInCurrency === "" || amountInCurrency === null || amountInCurrency === undefined) {
            return null;
        }

        const value = Number(amountInCurrency);
        if (!Number.isFinite(value)) return null;

        return value / RATES_PER_TZS[currency];
    }, [currency]);

    const value = useMemo(
        () => ({ currency, setCurrency, syncFromProfile, format, toTzs }),
        [currency, setCurrency, syncFromProfile, format, toTzs]
    );

    return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export const useCurrency = () => useContext(CurrencyContext);
