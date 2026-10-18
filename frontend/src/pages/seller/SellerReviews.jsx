import { useEffect, useState } from "react";
import { publicName } from "../../utils/username";
import { useOutletContext, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Skeleton from "../../components/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import { useLanguage } from "../../context/LanguageContext";

const FILTERS = [
    { key: "all", labelKey: "seller.reviews.filter.all" },
    { key: "needs_reply", labelKey: "seller.reviews.filter.needsReply" },
    { key: "low", labelKey: "seller.reviews.filter.low" }
];


export default function SellerReviews() {
    const { t } = useLanguage();
    const { profile } = useOutletContext();

    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [drafts, setDrafts] = useState({});
    const [submittingId, setSubmittingId] = useState(null);
    const [error, setError] = useState("");
    const [loadError, setLoadError] = useState("");
    const [filter, setFilter] = useState("all");

    const loadPage = (targetPage) => {
        setLoading(true);
        setLoadError("");
        api.get(`/reviews/store/${profile.user_id}`, { params: { page: targetPage } })
            .then(({ data }) => {
                setReviews((prev) => (targetPage === 1 ? data.data.reviews : [...prev, ...data.data.reviews]));
                setPage(targetPage);
                setTotalPages(data.data.totalPages || 1);
            })
            .catch((err) => setLoadError(extractErrorMessage(err) || t("seller.reviews.loadFailed")))
            .finally(() => setLoading(false));
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- `loadPage` is redefined every render; this effect intentionally only re-fetches when the profile changes
    useEffect(() => loadPage(1), [profile.user_id]);

    const handleReply = async (reviewId) => {
        const reply = (drafts[reviewId] || "").trim();
        if (!reply) return;

        setSubmittingId(reviewId);
        setError("");
        try {
            await api.post(`/reviews/${reviewId}/reply`, { reply });
            setReviews((prev) =>
                prev.map((r) => (r.id === reviewId ? { ...r, seller_reply: reply, seller_reply_at: new Date().toISOString() } : r))
            );
            setDrafts((prev) => {
                const next = { ...prev };
                delete next[reviewId];
                return next;
            });
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmittingId(null);
        }
    };

    if (loading && reviews.length === 0) {
        return (
            <div className="animate-fade-in" aria-busy="true" aria-label={t("seller.reviews.loading")}>
                <Skeleton className="h-7 w-32 mb-2" />
                <Skeleton className="h-4 w-80 mb-8" />
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="border border-line rounded-lg p-4">
                            <Skeleton className="h-4 w-40 mb-3" />
                            <Skeleton className="h-3 w-24 mb-3" />
                            <Skeleton className="h-3 w-full mb-2" />
                            <Skeleton className="h-3 w-2/3" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (loadError && reviews.length === 0) {
        return <ErrorState title={t("seller.reviews.loadFailedTitle")} hint={loadError} onRetry={() => loadPage(1)} />;
    }

    const visibleReviews = reviews.filter((r) => {
        if (filter === "needs_reply") return !r.seller_reply;
        if (filter === "low") return Number(r.rating) <= 3;
        return true;
    });

    return (
        <div>
            <PageMeta title={t("seller.reviews.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.reviews.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("seller.reviews.subtitle")}</p>

            {error && <p role="alert" className="text-sm text-coral mb-4">{error}</p>}
            {loadError && (
                <p role="alert" className="text-sm text-coral mb-4">
                    {loadError}{" "}
                    <button type="button" onClick={() => loadPage(page + 1)} className="underline">{t("seller.reviews.tryAgain")}</button>
                </p>
            )}

            {reviews.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-6" role="group" aria-label={t("seller.reviews.filterLabel")}>
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            aria-pressed={filter === f.key}
                            onClick={() => setFilter(f.key)}
                            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                                filter === f.key ? "bg-ink text-paper" : "text-ash hover:bg-line/50"
                            }`}
                        >
                            {t(f.labelKey)}
                        </button>
                    ))}
                </div>
            )}

            {reviews.length === 0 ? (
                <EmptyState title={t("seller.reviews.empty")} />
            ) : visibleReviews.length === 0 ? (
                <EmptyState title={t("seller.reviews.noMatch")} hint={page < totalPages ? t("seller.reviews.noMatchHint") : undefined} />
            ) : (
                <ul className="space-y-4">
                    {visibleReviews.map((r) => (
                        <li key={r.id} className="border border-line rounded-lg p-4">
                            <div className="flex justify-between items-baseline mb-1">
                                <p className="font-medium text-sm">{publicName(r)}</p>
                                <p className="text-xs text-ash">{formatDate(r.created_at)}</p>
                            </div>
                            <p className="text-sm text-ash mb-1">★ {r.rating}/5</p>
                            {r.product_slug && (
                                <Link to={`/products/${r.product_slug}`} className="text-xs text-teal hover:underline">
                                    {t("seller.reviews.onProduct", { name: r.product_name })}
                                </Link>
                            )}
                            {r.comment && <p className="text-sm text-ink/80 mt-1 mb-2">{r.comment}</p>}
                            {r.photos?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {r.photos.map((photo, pi) => (
                                        <img
                                            key={photo.id}
                                            src={photo.photo_url}
                                            // Phase 3 (alt-text pass): review photos are
                                            // content, not decoration.
                                            alt={t("seller.reviews.attachmentAlt", { n: pi + 1 })}
                                            loading="lazy"
                                            className="w-16 h-16 rounded-md object-cover border border-line"
                                        />
                                    ))}
                                </div>
                            )}

                            {r.seller_reply ? (
                                <div className="mt-2 bg-line/30 rounded-md px-3 py-2">
                                    <p className="text-xs font-medium text-ink mb-0.5">{t("seller.reviews.yourResponse")}</p>
                                    <p className="text-xs text-ink/80">{r.seller_reply}</p>
                                </div>
                            ) : (
                                <div className="mt-2">
                                    <Input
                                        as="textarea"
                                        value={drafts[r.id] || ""}
                                        onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })}
                                        placeholder={t("seller.reviews.replyPlaceholder")}
                                        maxLength={1000}
                                        rows={2}
                                        className="mb-1"
                                    />
                                    <p className="text-xs text-ash text-right mb-2" aria-live="off">{(drafts[r.id] || "").length}/1000</p>
                                    <button
                                        onClick={() => handleReply(r.id)}
                                        disabled={submittingId === r.id || !(drafts[r.id] || "").trim()}
                                        className="text-sm bg-ink text-paper px-4 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                                    >
                                        {submittingId === r.id ? t("seller.reviews.posting") : t("seller.reviews.postReply")}
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {page < totalPages && (
                <button
                    onClick={() => loadPage(page + 1)}
                    disabled={loading}
                    className="mt-4 text-sm text-teal hover:underline disabled:opacity-50"
                >
                    {loading ? t("seller.reviews.loadingShort") : t("seller.reviews.loadMore")}
                </button>
            )}
        </div>
    );
}
