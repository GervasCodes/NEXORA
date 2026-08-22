import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";

// No markdown-rendering dependency in this project yet, so this splits
// on blank lines into paragraphs rather than pulling one in just for
// this - guide bodies are plain prose, not richly formatted content
// that needs real markdown (tables, code blocks, etc).
const renderBody = (markdown) =>
    markdown.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i} className="mb-4 leading-relaxed">{paragraph}</p>
    ));

export default function GuideDetail() {
    const { slug } = useParams();
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
                <p className="font-display text-2xl mb-2">Guide not found</p>
                <Link to="/guides" className="text-teal hover:underline text-sm">Back to guides</Link>
            </div>
        );
    }

    if (!article) return <PageLoader />;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title={article.title} description={article.seo_meta_description || article.excerpt} />
            {article.cover_image_url && (
                <img src={article.cover_image_url} alt="" className="w-full aspect-video object-cover rounded-lg mb-6" />
            )}
            <h1 className="font-display text-3xl mb-6">{article.title}</h1>
            <div className="text-ink/90 text-[15px]">{renderBody(article.body_markdown)}</div>
        </div>
    );
}
