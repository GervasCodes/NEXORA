import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/ui/EmptyState";

export default function Guides() {
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

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Buying guides" description="Guides and tips to help you shop smarter on NEXORA." />
            <h1 className="font-display text-2xl mb-1">Buying guides</h1>
            <p className="text-ash text-sm mb-6">Tips and guides to help you shop smarter.</p>

            {/* Category filter chips (Phase 9, UI/UX remediation) - only
                categories that actually have at least one published
                guide (see content.repository.js#findCategoriesInUse),
                so there's never a filter that returns an empty list. */}
            {categories.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                    <button
                        onClick={() => setActiveCategory(null)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                            activeCategory === null ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                        }`}
                    >
                        All
                    </button>
                    {categories.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => setActiveCategory(c.id)}
                            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                activeCategory === c.id ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                            }`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>
            )}

            {articles === null ? (
                <PageLoader />
            ) : articles.length === 0 ? (
                <EmptyState title="No guides published yet" hint="Check back soon." />
            ) : (
                <ul className="space-y-6">
                    {articles.map((a) => (
                        <li key={a.id}>
                            <Link to={`/guides/${a.slug}`} className="flex gap-4 group">
                                {a.cover_image_url && (
                                    <img src={a.cover_image_url} alt="" className="w-28 h-20 object-cover rounded-md shrink-0" />
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
