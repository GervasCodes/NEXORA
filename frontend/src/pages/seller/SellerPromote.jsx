import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import SellerSponsorship from "./SellerSponsorship";
import SellerFeaturedStore from "./SellerFeaturedStore";
import { IncludedCreditsBanner } from "../../components/SponsorshipCredits";
import Skeleton from "../../components/Skeleton";
import { useLanguage } from "../../context/LanguageContext";

const MAX_PROMO_VIDEO_BYTES = 50 * 1024 * 1024;

// (Promo Video Unification) - one store-level promo video,
// managed here rather than added to any single campaign type below
// (it isn't a paid campaign, so it doesn't get a fourth tab). Uploads
// through the same uploadVideo.middleware.js + Cloudinary "video"
// resource-type pipeline product videos already use - see
// seller.service.js#uploadPromoVideo, no parallel upload logic.
// Loads/saves independently of the tabs' own data (own GET
// /seller/profile call) rather than via the SellerLayout outlet
// context, since this page is also mounted standalone in tests
// without that parent route.
function StorePromoVideoSection() {
    const { t } = useLanguage();
    const [promoVideoUrl, setPromoVideoUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [removing, setRemoving] = useState(false);
    const [error, setError] = useState("");

    const loadProfile = useCallback(() => {
        setLoading(true);
        setLoadFailed(false);
        api.get("/seller/profile")
            .then(({ data }) => setPromoVideoUrl(data.data?.promo_video_url || null))
            .catch(() => setLoadFailed(true))
            .finally(() => setLoading(false));
    }, []);

    useEffect(loadProfile, [loadProfile]);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setError("");

        // Same limits the server enforces (uploadVideo.middleware.js) -
        // checked here so a 200 MB clip fails instantly, not after a
        // long upload on mobile data.
        if (!file.type.startsWith("video/")) {
            setError(t("seller.promote.video.notVideo"));
            e.target.value = "";
            return;
        }
        if (file.size > MAX_PROMO_VIDEO_BYTES) {
            setError(t("seller.promote.video.tooLarge", { size: (file.size / (1024 * 1024)).toFixed(0) }));
            e.target.value = "";
            return;
        }

        setUploading(true);
        setProgress(0);
        try {
            const body = new FormData();
            body.append("video", file);
            const { data } = await api.post("/seller/promo-video", body, {
                onUploadProgress: (evt) => {
                    if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
                }
            });
            setPromoVideoUrl(data.data.promoVideoUrl);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploading(false);
            setProgress(0);
            e.target.value = "";
        }
    };

    const handleRemove = async () => {
        setRemoving(true);
        setError("");
        try {
            await api.delete("/seller/promo-video");
            setPromoVideoUrl(null);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setRemoving(false);
        }
    };

    if (loading) {
        return (
            <div className="border border-line rounded-lg p-4 mb-8" aria-busy="true">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-3/4 mb-4" />
                <Skeleton className="h-8 w-28" />
            </div>
        );
    }

    if (loadFailed) {
        return (
            <div className="border border-line rounded-lg p-4 mb-8">
                <p className="text-sm font-medium mb-1">{t("seller.promote.video.title")}</p>
                <p role="alert" className="text-coral text-sm mb-2">{t("seller.promote.video.loadFailed")}</p>
                <button type="button" onClick={loadProfile} className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors">
                    {t("seller.promote.video.tryAgain")}
                </button>
            </div>
        );
    }

    return (
        <div className="border border-line rounded-lg p-4 mb-8">
            <p className="text-sm font-medium mb-1">{t("seller.promote.video.title")}</p>
            <p className="text-xs text-ash mb-3">
                {t("seller.promote.video.hint")}
            </p>

            {error && <p role="alert" className="text-coral text-sm mb-3">{error}</p>}

            {promoVideoUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- seller-uploaded store promo video has no caption/subtitle track available
                <video
                    src={promoVideoUrl}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full max-w-sm rounded-md border border-line mb-3"
                />
            )}

            {uploading && (
                <div className="mb-3 max-w-sm" role="status" aria-live="polite">
                    <div className="h-1.5 rounded-full bg-line overflow-hidden">
                        <div className="h-full bg-teal transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-ash mt-1">
                        {progress < 100 ? t("seller.promote.video.uploadingPct", { pct: progress }) : t("seller.promote.video.processing")}
                    </p>
                </div>
            )}

            <div className="flex items-center gap-2">
                <label className="inline-block text-xs border border-line px-3 py-1.5 rounded-md cursor-pointer hover:border-ink transition-colors">
                    {uploading ? t("seller.promote.video.uploading") : promoVideoUrl ? t("seller.promote.video.replace") : t("seller.promote.video.upload")}
                    <input
                        type="file"
                        accept="video/*"
                        onChange={handleUpload}
                        disabled={uploading || removing}
                        className="hidden"
                    />
                </label>
                {promoVideoUrl && (
                    <button
                        type="button"
                        onClick={handleRemove}
                        disabled={uploading || removing}
                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-coral hover:text-coral transition-colors disabled:opacity-50"
                    >
                        {removing ? t("seller.promote.video.removing") : t("seller.promote.video.remove")}
                    </button>
                )}
            </div>
        </div>
    );
}

// (Remediation, A3): sponsorship and featured stores used to be separate
// nav entries/routes that did the same thing (pay from wallet balance to
// buy a period of extra visibility somewhere on the site) with
// near-identical pages. This consolidates them into one "Promote" entry
// point with a tab per campaign type. Each tab renders the existing page
// component as-is (via its `embedded` prop, which just skips that page's
// own <PageMeta>/<h1> since this hub supplies one). Department
// sponsorship used to be a third tab and has been retired.
const TABS = [
    { key: "sponsorship", labelKey: "seller.promote.tab.sponsorship", Component: SellerSponsorship },
    { key: "featured-store", labelKey: "seller.promote.tab.featuredStore", Component: SellerFeaturedStore }
];

export default function SellerPromote() {
    const { t } = useLanguage();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const activeTab = TABS.find((tab) => tab.key === requestedTab) || TABS[0];

    // Subscription-included credits (1 credit = 1 campaign-day) are one
    // shared balance across both campaign types, so the hub shows
    // them once above the tabs instead of each tab repeating them. Any
    // campaign type's /pricing endpoint returns the same
    // `included_credits`; the sponsorship one is used here. Best-effort:
    // if it fails the tabs still work (each has its own pricing fetch).
    const [includedCredits, setIncludedCredits] = useState(null);
    const loadCredits = useCallback(() => {
        api.get("/seller/sponsorship/pricing")
            .then(({ data }) => setIncludedCredits(data.data?.included_credits || null))
            .catch(() => {});
    }, []);
    useEffect(loadCredits, [loadCredits]);

    return (
        <div>
            <PageMeta title={t("seller.promote.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.promote.title")}</h1>
            <p className="text-ash text-sm mb-6">
                {t("seller.promote.intro")}
            </p>

            <IncludedCreditsBanner credits={includedCredits} />

            <StorePromoVideoSection />

            <div className="flex flex-wrap gap-1 mb-8" role="tablist" aria-label={t("seller.promote.tabsLabel")}>
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={activeTab.key === tab.key}
                        onClick={() => setSearchParams(tab.key === TABS[0].key ? {} : { tab: tab.key })}
                        className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                            activeTab.key === tab.key ? "bg-ink text-paper" : "text-ash hover:bg-line/50"
                        }`}
                    >
                        {t(tab.labelKey)}
                    </button>
                ))}
            </div>

            <activeTab.Component embedded onCampaignsChanged={loadCredits} />
        </div>
    );
}
