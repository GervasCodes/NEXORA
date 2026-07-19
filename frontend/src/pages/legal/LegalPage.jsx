import { useEffect } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import MarkdownLite from "../../components/legal/MarkdownLite";
import { LEGAL_DOCS, LEGAL_DOC_LIST } from "../../data/legalDocs";

export default function LegalPage() {
    const { slug } = useParams();
    const doc = LEGAL_DOCS[slug];

    useEffect(() => {
        if (doc) window.scrollTo({ top: 0 });
    }, [slug, doc]);

    if (!doc) {
        return <Navigate to="/legal/terms-of-service" replace />;
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
            <nav className="md:sticky md:top-6 md:self-start">
                <p className="text-xs uppercase tracking-wide text-ash mb-3">Legal &amp; Policies</p>
                <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                    {LEGAL_DOC_LIST.map((d) => (
                        <li key={d.slug} className="shrink-0">
                            <Link
                                to={`/legal/${d.slug}`}
                                className={`block px-3 py-2 rounded-md text-sm whitespace-nowrap ${
                                    d.slug === slug
                                        ? "bg-teal/10 text-teal font-medium"
                                        : "text-ash hover:bg-line/40"
                                }`}
                            >
                                {d.shortTitle}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            <article>
                <h1 className="font-display text-2xl sm:text-3xl mb-1">{doc.title}</h1>
                <MarkdownLite content={doc.content} />
            </article>
        </div>
    );
}
