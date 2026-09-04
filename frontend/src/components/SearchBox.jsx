import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { addRecentSearch, clearRecentSearches, getRecentSearches } from "../utils/recentSearches";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;


function HighlightMatch({ text, query }) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return text;

    const index = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());
    if (index === -1) return text;

    return (
        <>
            {text.slice(0, index)}
            <mark className="bg-mango/40 text-ink rounded-sm">{text.slice(index, index + trimmedQuery.length)}</mark>
            {text.slice(index + trimmedQuery.length)}
        </>
    );
}


const SpeechRecognitionAPI =
    typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;


export default function SearchBox({ placeholder, submitLabel, inputClassName, onNavigate }) {
    const navigate = useNavigate();
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [value, setValue] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [listening, setListening] = useState(false);
    const [recent, setRecent] = useState(() => getRecentSearches());
    const containerRef = useRef(null);
    const debounceRef = useRef(null);
    const recognitionRef = useRef(null);

    useEffect(() => {
        clearTimeout(debounceRef.current);

        if (value.trim().length < MIN_CHARS) {
            setSuggestions([]);
            return;
        }

        debounceRef.current = setTimeout(() => {
            const term = value.trim();
            // Phase 3 (UI/UX remediation) - previously only ever searched
            // /products, even though the app has three other browsable
            // content types (services, stores, guides) with no way to
            // reach them from the one search box every page shares.
            // Fired in parallel and merged client-side rather than a
            // single combined-search endpoint, since each type already
            // has its own working search-capable list endpoint with its
            // own filters/pagination - a merge endpoint would just be
            // this same work moved server-side for no real benefit at
            // this result count (5 each, capped total below).
            Promise.allSettled([
                api.get("/products", { params: { search: term, limit: 5 } }),
                api.get("/services", { params: { search: term, limit: 3 } }),
                api.get("/stores", { params: { search: term, limit: 3 } }),
                api.get("/content", { params: { search: term, limit: 3 } })
            ]).then(([productsRes, servicesRes, storesRes, guidesRes]) => {
                const products = productsRes.status === "fulfilled"
                    ? (productsRes.value.data.data || []).map((p) => ({ type: "product", id: `product-${p.id}`, name: p.name, slug: p.slug, image_url: p.image_url, subtitle: p.store_name, price: p.discount_price || p.price }))
                    : [];
                const services = servicesRes.status === "fulfilled"
                    ? (servicesRes.value.data.data?.services || []).map((s) => ({ type: "service", id: `service-${s.id}`, name: s.title, slug: s.slug, image_url: s.image_url, subtitle: s.store_name, price: s.discount_price || s.base_price }))
                    : [];
                const stores = storesRes.status === "fulfilled"
                    ? (storesRes.value.data.data || []).map((st) => ({ type: "store", id: `store-${st.user_id}`, name: st.store_name, slug: st.store_slug, image_url: st.store_logo, subtitle: st.is_verified ? t("product.verifiedStore") : null }))
                    : [];
                const guides = guidesRes.status === "fulfilled"
                    ? (guidesRes.value.data.data || []).map((g) => ({ type: "guide", id: `guide-${g.id}`, name: g.title, slug: g.slug, image_url: g.cover_image_url, subtitle: null }))
                    : [];

                setSuggestions([...products, ...services, ...stores, ...guides]);
                setOpen(true);
            }).catch(() => {});
        }, DEBOUNCE_MS);

        return () => clearTimeout(debounceRef.current);
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const goToResults = (term) => {
        setOpen(false);
        onNavigate?.();
        const trimmed = term.trim();
        if (trimmed) setRecent(addRecentSearch(trimmed));
        navigate(trimmed ? `/?search=${encodeURIComponent(trimmed)}` : "/");
    };

    const ROUTE_BY_TYPE = {
        product: "/products",
        service: "/services",
        store: "/stores",
        guide: "/guides"
    };

    const goToResult = (result) => {
        setOpen(false);
        onNavigate?.();
        if (value.trim()) setRecent(addRecentSearch(value.trim()));
        navigate(`${ROUTE_BY_TYPE[result.type]}/${result.slug}`);
    };

    const handleClearRecent = (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearRecentSearches();
        setRecent([]);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
            goToResult(suggestions[activeIndex]);
        } else {
            goToResults(value);
        }
    };

    const handleKeyDown = (e) => {
        if (!open || suggestions.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, -1));
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    const handleVoiceSearch = () => {
        if (!SpeechRecognitionAPI || listening) return;

        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        recognition.lang = "en-US";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => setListening(true);
        recognition.onerror = () => setListening(false);
        recognition.onend = () => setListening(false);

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setValue(transcript);
            goToResults(transcript);
        };

        recognition.start();
    };

    useEffect(() => {
        return () => recognitionRef.current?.abort();
    }, []);

    return (
        <div ref={containerRef} className="relative flex-1">
            <form onSubmit={handleSubmit} className="flex">
                <input
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setActiveIndex(-1); }}
                    onFocus={() => (suggestions.length > 0 || (value.trim().length === 0 && recent.length > 0)) && setOpen(true)}
                    onKeyDown={handleKeyDown}
                    type="text"
                    role="combobox"
                    aria-expanded={open}
                    aria-autocomplete="list"
                    placeholder={placeholder}
                    autoComplete="off"
                    className={inputClassName}
                />
                {SpeechRecognitionAPI && (
                    <button
                        type="button"
                        onClick={handleVoiceSearch}
                        aria-label={listening ? "Listening…" : "Search by voice"}
                        className={`bg-paper px-2.5 flex items-center justify-center transition-colors ${
                            listening ? "text-coral animate-pulse" : "text-ash hover:text-ink"
                        }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                        </svg>
                    </button>
                )}
                <button type="submit" className="bg-mango text-abyss px-4 rounded-r-md text-sm font-semibold hover:bg-mango-dark transition-colors focus-ring shrink-0">
                    {submitLabel}
                </button>
            </form>

            {open && value.trim().length === 0 && recent.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 glass-strong rounded-md shadow-lg overflow-hidden z-50">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-line/60">
                        <span className="text-xs uppercase tracking-wide text-ash">{t("search.recent")}</span>
                        <button type="button" onMouseDown={handleClearRecent} className="text-xs text-teal hover:underline">
                            {t("search.clearRecent")}
                        </button>
                    </div>
                    {recent.map((term) => (
                        <button
                            key={term}
                            type="button"
                            onMouseDown={() => { setValue(term); goToResults(term); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-line/40 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3.5 h-3.5 text-ash shrink-0">
                                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
                            </svg>
                            <span className="truncate">{term}</span>
                        </button>
                    ))}
                </div>
            )}

            {open && suggestions.length > 0 && value.trim().length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 glass-strong rounded-md shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto">
                    {suggestions.map((result, i) => (
                        <button
                            key={result.id}
                            type="button"
                            onMouseDown={() => goToResult(result)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                i === activeIndex ? "bg-line/60" : "hover:bg-line/40"
                            }`}
                        >
                            <div className="w-9 h-9 rounded bg-line/40 shrink-0 overflow-hidden">
                                {result.image_url && <img src={result.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-ink truncate flex items-center gap-1.5">
                                    <HighlightMatch text={result.name} query={value} />
                                    <span className="text-[10px] uppercase tracking-wide text-ash shrink-0">
                                        {t(`search.type.${result.type}`)}
                                    </span>
                                </p>
                                {result.subtitle && <p className="text-xs text-ash truncate">{result.subtitle}</p>}
                            </div>
                            {result.price !== undefined && (
                                <span className="price text-xs text-ink shrink-0">{format(result.price)}</span>
                            )}
                        </button>
                    ))}
                    <button
                        type="button"
                        onMouseDown={() => goToResults(value)}
                        className="w-full text-left px-3 py-2 text-xs text-teal hover:bg-line/40 transition-colors border-t border-line/60"
                    >
                        See all results for "{value}"
                    </button>
                </div>
            )}
        </div>
    );
}
