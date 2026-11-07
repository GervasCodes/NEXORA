import { useEffect, useRef, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { publicName } from "../utils/username";
import { formatDate } from "../utils/format";
import Button from "./ui/Button";
import InfiniteScrollFooter from "./ui/InfiniteScrollFooter";
import { SkeletonCard } from "./Skeleton";
import useInfiniteScroll from "../hooks/useInfiniteScroll";

/**
 * ProductQA (UI/UX remediation).
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
    const [loadingMore, setLoadingMore] = useState(false);
    // A failed next page keeps the loaded questions on screen; the footer offers a Retry.
    const [moreError, setMoreError] = useState(false);
    // Bumped per first-page fetch so a late "next page" can't append onto a refreshed list.
    const seq = useRef(0);

    // `page` only advances once a page has actually loaded, so retrying after
    // a failure asks for the same page again instead of skipping it.
    const load = (targetPage) => {
        const append = targetPage > 1;
        const mySeq = append ? seq.current : ++seq.current;
        setMoreError(false);
        setLoadingMore(append);
        api.get(`/products/${productId}/questions`, { params: { page: targetPage } })
            .then(({ data: res }) => {
                if (mySeq !== seq.current) return;
                setData((prev) => {
                    if (!prev || !append) return res.data;
                    return { ...res.data, questions: [...prev.questions, ...res.data.questions] };
                });
                setPage(targetPage);
            })
            .catch(() => { if (mySeq === seq.current && append) setMoreError(true); })
            .finally(() => { if (mySeq === seq.current) setLoadingMore(false); });
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is redefined every render; this effect intentionally only re-fetches when productId changes, not on every render
    useEffect(() => { load(1); }, [productId]);

    const loadMore = () => {
        if (loadingMore) return;
        load(page + 1);
    };

    const submitQuestion = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            await api.post(`/products/${productId}/questions`, { question: questionText });
            setQuestionText("");
            setAskOpen(false);
            load(1);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const hasMore = Boolean(data && data.questions.length < data.total);
    const { sentinelRef } = useInfiniteScroll({ hasMore, loading: loadingMore, error: moreError, onLoadMore: loadMore });

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
                        <Button loading={submitting} type="submit" size="sm" disabled={submitting}>
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
                            <p className="text-sm font-medium">{publicName(q, t("username.anonymous"))}</p>
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

            <InfiniteScrollFooter
                sentinelRef={sentinelRef}
                hasMore={hasMore}
                loading={loadingMore}
                error={moreError}
                onLoadMore={loadMore}
                loadMoreLabel={t("product.qaLoadMore")}
                skeleton={<SkeletonCard className="mt-4" />}
                className="mt-4"
            />
        </section>
    );
}
