import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/ui/EmptyState";

export default function Guides() {
    const [articles, setArticles] = useState(null);

    useEffect(() => {
        api.get("/content").then(({ data }) => setArticles(data.data)).catch(() => setArticles([]));
    }, []);

    if (articles === null) return <PageLoader />;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Buying guides" description="Guides and tips to help you shop smarter on NEXORA." />
            <h1 className="font-display text-2xl mb-1">Buying guides</h1>
            <p className="text-ash text-sm mb-8">Tips and guides to help you shop smarter.</p>

            {articles.length === 0 ? (
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
