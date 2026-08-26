import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import NexoraCopyAssist from "../../components/ai/NexoraCopyAssist";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import ConfirmDialog from "../../components/ConfirmDialog";

const emptyForm = {
    name: "", description: "", price: "", discount_price: "",
    stock: "", brand: "", product_condition: "new", category_id: ""
};

// Swaps the item at `index` with its neighbour in `direction` ("up"/"down")
// and returns a new array - used by the photo/video/audio reorder controls
// below. No-op (returns the same array) at either end of the list.
const swapWithNeighbour = (list, index, direction) => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
};

export default function SellerProductForm() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();

    const [categories, setCategories] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [images, setImages] = useState([]);
    const [videos, setVideos] = useState([]);
    const [audio, setAudio] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [uploadingAudio, setUploadingAudio] = useState(false);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [savedId, setSavedId] = useState(isEdit ? id : null);

    // Tracks which single media row (e.g. "image-12") is mid-request, so
    // only that row's controls disable during a delete/reorder/set-primary
    // call instead of locking the whole media section.
    const [mediaBusyKey, setMediaBusyKey] = useState(null);
    // { type: "image" | "video" | "audio", id } of the row pending delete
    // confirmation, or null when the ConfirmDialog is closed.
    const [pendingDelete, setPendingDelete] = useState(null);

    useEffect(() => {
        api.get("/categories").then(({ data }) => setCategories(data.data)).catch(() => {});
    }, []);

    useEffect(() => {
        if (!isEdit) return;
        api.get(`/products/mine/${id}`).then(({ data }) => {
            const p = data.data;
            setForm({
                name: p.name || "",
                description: p.description || "",
                price: p.price || "",
                discount_price: p.discount_price || "",
                stock: p.stock ?? "",
                brand: p.brand || "",
                product_condition: p.product_condition || "new",
                category_id: p.category_id || ""
            });
            setImages(p.images || []);
            setVideos(p.videos || []);
            setAudio(p.audio || []);
        });
    }, [id, isEdit]);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            if (isEdit) {
                await api.put(`/products/${id}`, form);
                navigate("/seller/products");
            } else {
                const { data } = await api.post("/products", form);
                setSavedId(data.data.productId);
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
            const { data } = await api.post(`/products/${savedId}/images`, body);
            setImages([...images, { id: data.data.id, image_url: data.data.imageUrl, is_primary: data.data.isPrimary }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const handleDeleteImage = async (imageId) => {
        setMediaBusyKey(`image-${imageId}`);
        setError("");
        try {
            await api.delete(`/products/${savedId}/images/${imageId}`);
            setImages((prev) => {
                const wasPrimary = prev.find((img) => img.id === imageId)?.is_primary;
                const remaining = prev.filter((img) => img.id !== imageId);
                // Mirrors the backend's own fallback (promoteEarliestImageToPrimary)
                // so the UI doesn't wait on a refetch to show the new primary photo.
                if (wasPrimary && remaining.length > 0 && !remaining.some((img) => img.is_primary)) {
                    remaining[0] = { ...remaining[0], is_primary: true };
                }
                return remaining;
            });
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setMediaBusyKey(null);
            setPendingDelete(null);
        }
    };

    const handleSetPrimaryImage = async (imageId) => {
        setMediaBusyKey(`image-${imageId}`);
        setError("");
        try {
            await api.put(`/products/${savedId}/images/${imageId}/primary`);
            setImages((prev) => prev.map((img) => ({ ...img, is_primary: img.id === imageId })));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setMediaBusyKey(null);
        }
    };

    const handleMoveImage = async (index, direction) => {
        const reordered = swapWithNeighbour(images, index, direction);
        if (reordered === images) return;
        setImages(reordered);
        setMediaBusyKey(`image-${images[index].id}`);
        setError("");
        try {
            await api.put(`/products/${savedId}/images/reorder`, { ids: reordered.map((img) => img.id) });
        } catch (err) {
            setImages(images);
            setError(extractErrorMessage(err));
        } finally {
            setMediaBusyKey(null);
        }
    };

    // Kept in sync with the backend's MAX_VIDEOS_PER_PRODUCT
    // (product.service.js) so the "+ Add video" control disappears
    // instead of letting a seller pick a file only to have it rejected.
    const MAX_VIDEOS = 3;

    const handleVideoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !savedId) return;

        setUploadingVideo(true);
        setError("");
        try {
            const body = new FormData();
            body.append("video", file);
            const { data } = await api.post(`/products/${savedId}/videos`, body);
            setVideos([...videos, { id: data.data.id, video_url: data.data.videoUrl }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingVideo(false);
            e.target.value = "";
        }
    };

    const handleDeleteVideo = async (videoId) => {
        setMediaBusyKey(`video-${videoId}`);
        setError("");
        try {
            await api.delete(`/products/${savedId}/videos/${videoId}`);
            setVideos((prev) => prev.filter((vid) => vid.id !== videoId));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setMediaBusyKey(null);
            setPendingDelete(null);
        }
    };

    const handleMoveVideo = async (index, direction) => {
        const reordered = swapWithNeighbour(videos, index, direction);
        if (reordered === videos) return;
        setVideos(reordered);
        setMediaBusyKey(`video-${videos[index].id}`);
        setError("");
        try {
            await api.put(`/products/${savedId}/videos/reorder`, { ids: reordered.map((vid) => vid.id) });
        } catch (err) {
            setVideos(videos);
            setError(extractErrorMessage(err));
        } finally {
            setMediaBusyKey(null);
        }
    };

    // Kept in sync with the backend's MAX_AUDIO_PER_PRODUCT
    // (product.service.js), same reasoning as MAX_VIDEOS above.
    const MAX_AUDIO = 3;

    const handleAudioUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !savedId) return;

        setUploadingAudio(true);
        setError("");
        try {
            const body = new FormData();
            body.append("audio", file);
            const { data } = await api.post(`/products/${savedId}/audio`, body);
            setAudio([...audio, { id: data.data.id, audio_url: data.data.audioUrl }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingAudio(false);
            e.target.value = "";
        }
    };

    const handleDeleteAudio = async (audioId) => {
        setMediaBusyKey(`audio-${audioId}`);
        setError("");
        try {
            await api.delete(`/products/${savedId}/audio/${audioId}`);
            setAudio((prev) => prev.filter((clip) => clip.id !== audioId));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setMediaBusyKey(null);
            setPendingDelete(null);
        }
    };

    const handleMoveAudio = async (index, direction) => {
        const reordered = swapWithNeighbour(audio, index, direction);
        if (reordered === audio) return;
        setAudio(reordered);
        setMediaBusyKey(`audio-${audio[index].id}`);
        setError("");
        try {
            await api.put(`/products/${savedId}/audio/reorder`, { ids: reordered.map((clip) => clip.id) });
        } catch (err) {
            setAudio(audio);
            setError(extractErrorMessage(err));
        } finally {
            setMediaBusyKey(null);
        }
    };

    const confirmPendingDelete = () => {
        if (!pendingDelete) return;
        if (pendingDelete.type === "image") handleDeleteImage(pendingDelete.id);
        else if (pendingDelete.type === "video") handleDeleteVideo(pendingDelete.id);
        else if (pendingDelete.type === "audio") handleDeleteAudio(pendingDelete.id);
    };

    return (
        <div className="max-w-lg">
            <PageMeta title="Product Form" noIndex />
            <h1 className={`font-display text-2xl ${isEdit ? "mb-6" : "mb-1"}`}>{isEdit ? "Edit product" : "List a new product"}</h1>
            {!isEdit && (
                <p className="text-ash text-sm mb-6">
                    Listing a product is two steps: save the details below first, then add photos, videos, and
                    audio once the product exists.
                </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm mb-1">Product name</label>
                    <input required minLength={3} value={form.name} onChange={update("name")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">Description</label>
                    <textarea rows={4} value={form.description} onChange={update("description")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <NexoraCopyAssist
                        mode="product"
                        name={form.name}
                        category={categories.find((c) => String(c.id) === String(form.category_id))?.name}
                        onApply={(description) => setForm((f) => ({ ...f, description }))}
                    />
                    <div className="mt-2">
                        <NexoraCopyAssist mode="marketing" name={form.name} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">Price</label>
                        <input required type="number" min="0" step="0.01" value={form.price} onChange={update("price")}
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
                        <label className="block text-sm mb-1">Stock</label>
                        <input type="number" min="0" value={form.stock} onChange={update("stock")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Brand (optional)</label>
                        <input value={form.brand} onChange={update("brand")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">Condition</label>
                        <select value={form.product_condition} onChange={update("product_condition")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                            <option value="new">New</option>
                            <option value="used">Used</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Category</label>
                        <select required value={form.category_id} onChange={update("category_id")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                            <option value="">Select…</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : isEdit ? "Save changes" : "Create product"}
                </Button>
            </form>

            {savedId && (
                <div className="mt-10 border-t border-line pt-6">
                    {!isEdit && (
                        <p className="text-teal text-sm mb-6 -mt-2">
                            Product saved — now add photos, videos, and audio below. You can come back and edit
                            these anytime from your product list.
                        </p>
                    )}

                    <h2 className="font-display text-lg mb-3">Photos</h2>

                    <div className="flex flex-wrap gap-3 mb-4">
                        {images.map((img, i) => {
                            const busy = mediaBusyKey === `image-${img.id}`;
                            return (
                                <div key={img.id} className="w-24">
                                    <div className="relative w-24 h-24 rounded-md overflow-hidden border border-line group">
                                        <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                                        {img.is_primary && (
                                            <span className="absolute top-1 left-1 text-[10px] font-medium bg-mango text-abyss rounded-full px-1.5 py-0.5">
                                                Primary
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setPendingDelete({ type: "image", id: img.id })}
                                            disabled={busy}
                                            aria-label="Remove photo"
                                            title="Remove photo"
                                            className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-abyss/60 text-frost text-xs hover:bg-coral disabled:opacity-50 transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <button
                                            type="button"
                                            onClick={() => handleMoveImage(i, "up")}
                                            disabled={busy || i === 0}
                                            aria-label="Move photo earlier"
                                            title="Move earlier"
                                            className="text-ash hover:text-ink text-xs disabled:opacity-30 disabled:hover:text-ash px-1"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetPrimaryImage(img.id)}
                                            disabled={busy || img.is_primary}
                                            aria-label="Set as primary photo"
                                            title="Set as primary photo"
                                            className="text-ash hover:text-mango-dark text-xs disabled:opacity-30 disabled:hover:text-ash px-1"
                                        >
                                            {img.is_primary ? "★" : "☆"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMoveImage(i, "down")}
                                            disabled={busy || i === images.length - 1}
                                            aria-label="Move photo later"
                                            title="Move later"
                                            className="text-ash hover:text-ink text-xs disabled:opacity-30 disabled:hover:text-ash px-1"
                                        >
                                            ↓
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                        {uploading ? "Uploading…" : "+ Add photo"}
                        <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="hidden" />
                    </label>

                    <h2 className="font-display text-lg mb-3 mt-8">Videos</h2>

                    <div className="flex flex-col gap-3 mb-4">
                        {videos.map((vid, i) => {
                            const busy = mediaBusyKey === `video-${vid.id}`;
                            return (
                                <div key={vid.id} className="flex items-center gap-2">
                                    <video src={vid.video_url} controls
                                        className="w-40 h-24 rounded-md border border-line object-cover" />
                                    <div className="flex flex-col gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleMoveVideo(i, "up")}
                                            disabled={busy || i === 0}
                                            aria-label="Move video earlier"
                                            title="Move earlier"
                                            className="text-ash hover:text-ink text-xs disabled:opacity-30 disabled:hover:text-ash px-1"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMoveVideo(i, "down")}
                                            disabled={busy || i === videos.length - 1}
                                            aria-label="Move video later"
                                            title="Move later"
                                            className="text-ash hover:text-ink text-xs disabled:opacity-30 disabled:hover:text-ash px-1"
                                        >
                                            ↓
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPendingDelete({ type: "video", id: vid.id })}
                                        disabled={busy}
                                        aria-label="Remove video"
                                        title="Remove video"
                                        className="text-ash hover:text-coral text-xs px-1 disabled:opacity-50"
                                    >
                                        ✕
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {videos.length < MAX_VIDEOS ? (
                        <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                            {uploadingVideo ? "Uploading…" : "+ Add video"}
                            <input type="file" accept="video/*" onChange={handleVideoUpload} disabled={uploadingVideo} className="hidden" />
                        </label>
                    ) : (
                        <p className="text-ash text-xs">Maximum of {MAX_VIDEOS} videos per product.</p>
                    )}

                    <h2 className="font-display text-lg mb-3 mt-8">Audio</h2>

                    <div className="flex flex-col gap-2 mb-4">
                        {audio.map((clip, i) => {
                            const busy = mediaBusyKey === `audio-${clip.id}`;
                            return (
                                <div key={clip.id} className="flex items-center gap-2">
                                    <audio src={clip.audio_url} controls className="flex-1" />
                                    <button
                                        type="button"
                                        onClick={() => handleMoveAudio(i, "up")}
                                        disabled={busy || i === 0}
                                        aria-label="Move audio earlier"
                                        title="Move earlier"
                                        className="text-ash hover:text-ink text-xs disabled:opacity-30 disabled:hover:text-ash px-1"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleMoveAudio(i, "down")}
                                        disabled={busy || i === audio.length - 1}
                                        aria-label="Move audio later"
                                        title="Move later"
                                        className="text-ash hover:text-ink text-xs disabled:opacity-30 disabled:hover:text-ash px-1"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPendingDelete({ type: "audio", id: clip.id })}
                                        disabled={busy}
                                        aria-label="Remove audio"
                                        title="Remove audio"
                                        className="text-ash hover:text-coral text-xs px-1 disabled:opacity-50"
                                    >
                                        ✕
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {audio.length < MAX_AUDIO ? (
                        <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                            {uploadingAudio ? "Uploading…" : "+ Add audio"}
                            <input type="file" accept="audio/*" onChange={handleAudioUpload} disabled={uploadingAudio} className="hidden" />
                        </label>
                    ) : (
                        <p className="text-ash text-xs">Maximum of {MAX_AUDIO} audio clips per product.</p>
                    )}

                    {!isEdit && (
                        <p className="mt-6">
                            <Link to="/seller/products" className="text-teal text-sm hover:underline">
                                Done — back to your products
                            </Link>
                        </p>
                    )}
                </div>
            )}

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={pendingDelete?.type === "image" ? "Remove this photo?" : pendingDelete?.type === "video" ? "Remove this video?" : "Remove this audio clip?"}
                description="This can't be undone."
                confirmLabel="Remove"
                cancelLabel="Cancel"
                danger
                onConfirm={confirmPendingDelete}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
}
