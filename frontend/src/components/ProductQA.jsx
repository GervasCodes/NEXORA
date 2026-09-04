import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";
import Button from "./ui/Button";

/**
 * ProductQA - Phase 2 (UI/UX remediation).
 *
 * Public question list (readable by anyone, including guests, same as
 * reviews already are) plus an ask form for logged-in buyers. Mirrors
 * the review list's newest-first + seller-reply rendering pattern
 * already established in ProductDetail.jsx's reviews section, kept as
 * its own component since the question/answer + pagination logic is
 * substantial enough on its own to not want inlined into an already
 * large page.
 */
export default function ProductQA({ productId }) {
    const { user } = useAuth();
    const { t } = useLanguage();

    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [askOpen, setAskOpen] = useState(false);
    const [questionText, setQuestionText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const load = (targetPage) => {
        api.get(`/products/${productId}/questions`, { params: { page: targetPage } })
            .then(({ data: res }) => {
                setData((prev) => {
                    if (!prev || targetPage === 1) return res.data;
                    return { ...res.data, questions: [...prev.questions, ...res.data.questions] };
                });
            })
            .catch(() => {});
    };

    useEffect(() => { load(1); }, [productId]);

    const loadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        load(nextPage);
    };

    const submitQuestion = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            await api.post(`/products/${productId}/questions`, { question: questionText });
            setQuestionText("");
            setAskOpen(false);
            setPage(1);
            load(1);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const hasMore = data && data.questions.length < data.total;

    return (
        <section className="mt-16 max-w-2xl">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <h2 className="font-display text-xl">{t("product.qaTitle")}</h2>
                {user?.role === "buyer" && !askOpen && (
                    <button onClick={() => setAskOpen(true)} className="text-sm text-teal hover:underline">
                        {t("product.qaAsk")}
                    </button>
                )}
            </div>

            {!user && (
                <p className="text-xs text-ash mb-4">{t("product.qaLoginToAsk")}</p>
            )}

            {askOpen && (
                <form onSubmit={submitQuestion} className="border border-line rounded-lg p-4 mb-6">
                    <textarea
                        value={questionText}
                        onChange={(e) => setQuestionText(e.target.value)}
                        placeholder={t("product.qaAskPlaceholder")}
                        maxLength={500}
                        rows={3}
                        required
                        className="w-full border border-line rounded-md px-3 py-2 text-sm mb-3 focus-ring"
                    />
                    {error && <p role="alert" className="text-sm text-coral mb-3">{error}</p>}
                    <div className="flex gap-3">
                        <Button type="submit" size="sm" disabled={submitting}>
                            {submitting ? t("product.qaSubmitting") : t("product.qaSubmit")}
                        </Button>
                        <button type="button" onClick={() => setAskOpen(false)} className="text-sm text-ash hover:underline">
                            {t("common.cancel")}
                        </button>
                    </div>
                </form>
            )}

            {data && data.questions.length === 0 && (
                <p className="text-ash text-sm">{t("product.qaNone")}</p>
            )}

            <ul className="space-y-4">
                {data?.questions.map((q) => (
                    <li key={q.id} className="border-b border-line pb-4">
                        <div className="flex justify-between items-baseline gap-3">
                            <p className="text-sm font-medium">{q.first_name} {q.last_name?.[0]}.</p>
                            <p className="text-xs text-ash shrink-0">{formatDate(q.created_at)}</p>
                        </div>
                        <p className="text-sm text-ink/80 mt-0.5">{q.question}</p>

                        {q.seller_answer ? (
                            <div className="mt-2 bg-line/30 rounded-md px-3 py-2">
                                <p className="text-xs font-medium text-ink mb-0.5">{t("product.qaSellerAnswer")}</p>
                                <p className="text-xs text-ink/80">{q.seller_answer}</p>
                            </div>
                        ) : (
                            <p className="text-xs text-ash mt-2 italic">{t("product.qaAwaitingAnswer")}</p>
                        )}
                    </li>
                ))}
            </ul>

            {hasMore && (
                <button onClick={loadMore} className="text-sm text-teal hover:underline mt-4">
                    {t("product.qaLoadMore")}
                </button>
            )}
        </section>
    );
}
