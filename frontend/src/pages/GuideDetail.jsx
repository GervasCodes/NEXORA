import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import GuideBody, { extractGuideHeadings } from "../components/GuideBody";
import ShareButtons from "../components/ShareButtons";
import { SITE_URL, buildBreadcrumbJsonLd, estimateReadingMinutes, toIsoDate } from "../utils/seo";
import { useLanguage } from "../context/LanguageContext";

function TocList({ headings, label }) {
    return (
        <ul aria-label={label} className="space-y-2 text-sm">
            {headings.map((h) => (
                <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
                    <a href={`#${h.id}`} className="text-ash hover:text-ink hover:underline">{h.text}</a>
                </li>
            ))}
        </ul>
    );
}

export default function GuideDetail() {
    const { slug } = useParams();
    const { t } = useLanguage();
    const [article, setArticle] = useState(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        api.get(`/content/${slug}`)
            .then(({ data }) => setArticle(data.data))
            .catch(() => setNotFound(true));
    }, [slug]);

    if (notFound) {
        return (
            <div className="max-w-xl mx-auto px-6 py-24 text-center">
                <PageMeta title={t("guides.notFound")} noIndex />
                <p className="font-display text-2xl mb-2">{t("guides.notFound")}</p>
                <Link to="/guides" className="text-teal hover:underline text-sm">{t("guides.backToGuides")}</Link>
            </div>
        );
    }

    if (!article) return <PageLoader />;

    const readingMinutes = estimateReadingMinutes(article.body_markdown);
    const articleUrl = `${SITE_URL}/guides/${article.slug || slug}`;
    const headings = extractGuideHeadings(article.body_markdown);
    const crumbs = [{ label: t("nav.home"), href: "/" }, { label: t("guides.crumb"), href: "/guides" }, { label: article.title }];
    const articleJsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title.slice(0, 110),
        description: article.seo_meta_description || article.excerpt || undefined,
        image: article.cover_image_url ? [article.cover_image_url] : undefined,
        datePublished: toIsoDate(article.published_at),
        dateModified: toIsoDate(article.updated_at || article.published_at),
        timeRequired: `PT${readingMinutes}M`,
        mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
        // Guides are published by the NEXORA editorial team (the content
        // table has an author id but no public author profile).
        author: { "@type": "Organization", name: "NEXORA", url: SITE_URL },
        publisher: { "@id": `${SITE_URL}/#organization` }
    };

    return (
        <div className="max-w-2xl md:max-w-5xl mx-auto px-4 sm:px-6 py-10 md:grid md:grid-cols-[minmax(0,1fr)_15rem] md:gap-10">
            <PageMeta
                title={article.title}
                description={article.seo_meta_description || article.excerpt}
                type="article"
                image={article.cover_image_url}
                jsonLd={[
                    articleJsonLd,
                    buildBreadcrumbJsonLd(crumbs, `/guides/${article.slug || slug}`)
                ]}
            />

            {/* Contents: collapsible on mobile, sticky side column on desktop. */}
            {headings.length > 1 && (
                <aside className="mb-8 md:mb-0 md:col-start-2 md:row-start-1 md:sticky md:top-24 md:self-start">
                    <details className="md:hidden border border-line rounded-lg p-4">
                        <summary className="text-sm font-medium cursor-pointer min-h-[44px] flex items-center">{t("guides.tocToggle")}</summary>
                        <div className="mt-2"><TocList headings={headings} label={t("guides.tocTitle")} /></div>
                    </details>
                    <nav aria-label={t("guides.tocTitle")} className="hidden md:block">
                        <p className="text-xs uppercase tracking-widest text-ash mb-3">{t("guides.tocTitle")}</p>
                        <TocList headings={headings} label={t("guides.tocTitle")} />
                    </nav>
                </aside>
            )}

            <article className="min-w-0 md:col-start-1 md:row-start-1">
                <Breadcrumbs items={crumbs} />
                {article.cover_image_url && (
                    <img
                        src={article.cover_image_url}
                        alt={article.cover_alt || article.title}
                        width={1200}
                        height={675}
                        fetchPriority="high"
                        decoding="async"
                        className="w-full aspect-video object-cover rounded-lg mb-6"
                    />
                )}
                <h1 className="font-display text-3xl mb-2">{article.title}</h1>
                <div className="flex items-center justify-between gap-4 mb-6">
                    <p className="text-xs text-ash">{t("seo.minRead", { count: readingMinutes })}</p>
                    <ShareButtons url={articleUrl} title={article.title} label={t("guides.share")} />
                </div>

                <GuideBody markdown={article.body_markdown} />

                {article.related?.length > 0 && (
                    <div className="mt-12 pt-8 border-t border-line">
                        <p className="font-display text-lg mb-4">{t("guides.moreGuides")}</p>
                        <ul className="grid sm:grid-cols-3 gap-4">
                            {article.related.map((r) => (
                                <li key={r.id}>
                                    <Link to={`/guides/${r.slug}`} className="group block">
                                        {r.cover_image_url && (
                                            <img src={r.cover_image_url} alt={r.cover_alt || r.title} loading="lazy" decoding="async" className="w-full aspect-video object-cover rounded-md mb-2" />
                                        )}
                                        <p className="text-sm font-medium group-hover:underline line-clamp-2">{r.title}</p>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </article>
        </div>
    );
}
