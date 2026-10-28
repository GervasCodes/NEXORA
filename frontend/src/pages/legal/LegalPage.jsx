import { Navigate, useParams } from "react-router-dom";
import { LEGAL_DOCS } from "../../data/legalDocs";
import NotFound from "../NotFound";

// Phase 3: every legal document now lives on the single /terms page.
// Old /legal/:slug links (emails, bookmarks, search results) keep working
// by redirecting to the matching section.
export default function LegalPage() {
    const { slug } = useParams();
    if (!LEGAL_DOCS[slug]) return <NotFound />;
    return <Navigate to={`/terms#${slug}`} replace />;
}
