import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import MarkdownLite from "../../components/legal/MarkdownLite";
import { LEGAL_DOCS, LEGAL_DOC_LIST } from "../../data/legalDocs";
import PageMeta from "../../components/PageMeta";
import { useLanguage } from "../../context/LanguageContext";

// Phase 3: ONE Terms & Conditions page. Every legal document is a section
// of this page (document text itself is unchanged), with a sticky contents
// list and a "applies to" label per section. /legal/:slug redirects here.
const AUDIENCE_KEY = {
    buyers: "terms.aud.buyers",
    sellers: "terms.aud.sellers",
    delivery: "terms.aud.delivery"
};

// Cross-links inside the documents point at /legal/<slug>; on this page they
// become in-page anchors.
const mapHref = (href) => {
    const m = /^\/legal\/([a-z0-9-]+)$/.exec(href);
    return m && LEGAL_DOCS[m[1]] ? `/terms#${m[1]}` : href;
};

export default function TermsPage() {
    const { t } = useLanguage();
    const { hash } = useLocation();

    useEffect(() => {
        const id = hash ? decodeURIComponent(hash.slice(1)) : "";
        if (!id) {
            window.scrollTo({ top: 0 });
            return;
        }
        // Wait a tick so the sections have rendered.
        const handle = setTimeout(() => {
            document.getElementById(id)?.scrollIntoView({ block: "start" });
        }, 0);
        return () => clearTimeout(handle);
    }, [hash]);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
            <PageMeta
                title={t("terms.title")}
                description={t("terms.description")}
            />
            <nav aria-label={t("terms.contents")} className="md:sticky md:top-6 md:self-start">
                <p className="text-xs uppercase tracking-wide text-ash mb-3">{t("terms.contents")}</p>
                <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                    {LEGAL_DOC_LIST.map((d) => (
                        <li key={d.slug} className="shrink-0">
                            <Link
                                to={`/terms#${d.slug}`}
                                className={`block px-3 py-2 rounded-md text-sm whitespace-nowrap ${
                                    hash === `#${d.slug}` ? "bg-teal/10 text-teal font-medium" : "text-ash hover:bg-line/40"
                                }`}
                            >
                                {d.shortTitle}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            <main>
                <h1 className="font-display text-2xl sm:text-3xl mb-2">{t("terms.title")}</h1>
                <p className="text-ash text-sm mb-8">{t("terms.intro")}</p>

                {LEGAL_DOC_LIST.map((d) => (
                    <section key={d.slug} id={d.slug} aria-labelledby={`${d.slug}-title`} className="scroll-mt-24 mb-14">
                        <h2 id={`${d.slug}-title`} className="font-display text-xl sm:text-2xl mb-2">{d.title}</h2>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-ash mb-3">
                            <span>{t("terms.appliesTo")}</span>
                            {d.audience.map((a) => (
                                <span key={a} className="px-2 py-0.5 rounded-full bg-teal/10 text-teal">{t(AUDIENCE_KEY[a])}</span>
                            ))}
                        </p>
                        <MarkdownLite content={d.content} idPrefix={d.slug} mapHref={mapHref} demote />
                    </section>
                ))}
            </main>
        </div>
    );
}
