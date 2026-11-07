import { Navigate, useParams } from "react-router-dom";
import { LEGAL_DOCS } from "../../data/legalDocs";
import NotFound from "../NotFound";
import PageMeta from "../../components/PageMeta";
import { useLanguage } from "../../context/LanguageContext";

// Phase 3: every legal document now lives on the single /terms page.
// Old /legal/:slug links (emails, bookmarks, search results) keep working
// by redirecting to the matching section.
//
// Phase 8: the redirect page still gets title + description, and is kept OUT of
// the index (noindex, follow): the indexable copy of this text is /terms, so
// /legal/:slug must never compete with it as a duplicate. (Unknown slugs render
// NotFound, which already sets noindex.)
export default function LegalPage() {
    const { slug } = useParams();
    const { t } = useLanguage();
    const doc = LEGAL_DOCS[slug];
    if (!doc) return <NotFound />;
    return (
        <>
            <PageMeta title={doc.title} description={t("legal.metaDescription", { title: doc.title })} noIndexFollow />
            <Navigate to={`/terms#${slug}`} replace />
        </>
    );
}
