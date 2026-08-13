import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import NexoraCopyAssist from "../../components/ai/NexoraCopyAssist";
import Button from "../../components/ui/Button";

const PRICING_MODELS = [
    { value: "fixed", label: "Fixed price" },
    { value: "per_night", label: "Per night" },
    { value: "per_hour", label: "Per hour" },
    { value: "per_day", label: "Per day" },
    { value: "per_person", label: "Per person" }
];

const emptyForm = {
    title: "", description: "", category_id: "", pricing_model: "fixed",
    base_price: "", discount_price: "",
    country: "", region: "", city: "", address: ""
};

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
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [savedId, setSavedId] = useState(isEdit ? id : null);

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
        });
    }, [id, isEdit]);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            if (isEdit) {
                await api.put(`/services/${id}`, form);
                navigate("/seller/services");
            } else {
                const { data } = await api.post("/services", form);
                setSavedId(data.data.serviceId);
            }
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !savedId) return;

        setUploading(true);
        setError("");
        try {
            const body = new FormData();
            body.append("image", file);
            const { data } = await api.post(`/services/${savedId}/images`, body);
            setMedia([...media, { media_url: data.data.mediaUrl, media_type: "image", is_primary: data.data.isPrimary }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    // Kept in sync with the backend's MAX_VIDEOS_PER_SERVICE
    // (service.service.js), same reasoning as SellerProductForm.jsx.
    const MAX_VIDEOS = 3;
    const videoCount = media.filter((m) => m.media_type === "video").length;

    const handleVideoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !savedId) return;

        setUploadingVideo(true);
        setError("");
        try {
            const body = new FormData();
            body.append("video", file);
            const { data } = await api.post(`/services/${savedId}/videos`, body);
            setMedia([...media, { media_url: data.data.mediaUrl, media_type: "video" }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingVideo(false);
            e.target.value = "";
        }
    };

    const handlePublish = async () => {
        setPublishing(true);
        setError("");
        try {
            await api.put(`/services/${savedId}/publish`);
            setStatus("published");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setPublishing(false);
        }
    };

    const images = media.filter((m) => m.media_type !== "video");
    const videos = media.filter((m) => m.media_type === "video");

    return (
        <div className="max-w-lg">
            <h1 className="font-display text-2xl mb-6">{isEdit ? "Edit service" : "List a new service"}</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm mb-1">Title</label>
                    <input required minLength={3} value={form.title} onChange={update("title")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">Description</label>
                    <textarea rows={4} value={form.description} onChange={update("description")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <NexoraCopyAssist
                        mode="service"
                        name={form.title}
                        category={categories.find((c) => String(c.id) === String(form.category_id))?.name}
                        onApply={(description) => setForm((f) => ({ ...f, description }))}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">Category</label>
                        <select value={form.category_id} onChange={update("category_id")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                            <option value="">Select…</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Pricing model</label>
                        <select value={form.pricing_model} onChange={update("pricing_model")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                            {PRICING_MODELS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">Base price</label>
                        <input required type="number" min="0" step="0.01" value={form.base_price} onChange={update("base_price")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring price" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Discount price (optional)</label>
                        <input type="number" min="0" step="0.01" value={form.discount_price} onChange={update("discount_price")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring price" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">City</label>
                        <input value={form.city} onChange={update("city")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Region</label>
                        <input value={form.region} onChange={update("region")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">Country</label>
                        <input value={form.country} onChange={update("country")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Address (optional)</label>
                        <input value={form.address} onChange={update("address")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : isEdit ? "Save changes" : "Create service"}
                </Button>
            </form>

            {savedId && (
                <div className="mt-10 border-t border-line pt-6">
                    <h2 className="font-display text-lg mb-3">Photos</h2>

                    <div className="flex flex-wrap gap-3 mb-4">
                        {images.map((img, i) => (
                            <div key={i} className="w-20 h-20 rounded-md overflow-hidden border border-line">
                                <img src={img.media_url} alt="" className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>

                    <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                        {uploading ? "Uploading…" : "+ Add photo"}
                        <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="hidden" />
                    </label>

                    <h2 className="font-display text-lg mb-3 mt-8">Videos</h2>

                    <div className="flex flex-wrap gap-3 mb-4">
                        {videos.map((vid, i) => (
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
                                onClick={handlePublish}
                                disabled={publishing || images.length === 0}
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
        </div>
    );
}
