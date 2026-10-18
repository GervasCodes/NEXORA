import { useEffect, useState } from "react";
import { publicName } from "../../utils/username";
import { useOutletContext, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import Input from "../../components/ui/Input";
import { useLanguage } from "../../context/LanguageContext";

// (Customer Experience) - provider-side counterpart of
// SellerReviews.jsx, same paginated-list-with-reply shape, just hitting
// /reviews/provider/:providerId (booking-keyed reviews) instead of
// /reviews/store/:sellerId (product-keyed reviews). Reply posts through
// the exact same POST /reviews/:id/reply endpoint - review.service.js's
// replyToReview branches on the review's target internally, so there's
// nothing service-specific about the reply call itself.
export default function SellerServiceReviews() {
    const { t } = useLanguage();
    const { profile } = useOutletContext();

    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [drafts, setDrafts] = useState({});
    const [submittingId, setSubmittingId] = useState(null);
    const [error, setError] = useState("");

    const loadPage = (targetPage) => {
        setLoading(true);
        api.get(`/reviews/provider/${profile.user_id}`, { params: { page: targetPage } })
            .then(({ data }) => {
                setReviews((prev) => (targetPage === 1 ? data.data.reviews : [...prev, ...data.data.reviews]));
                setPage(targetPage);
                setTotalPages(data.data.totalPages || 1);
            })
            .catch(() => {})
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
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmittingId(null);
        }
    };

    if (loading && reviews.length === 0) {
        return <LoadingState label={t("seller.serviceReviews.loading")} />;
    }

    return (
        <div>
            <PageMeta title={t("seller.serviceReviews.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.serviceReviews.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("seller.serviceReviews.intro")}</p>

            {error && <p role="alert" className="text-sm text-coral mb-4">{error}</p>}

            {reviews.length === 0 ? (
                <EmptyState title={t("seller.serviceReviews.empty")} />
            ) : (
                <ul className="space-y-4">
                    {reviews.map((r) => (
                        <li key={r.id} className="border border-line rounded-lg p-4">
                            <div className="flex justify-between items-baseline mb-1">
                                <p className="font-medium text-sm">{publicName(r)}</p>
                                <p className="text-xs text-ash">{formatDate(r.created_at)}</p>
                            </div>
                            <p className="text-sm text-ash mb-1">★ {r.rating}/5</p>
                            {r.service_slug && (
                                <Link to={`/services/${r.service_slug}`} className="text-xs text-teal hover:underline">
                                    {t("seller.serviceReviews.onService", { title: r.service_title })}
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
                                            alt={t("seller.serviceReviews.attachmentAlt", { n: pi + 1 })}
                                            loading="lazy"
                                            className="w-16 h-16 rounded-md object-cover border border-line"
                                        />
                                    ))}
                                </div>
                            )}

                            {r.seller_reply ? (
                                <div className="mt-2 bg-line/30 rounded-md px-3 py-2">
                                    <p className="text-xs font-medium text-ink mb-0.5">{t("seller.serviceReviews.yourResponse")}</p>
                                    <p className="text-xs text-ink/80">{r.seller_reply}</p>
                                </div>
                            ) : (
                                <div className="mt-2">
                                    <Input
                                        as="textarea"
                                        value={drafts[r.id] || ""}
                                        onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })}
                                        placeholder={t("seller.serviceReviews.replyPlaceholder")}
                                        aria-label={t("seller.serviceReviews.replyPlaceholder")}
                                        maxLength={1000}
                                        rows={2}
                                        className="mb-2"
                                    />
                                    <button
                                        onClick={() => handleReply(r.id)}
                                        disabled={submittingId === r.id || !(drafts[r.id] || "").trim()}
                                        className="text-sm bg-ink text-paper px-4 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                                    >
                                        {submittingId === r.id ? t("seller.serviceReviews.posting") : t("seller.serviceReviews.postReply")}
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
                    {loading ? t("seller.serviceReviews.loading") : t("seller.serviceReviews.loadMore")}
                </button>
            )}
        </div>
    );
}
