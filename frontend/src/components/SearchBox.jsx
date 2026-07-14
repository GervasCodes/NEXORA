import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

// Web Speech API support is inconsistent across browsers (notably weak/
// absent on iOS Safari) - this is why the mic button only ever renders
// when SpeechRecognition actually exists, rather than always showing it
// and failing silently or erroring on unsupported devices.
const SpeechRecognitionAPI =
    typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Debounced live suggestions as you type, reusing the same /products
// endpoint the full search results page already hits (limit=5, cheapest
// possible extra load on the backend - no new endpoint needed).
export default function SearchBox({ placeholder, submitLabel, inputClassName, onNavigate }) {
    const navigate = useNavigate();
    const { format } = useCurrency();
    const [value, setValue] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [listening, setListening] = useState(false);
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
            api.get("/products", { params: { search: value.trim(), limit: 5 } })
                .then(({ data }) => {
                    setSuggestions(data.data || []);
                    setOpen(true);
                })
                .catch(() => {});
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
        navigate(term.trim() ? `/?search=${encodeURIComponent(term.trim())}` : "/");
    };

    const goToProduct = (slug) => {
        setOpen(false);
        onNavigate?.();
        navigate(`/products/${slug}`);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
            goToProduct(suggestions[activeIndex].slug);
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
                    onFocus={() => suggestions.length > 0 && setOpen(true)}
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

            {open && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 glass-strong rounded-md shadow-lg overflow-hidden z-50">
                    {suggestions.map((p, i) => (
                        <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => goToProduct(p.slug)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                i === activeIndex ? "bg-line/60" : "hover:bg-line/40"
                            }`}
                        >
                            <div className="w-9 h-9 rounded bg-line/40 shrink-0 overflow-hidden">
                                {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-ink truncate">{p.name}</p>
                                <p className="text-xs text-ash truncate">{p.store_name}</p>
                            </div>
                            <span className="price text-xs text-ink shrink-0">{format(p.discount_price || p.price)}</span>
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
