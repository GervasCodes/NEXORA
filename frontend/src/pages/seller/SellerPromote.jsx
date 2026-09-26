import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import SellerSponsorship from "./SellerSponsorship";
import SellerFeaturedStore from "./SellerFeaturedStore";
import SellerDepartmentSponsorship from "./SellerDepartmentSponsorship";
import { IncludedCreditsBanner } from "../../components/SponsorshipCredits";

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
    const [promoVideoUrl, setPromoVideoUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/seller/profile")
            .then(({ data }) => setPromoVideoUrl(data.data?.promo_video_url || null))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        setError("");
        try {
            const body = new FormData();
            body.append("video", file);
            const { data } = await api.post("/seller/promo-video", body);
            setPromoVideoUrl(data.data.promoVideoUrl);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploading(false);
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

    if (loading) return null;

    return (
        <div className="border border-line rounded-lg p-4 mb-8">
            <p className="text-sm font-medium mb-1">Store promo video</p>
            <p className="text-xs text-ash mb-3">
                A short video shown on your store page banner - separate from
                product videos and Live Selling.
            </p>

            {error && <p role="alert" className="text-coral text-sm mb-3">{error}</p>}

            {promoVideoUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- seller-uploaded store promo video has no caption/subtitle track available
                <video
                    src={promoVideoUrl}
                    controls
                    className="w-full max-w-sm rounded-md border border-line mb-3"
                />
            )}

            <div className="flex items-center gap-2">
                <label className="inline-block text-xs border border-line px-3 py-1.5 rounded-md cursor-pointer hover:border-ink transition-colors">
                    {uploading ? "Uploading…" : promoVideoUrl ? "Replace video" : "Upload video"}
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
                        {removing ? "Removing…" : "Remove"}
                    </button>
                )}
            </div>
        </div>
    );
}

// (Remediation, A3): sponsorship, featured stores, and
// department sponsorship used to be three separate nav entries/routes
// that did the same thing (pay from wallet balance to buy a period of
// extra visibility somewhere on the site) with three near-identical
// pages. This consolidates them into one "Promote" entry point with a
// tab per campaign type. Backend modules, routes (each still calls its
// own /seller/{sponsorship|featured-store|department-sponsorship}/*
// endpoints), and data models are untouched - each tab renders the
// existing page component as-is (via its new `embedded` prop, which
// just skips that page's own <PageMeta>/<h1> since this hub supplies
// one), so none of the three campaign types' logic changed at all.
const TABS = [
    { key: "sponsorship", label: "Sponsored products", Component: SellerSponsorship },
    { key: "featured-store", label: "Featured stores", Component: SellerFeaturedStore },
    { key: "department-sponsorship", label: "Department sponsorship", Component: SellerDepartmentSponsorship }
];

export default function SellerPromote() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const activeTab = TABS.find((tab) => tab.key === requestedTab) || TABS[0];

    // Subscription-included credits (1 credit = 1 campaign-day) are one
    // shared balance across all three campaign types, so the hub shows
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
            <PageMeta title="Promote" noIndex />
            <h1 className="font-display text-2xl mb-1">Promote</h1>
            <p className="text-ash text-sm mb-6">
                Extra visibility - a sponsored product slot, top billing for your
                store, or a boosted department on the homepage. Your plan's
                included credits are used first; any extra days are paid from
                your wallet balance.
            </p>

            <IncludedCreditsBanner credits={includedCredits} />

            <StorePromoVideoSection />

            <div className="flex flex-wrap gap-1 mb-8" role="tablist" aria-label="Promotion type">
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
                        {tab.label}
                    </button>
                ))}
            </div>

            <activeTab.Component embedded onCampaignsChanged={loadCredits} />
        </div>
    );
}
