import { useState } from "react";
import ProductGrid from "../components/ProductGrid";
import ProductFilters from "../components/ProductFilters";
import NexoraSmartSearch from "../components/ai/NexoraSmartSearch";
import PageMeta from "../components/PageMeta";
import { useLanguage } from "../context/LanguageContext";


export default function BrowseProducts() {
    const { t } = useLanguage();
    const [filters, setFilters] = useState({});
    // Nexora AI-parsed filters (Phase B1, feature #2) are layered on top
    // of whatever ProductFilters last emitted, not a replacement for it -
    // the regular filter controls are spread second in the params below,
    // so any manual filter change always wins over a stale AI-parsed one.
    const [aiFilters, setAiFilters] = useState({});

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <PageMeta title="All Products" description={t("browse.metaDescription")} />
            <div className="mb-8 animate-slide-up">
                <h1 className="font-display text-3xl mb-1">{t("browse.title")}</h1>
                <p className="text-ash text-sm">{t("browse.subtitle")}</p>
            </div>

            <NexoraSmartSearch onApply={setAiFilters} />

            <ProductFilters onChange={setFilters} />

            <ProductGrid
                params={{ ...aiFilters, ...filters }}
                emptyTitle={t("store.noProductsTitle")}
                emptyHint={t("browse.noProductsHint")}
            />
        </div>
    );
}
