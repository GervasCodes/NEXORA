import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import EmptyState from "../../components/ui/EmptyState";

const EMPTY_FORM = { title: "", excerpt: "", seoMetaDescription: "", coverImageUrl: "", bodyMarkdown: "" };

export default function AdminContent() {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(EMPTY_FORM);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        setLoading(true);
        api.get("/content/admin").then(({ data }) => setArticles(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submit = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        try {
            await api.post("/content/admin", form);
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    const toggleStatus = async (article) => {
        setBusyId(article.id);
        try {
            await api.put(`/content/admin/${article.id}/status`, {
                status: article.status === "published" ? "draft" : "published"
            });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Buying guides" noIndex />
            <h1 className="font-display text-2xl mb-1">Buying guides</h1>
            <p className="text-ash text-sm mb-6">SEO content - category/buying guides shown publicly at /guides.</p>

            <form onSubmit={submit} className="border border-line rounded-lg p-4 mb-8 space-y-3">
                <h2 className="font-display text-lg">New guide</h2>
                <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <input placeholder="Excerpt (shown in the guides list)" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <input placeholder="SEO meta description" value={form.seoMetaDescription} onChange={(e) => setForm({ ...form, seoMetaDescription: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <input placeholder="Cover image URL" value={form.coverImageUrl} onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <textarea required rows={8} placeholder="Body (plain text paragraphs, separated by blank lines)" value={form.bodyMarkdown} onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring resize-none" />

                {error && <p className="text-sm text-coral">{error}</p>}

                <button type="submit" disabled={creating} className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                    {creating ? "Creating…" : "Create draft"}
                </button>
            </form>

            <h2 className="font-display text-lg mb-3">All guides</h2>
            {articles.length === 0 ? (
                <EmptyState title="No guides yet." />
            ) : (
                <ul className="space-y-2">
                    {articles.map((a) => (
                        <li key={a.id} className="border border-line rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-medium text-sm">{a.title}</p>
                                <p className="text-ash text-xs">/guides/{a.slug}</p>
                            </div>
                            <button
                                disabled={busyId === a.id}
                                onClick={() => toggleStatus(a)}
                                className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${a.status === "published" ? "border-teal text-teal" : "border-line text-ash"}`}
                            >
                                {a.status === "published" ? "Published" : "Draft"}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
