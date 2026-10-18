import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import NexoraCopyAssist from "../../components/ai/NexoraCopyAssist";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import ConfirmDialog from "../../components/ConfirmDialog";
import Input from "../../components/ui/Input";
import { compressImage } from "../../utils/imageCompression";
import { useLanguage } from "../../context/LanguageContext";

const PRICING_MODELS = [
    { value: "fixed", labelKey: "seller.serviceForm.pricing.fixed" },
    { value: "per_night", labelKey: "seller.serviceForm.pricing.per_night" },
    { value: "per_hour", labelKey: "seller.serviceForm.pricing.per_hour" },
    { value: "per_day", labelKey: "seller.serviceForm.pricing.per_day" },
    { value: "per_person", labelKey: "seller.serviceForm.pricing.per_person" }
];

const PRICE_UNIT_KEYS = {
    per_night: "seller.serviceForm.unit.per_night",
    per_hour: "seller.serviceForm.unit.per_hour",
    per_day: "seller.serviceForm.unit.per_day",
    per_person: "seller.serviceForm.unit.per_person"
};

const emptyForm = {
    title: "", description: "", category_id: "", pricing_model: "fixed",
    base_price: "", discount_price: "",
    country: "", region: "", city: "", address: ""
};

// Kept in sync with the backend's MAX_VIDEOS_PER_SERVICE
// (service.service.js), same reasoning as SellerProductForm.jsx.
const MAX_VIDEOS = 3;

// Availability is checked over this window when publishing.
const AVAILABILITY_WINDOW_DAYS = 90;

// Blank optional fields are sent as null (cleared). A blank base price is
// left out so an existing value is not overwritten with an empty string.
const buildServicePayload = (form) => {
    const payload = {
        ...form,
        category_id: form.category_id === "" ? null : form.category_id,
        discount_price: form.discount_price === "" ? null : form.discount_price
    };
    if (payload.base_price === "") delete payload.base_price;
    return payload;
};

// One line showing what buyers will see, so sellers catch price-unit mistakes.
const pricePreview = (form, t) => {
    if (form.base_price === "") return t("seller.serviceForm.previewEmpty");
    const unit = PRICE_UNIT_KEYS[form.pricing_model] ? ` ${t(PRICE_UNIT_KEYS[form.pricing_model])}` : "";
    const fmt = (value) => Number(value).toLocaleString();
    if (form.discount_price !== "") {
        return t("seller.serviceForm.previewDiscount", { price: `${fmt(form.discount_price)}${unit}`, base: fmt(form.base_price) });
    }
    return t("seller.serviceForm.previewPlain", { price: `${fmt(form.base_price)}${unit}` });
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

export default function SellerServiceForm() {
    const { t } = useLanguage();
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();

    const [categories, setCategories] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [media, setMedia] = useState([]);
    const [status, setStatus] = useState("draft");
    const [uploading, setUploading] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [uploadProgress, setUploadProgress] = useState("");
    const [publishing, setPublishing] = useState(false);
    const [confirmNoAvailability, setConfirmNoAvailability] = useState(false);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [savedId, setSavedId] = useState(isEdit ? id : null);

    // Autosave state, same pattern as SellerProductForm.jsx.
    const [dirty, setDirty] = useState(false);
    const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
    const editCount = useRef(0);
    const creatingDraft = useRef(null);

    const isDraft = status === "draft";

    useEffect(() => {
        api.get("/service-categories").then(({ data }) => setCategories(data.data)).catch(() => {});
    }, []);

    useEffect(() => {
        if (!isEdit) return;
        api.get(`/services/mine/${id}`).then(({ data }) => {
            const s = data.data;
            setForm({
                title: s.title || "",
                description: s.description || "",
                category_id: s.category_id || "",
                pricing_model: s.pricing_model || "fixed",
                base_price: s.base_price || "",
                discount_price: s.discount_price || "",
                country: s.country || "",
                region: s.region || "",
                city: s.city || "",
                address: s.address || ""
            });
            setMedia(s.media || []);
            setStatus(s.status || "draft");
            setDirty(false);
        });
    }, [id, isEdit]);

    const markEdited = () => {
        editCount.current += 1;
        setDirty(true);
    };

    const update = (field) => (e) => {
        setForm((f) => ({ ...f, [field]: e.target.value }));
        markEdited();
    };

    // Returns the service id, creating the draft on the first call. Concurrent
    // callers (e.g. a photo pick during the title-blur request) share one request.
    const ensureDraft = async () => {
        if (savedId) return savedId;
        if (creatingDraft.current) return creatingDraft.current;
        creatingDraft.current = api.post("/services/draft", buildServicePayload(form))
            .then(({ data }) => {
                setSavedId(data.data.serviceId);
                setStatus("draft");
                markEdited();
                return data.data.serviceId;
            })
            .finally(() => {
                creatingDraft.current = null;
            });
        return creatingDraft.current;
    };

    const handleTitleBlur = () => {
        if (savedId || form.title.trim().length < 3) return;
        ensureDraft().catch((err) => setError(extractErrorMessage(err)));
    };

    // Autosave drafts 1.5s after the last edit.
    useEffect(() => {
        if (!savedId || !isDraft || !dirty) return undefined;
        const timer = setTimeout(async () => {
            const version = editCount.current;
            setSaveState("saving");
            try {
                await api.put(`/services/${savedId}`, buildServicePayload(form));
                if (editCount.current === version) setDirty(false);
                setSaveState("saved");
            } catch (err) {
                setSaveState("error");
                setError(extractErrorMessage(err));
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [form, savedId, isDraft, dirty]);

    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const serviceId = await ensureDraft();
            await api.put(`/services/${serviceId}`, buildServicePayload(form));
            setDirty(false);
            if (isEdit) {
                navigate("/seller/services");
            } else {
                setSaveState("saved");
            }
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        if (files.length === 0) return;

        setError("");
        let serviceId;
        try {
            serviceId = await ensureDraft();
        } catch (err) {
            setError(extractErrorMessage(err));
            return;
        }

        setUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const label = files.length > 1 ? t("seller.serviceForm.photoNofM", { n: i + 1, total: files.length }) : t("seller.serviceForm.photo");
                setUploadProgress(t("seller.serviceForm.progressPreparing", { label }));
                try {
                    const file = await compressImage(files[i]);
                    const body = new FormData();
                    body.append("image", file);
                    const { data } = await api.post(`/services/${serviceId}/images`, body, {
                        onUploadProgress: (ev) => {
                            if (!ev.total) return;
                            setUploadProgress(t("seller.serviceForm.progressUploading", { label, pct: Math.round((ev.loaded / ev.total) * 100) }));
                        }
                    });
                    setMedia((prev) => [...prev, { media_url: data.data.mediaUrl, media_type: "image", is_primary: data.data.isPrimary }]);
                } catch (err) {
                    // Keep going so one bad file doesn't drop the rest of the batch.
                    setError(t("seller.serviceForm.photoFailed", { label, reason: extractErrorMessage(err) }));
                }
            }
        } finally {
            setUploading(false);
            setUploadProgress("");
        }
    };

    const videoCount = media.filter((m) => m.media_type === "video").length;

    const handleVideoUpload = async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;

        setError("");
        let serviceId;
        try {
            serviceId = await ensureDraft();
        } catch (err) {
            setError(extractErrorMessage(err));
            return;
        }

        setUploadingVideo(true);
        try {
            const body = new FormData();
            body.append("video", file);
            const { data } = await api.post(`/services/${serviceId}/videos`, body);
            setMedia((prev) => [...prev, { media_url: data.data.mediaUrl, media_type: "video" }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingVideo(false);
        }
    };

    // Saves any pending edits so publish works on what the seller sees.
    const flushPendingEdits = async () => {
        if (!dirty || !savedId) return;
        const version = editCount.current;
        await api.put(`/services/${savedId}`, buildServicePayload(form));
        if (editCount.current === version) setDirty(false);
    };

    const doPublish = async () => {
        setPublishing(true);
        setError("");
        try {
            await api.put(`/services/${savedId}/publish`);
            setStatus("published");
            setConfirmNoAvailability(false);
        } catch (err) {
            setError(extractErrorMessage(err));
            setConfirmNoAvailability(false);
        } finally {
            setPublishing(false);
        }
    };

    // Publishing without any availability would leave the listing with no
    // bookable dates, so warn first. The seller can still publish anyway.
    const handlePublishClick = async () => {
        setError("");
        setPublishing(true);
        try {
            await flushPendingEdits();
            const today = new Date();
            const end = new Date(today.getTime() + AVAILABILITY_WINDOW_DAYS * 86400000);
            const { data } = await api.get(`/services/${savedId}/availability`, {
                params: { start_date: toIsoDate(today), end_date: toIsoDate(end) }
            });
            const rows = Array.isArray(data.data) ? data.data : [];
            if (rows.length === 0) {
                setPublishing(false);
                setConfirmNoAvailability(true);
                return;
            }
            setPublishing(false);
            await doPublish();
        } catch (err) {
            setPublishing(false);
            setError(extractErrorMessage(err));
        }
    };

    const images = media.filter((m) => m.media_type !== "video");
    const videos = media.filter((m) => m.media_type === "video");

    return (
        <div className="max-w-lg">
            <PageMeta title={t("seller.serviceForm.metaTitle")} noIndex />
            <h1 className="font-display text-2xl mb-6">{isEdit ? t("seller.serviceForm.editTitle") : t("seller.serviceForm.newTitle")}</h1>

            {status === "suspended" && (
                <p role="alert" className="text-coral text-sm mb-6">
                    {t("seller.serviceForm.suspended")}
                </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label={t("seller.serviceForm.titleLabel")}
                    required minLength={3} value={form.title} onChange={update("title")}
                    onBlur={handleTitleBlur}
                />

                <div>
                    <Input
                        as="textarea"
                        label={t("seller.serviceForm.description")}
                        rows={4} value={form.description} onChange={update("description")}
                    />
                    <NexoraCopyAssist
                        mode="service"
                        name={form.title}
                        category={categories.find((c) => String(c.id) === String(form.category_id))?.name}
                        onApply={(description) => {
                            setForm((f) => ({ ...f, description }));
                            markEdited();
                        }}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="serviceCategory" className="block text-sm mb-1">{t("seller.serviceForm.category")}</label>
                        <select id="serviceCategory" value={form.category_id} onChange={update("category_id")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper">
                            <option value="">{t("seller.serviceForm.select")}</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="servicePricingModel" className="block text-sm mb-1">{t("seller.serviceForm.pricingModel")}</label>
                        <select id="servicePricingModel" value={form.pricing_model} onChange={update("pricing_model")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper">
                            {PRICING_MODELS.map((p) => (
                                <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label={t("seller.serviceForm.basePrice")}
                        type="number" min="0" step="0.01" value={form.base_price} onChange={update("base_price")}
                        className="price"
                    />
                    <Input
                        label={t("seller.serviceForm.discountPrice")}
                        type="number" min="0" step="0.01" value={form.discount_price} onChange={update("discount_price")}
                        className="price"
                    />
                </div>
                <p className="text-xs text-ash -mt-2" aria-live="polite">{pricePreview(form, t)}</p>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label={t("seller.serviceForm.city")}
                        value={form.city} onChange={update("city")}
                    />
                    <Input
                        label={t("seller.serviceForm.region")}
                        value={form.region} onChange={update("region")}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label={t("seller.serviceForm.country")}
                        value={form.country} onChange={update("country")}
                    />
                    <Input
                        label={t("seller.serviceForm.address")}
                        value={form.address} onChange={update("address")}
                    />
                </div>

                <div className="flex items-center justify-between gap-3">
                    <Button type="submit" disabled={submitting || uploading}>
                        {submitting ? t("seller.serviceForm.saving") : isEdit ? t("seller.serviceForm.saveChanges") : t("seller.serviceForm.saveDetails")}
                    </Button>
                    {savedId && (
                        <span role="status" className="text-xs text-ash">
                            {dirty && saveState !== "saving" ? t("seller.serviceForm.unsaved")
                                : saveState === "saving" ? t("seller.serviceForm.savingDraft")
                                : saveState === "error" ? t("seller.serviceForm.saveDraftFailed")
                                : isDraft ? t("seller.serviceForm.draftSaved") : ""}
                        </span>
                    )}
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}
            </form>

            {!savedId && (
                <p className="mt-10 border-t border-line pt-6 text-ash text-sm">
                    {t("seller.serviceForm.startDraft")}
                </p>
            )}

            {savedId && (
                <div className="mt-10 border-t border-line pt-6">
                    {isDraft && (
                        <p className="text-teal text-sm mb-6 -mt-2">
                            {t("seller.serviceForm.draftHidden")}
                        </p>
                    )}

                    <h2 className="font-display text-lg mb-1">{t("seller.serviceForm.photos")}</h2>
                    <p className="text-xs text-ash mb-3">{t("seller.serviceForm.resizeNote")}</p>

                    <div className="flex flex-wrap gap-3 mb-4">
                        {images.map((img, i) => (
                            <div key={i} className="w-20 h-20 rounded-md overflow-hidden border border-line relative">
                                <img src={img.media_url} alt="" className="w-full h-full object-cover" />
                                {img.is_primary && (
                                    <span className="absolute top-1 left-1 text-[10px] font-medium bg-mango text-abyss rounded-full px-1.5 py-0.5">
                                        {t("seller.serviceForm.primary")}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                            {uploading ? t("seller.serviceForm.uploading") : t("seller.serviceForm.choosePhotos")}
                            <input type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} className="hidden" />
                        </label>
                        <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                            {t("seller.serviceForm.takePhoto")}
                            <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} disabled={uploading} className="hidden" />
                        </label>
                    </div>
                    {uploadProgress && <p role="status" className="text-sm text-ash mt-2">{uploadProgress}</p>}

                    <h2 className="font-display text-lg mb-3 mt-8">{t("seller.serviceForm.videos")}</h2>

                    <div className="flex flex-wrap gap-3 mb-4">
                        {videos.map((vid, i) => (
                            // eslint-disable-next-line jsx-a11y/media-has-caption -- seller-uploaded service clip, no caption track available
                            <video key={i} src={vid.media_url} controls
                                className="w-40 h-24 rounded-md border border-line object-cover" />
                        ))}
                    </div>

                    {videoCount < MAX_VIDEOS ? (
                        <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                            {uploadingVideo ? t("seller.serviceForm.uploading") : t("seller.serviceForm.addVideo")}
                            <input type="file" accept="video/*" onChange={handleVideoUpload} disabled={uploadingVideo} className="hidden" />
                        </label>
                    ) : (
                        <p className="text-ash text-xs">{t("seller.serviceForm.maxVideos", { max: MAX_VIDEOS })}</p>
                    )}

                    <div className="mt-8 border-t border-line pt-6 flex items-center gap-4">
                        {status === "published" ? (
                            <p className="text-sm text-teal font-medium">{t("seller.serviceForm.published")}</p>
                        ) : (
                            <button
                                type="button"
                                onClick={handlePublishClick}
                                disabled={publishing || uploading || images.length === 0 || status === "suspended"}
                                className="bg-teal text-frost px-6 py-2.5 rounded-md font-medium hover:opacity-90 transition-opacity focus-ring disabled:opacity-50"
                            >
                                {publishing ? t("seller.serviceForm.publishing") : t("seller.serviceForm.publish")}
                            </button>
                        )}
                    </div>

                    {status !== "published" && images.length === 0 && (
                        <p className="text-ash text-xs mt-2">{t("seller.serviceForm.needPhoto")}</p>
                    )}

                    {!isEdit && (
                        <p className="mt-6">
                            <Link to="/seller/services" className="text-teal text-sm hover:underline">
                                {t("seller.serviceForm.backToServices")}
                            </Link>
                        </p>
                    )}
                </div>
            )}

            <ConfirmDialog
                open={confirmNoAvailability}
                title={t("seller.serviceForm.noAvailTitle")}
                description={t("seller.serviceForm.noAvailBody")}
                confirmLabel={t("seller.serviceForm.publishAnyway")}
                onConfirm={doPublish}
                onCancel={() => setConfirmNoAvailability(false)}
            />
        </div>
    );
}
