import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import NexoraCopyAssist from "../../components/ai/NexoraCopyAssist";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import ConfirmDialog from "../../components/ConfirmDialog";
import Input from "../../components/ui/Input";
import { compressImage } from "../../utils/imageCompression";

const PRICING_MODELS = [
    { value: "fixed", label: "Fixed price" },
    { value: "per_night", label: "Per night" },
    { value: "per_hour", label: "Per hour" },
    { value: "per_day", label: "Per day" },
    { value: "per_person", label: "Per person" }
];

const PRICE_UNIT = {
    fixed: "",
    per_night: " per night",
    per_hour: " per hour",
    per_day: " per day",
    per_person: " per person"
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
const pricePreview = (form) => {
    if (form.base_price === "") return "Enter a base price to see how buyers will see it.";
    const unit = PRICE_UNIT[form.pricing_model] ?? "";
    const fmt = (value) => Number(value).toLocaleString();
    if (form.discount_price !== "") {
        return `Buyers see ${fmt(form.discount_price)}${unit}, down from ${fmt(form.base_price)}.`;
    }
    return `Buyers see ${fmt(form.base_price)}${unit}.`;
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

export default function SellerServiceForm() {
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
                const label = files.length > 1 ? `Photo ${i + 1} of ${files.length}` : "Photo";
                setUploadProgress(`${label}: preparing…`);
                try {
                    const file = await compressImage(files[i]);
                    const body = new FormData();
                    body.append("image", file);
                    const { data } = await api.post(`/services/${serviceId}/images`, body, {
                        onUploadProgress: (ev) => {
                            if (!ev.total) return;
                            setUploadProgress(`${label}: uploading ${Math.round((ev.loaded / ev.total) * 100)}%`);
                        }
                    });
                    setMedia((prev) => [...prev, { media_url: data.data.mediaUrl, media_type: "image", is_primary: data.data.isPrimary }]);
                } catch (err) {
                    // Keep going so one bad file doesn't drop the rest of the batch.
                    setError(`${label} failed: ${extractErrorMessage(err)}`);
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
            <PageMeta title="Service Form" noIndex />
            <h1 className="font-display text-2xl mb-6">{isEdit ? "Edit service" : "List a new service"}</h1>

            {status === "suspended" && (
                <p role="alert" className="text-coral text-sm mb-6">
                    This listing is suspended by Nexora and can't be published. Contact support for details.
                </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Title"
                    required minLength={3} value={form.title} onChange={update("title")}
                    onBlur={handleTitleBlur}
                />

                <div>
                    <Input
                        as="textarea"
                        label="Description"
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
                        <label htmlFor="serviceCategory" className="block text-sm mb-1">Category</label>
                        <select id="serviceCategory" value={form.category_id} onChange={update("category_id")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper">
                            <option value="">Select…</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="servicePricingModel" className="block text-sm mb-1">Pricing model</label>
                        <select id="servicePricingModel" value={form.pricing_model} onChange={update("pricing_model")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper">
                            {PRICING_MODELS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="Base price"
                        type="number" min="0" step="0.01" value={form.base_price} onChange={update("base_price")}
                        className="price"
                    />
                    <Input
                        label="Discount price (optional)"
                        type="number" min="0" step="0.01" value={form.discount_price} onChange={update("discount_price")}
                        className="price"
                    />
                </div>
                <p className="text-xs text-ash -mt-2" aria-live="polite">{pricePreview(form)}</p>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="City"
                        value={form.city} onChange={update("city")}
                    />
                    <Input
                        label="Region"
                        value={form.region} onChange={update("region")}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="Country"
                        value={form.country} onChange={update("country")}
                    />
                    <Input
                        label="Address (optional)"
                        value={form.address} onChange={update("address")}
                    />
                </div>

                <div className="flex items-center justify-between gap-3">
                    <Button type="submit" disabled={submitting || uploading}>
                        {submitting ? "Saving…" : isEdit ? "Save changes" : "Save details"}
                    </Button>
                    {savedId && (
                        <span role="status" className="text-xs text-ash">
                            {dirty && saveState !== "saving" ? "Unsaved changes"
                                : saveState === "saving" ? "Saving draft…"
                                : saveState === "error" ? "Couldn't save draft"
                                : isDraft ? "Draft saved" : ""}
                        </span>
                    )}
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}
            </form>

            {!savedId && (
                <p className="mt-10 border-t border-line pt-6 text-ash text-sm">
                    Enter a service title to start your draft. Photos and videos unlock once it's saved.
                </p>
            )}

            {savedId && (
                <div className="mt-10 border-t border-line pt-6">
                    {isDraft && (
                        <p className="text-teal text-sm mb-6 -mt-2">
                            Draft saved and hidden from buyers. Add photos, then publish below.
                        </p>
                    )}

                    <h2 className="font-display text-lg mb-1">Photos</h2>
                    <p className="text-xs text-ash mb-3">Large photos are resized on your device before upload.</p>

                    <div className="flex flex-wrap gap-3 mb-4">
                        {images.map((img, i) => (
                            <div key={i} className="w-20 h-20 rounded-md overflow-hidden border border-line relative">
                                <img src={img.media_url} alt="" className="w-full h-full object-cover" />
                                {img.is_primary && (
                                    <span className="absolute top-1 left-1 text-[10px] font-medium bg-mango text-abyss rounded-full px-1.5 py-0.5">
                                        Primary
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                            {uploading ? "Uploading…" : "+ Choose photos"}
                            <input type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} className="hidden" />
                        </label>
                        <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                            Take photo
                            <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} disabled={uploading} className="hidden" />
                        </label>
                    </div>
                    {uploadProgress && <p role="status" className="text-sm text-ash mt-2">{uploadProgress}</p>}

                    <h2 className="font-display text-lg mb-3 mt-8">Videos</h2>

                    <div className="flex flex-wrap gap-3 mb-4">
                        {videos.map((vid, i) => (
                            // eslint-disable-next-line jsx-a11y/media-has-caption -- seller-uploaded service clip, no caption track available
                            <video key={i} src={vid.media_url} controls
                                className="w-40 h-24 rounded-md border border-line object-cover" />
                        ))}
                    </div>

                    {videoCount < MAX_VIDEOS ? (
                        <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                            {uploadingVideo ? "Uploading…" : "+ Add video"}
                            <input type="file" accept="video/*" onChange={handleVideoUpload} disabled={uploadingVideo} className="hidden" />
                        </label>
                    ) : (
                        <p className="text-ash text-xs">Maximum of {MAX_VIDEOS} videos per service.</p>
                    )}

                    <div className="mt-8 border-t border-line pt-6 flex items-center gap-4">
                        {status === "published" ? (
                            <p className="text-sm text-teal font-medium">✓ Published — visible in the marketplace</p>
                        ) : (
                            <button
                                type="button"
                                onClick={handlePublishClick}
                                disabled={publishing || uploading || images.length === 0 || status === "suspended"}
                                className="bg-teal text-frost px-6 py-2.5 rounded-md font-medium hover:opacity-90 transition-opacity focus-ring disabled:opacity-50"
                            >
                                {publishing ? "Publishing…" : "Publish service"}
                            </button>
                        )}
                    </div>

                    {status !== "published" && images.length === 0 && (
                        <p className="text-ash text-xs mt-2">Add at least one photo before publishing.</p>
                    )}

                    {!isEdit && (
                        <p className="mt-6">
                            <Link to="/seller/services" className="text-teal text-sm hover:underline">
                                Done — back to your services
                            </Link>
                        </p>
                    )}
                </div>
            )}

            <ConfirmDialog
                open={confirmNoAvailability}
                title="Publish without availability?"
                description="Buyers can't book dates until you add availability. You can add it later from the Availability page."
                confirmLabel="Publish anyway"
                onConfirm={doPublish}
                onCancel={() => setConfirmNoAvailability(false)}
            />
        </div>
    );
}
