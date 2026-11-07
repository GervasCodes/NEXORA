import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ProductGrid from "../components/ProductGrid";
import ProductFilters from "../components/ProductFilters";
import PageMeta from "../components/PageMeta";
import { useLanguage } from "../context/LanguageContext";


export default function BrowseProducts() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [filters, setFilters] = useState({});

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <PageMeta title="All Products" description={t("browse.metaDescription")} />
            <div className="mb-8 animate-slide-up">
                <h1 className="font-display text-3xl mb-1">{t("browse.title")}</h1>
                <p className="text-ash text-sm">{t("browse.subtitle")}</p>
            </div>

            <ProductFilters onChange={setFilters} />

            {/* Browse All is swipe-only now: no grid/list toggle, opens
                straight into the feed. "Filters" inside the feed still
                drops back to the plain list above (see ProductGrid.jsx's
                forceFeedOnly) so filters stay reachable, then hops back
                into swipe once the filtered results load. Since there's
                no grid identity of its own here, the feed's close button
                leaves the page instead of revealing that fallback list. */}
            <ProductGrid
                params={filters}
                emptyTitle={t("store.noProductsTitle")}
                emptyHint={t("browse.noProductsHint")}
                forceFeedOnly
                onFeedClose={() => navigate("/")}
            />
        </div>
    );
}
