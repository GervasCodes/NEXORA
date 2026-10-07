import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/ui/EmptyState";
import { useLanguage } from "../context/LanguageContext";

export default function Guides() {
    const { t } = useLanguage();
    const [articles, setArticles] = useState(null);
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState(null);

    useEffect(() => {
        api.get("/content/categories").then(({ data }) => setCategories(data.data)).catch(() => {});
    }, []);

    useEffect(() => {
        setArticles(null);
        api.get("/content", { params: activeCategory ? { category_id: activeCategory } : {} })
            .then(({ data }) => setArticles(data.data))
            .catch(() => setArticles([]));
    }, [activeCategory]);

    const chipClass = (active) =>
        `h-11 px-4 rounded-full text-sm border transition-colors ${active ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title={t("guides.title")} description={t("guides.metaDescription")} />
            <h1 className="font-display text-2xl mb-1">{t("guides.title")}</h1>
            <p className="text-ash text-sm mb-6">{t("guides.intro")}</p>

            {/* Only categories with at least one published guide are listed
                (content.repository.js#findCategoriesInUse), so no empty filter. */}
            {categories.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                    <button type="button" onClick={() => setActiveCategory(null)} className={chipClass(activeCategory === null)}>
                        {t("guides.all")}
                    </button>
                    {categories.map((c) => (
                        <button key={c.id} type="button" onClick={() => setActiveCategory(c.id)} className={chipClass(activeCategory === c.id)}>
                            {c.name}
                        </button>
                    ))}
                </div>
            )}

            {articles === null ? (
                <PageLoader />
            ) : articles.length === 0 ? (
                <EmptyState title={t("guides.emptyTitle")} hint={t("guides.emptyHint")} />
            ) : (
                <ul className="space-y-6">
                    {articles.map((a) => (
                        <li key={a.id}>
                            <Link to={`/guides/${a.slug}`} className="flex gap-4 group">
                                {a.cover_image_url && (
                                    <img
                                        src={a.cover_image_url}
                                        alt={a.cover_alt || a.title}
                                        width={112}
                                        height={80}
                                        loading="lazy"
                                        decoding="async"
                                        className="w-28 h-20 object-cover rounded-md shrink-0"
                                    />
                                )}
                                <div>
                                    {a.category_name && (
                                        <p className="text-xs text-ash uppercase tracking-wide mb-0.5">{a.category_name}</p>
                                    )}
                                    <p className="font-medium group-hover:underline">{a.title}</p>
                                    {a.excerpt && <p className="text-ash text-sm mt-1 line-clamp-2">{a.excerpt}</p>}
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
