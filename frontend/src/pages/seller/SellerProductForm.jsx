import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";

const emptyForm = {
    name: "", description: "", price: "", discount_price: "",
    stock: "", brand: "", product_condition: "new", category_id: ""
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
            setImages([...images, { image_url: data.data.imageUrl, is_primary: data.data.isPrimary }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploading(false);
            e.target.value = "";
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
            setVideos([...videos, { video_url: data.data.videoUrl }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingVideo(false);
            e.target.value = "";
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
            setAudio([...audio, { audio_url: data.data.audioUrl }]);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingAudio(false);
            e.target.value = "";
        }
    };

    return (
        <div className="max-w-lg">
            <h1 className="font-display text-2xl mb-6">{isEdit ? "Edit product" : "List a new product"}</h1>

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

                <button type="submit" disabled={submitting}
                    className="bg-mango text-abyss px-6 py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                    {submitting ? "Saving…" : isEdit ? "Save changes" : "Create product"}
                </button>
            </form>

            {savedId && (
                <div className="mt-10 border-t border-line pt-6">
                    <h2 className="font-display text-lg mb-3">Photos</h2>

                    <div className="flex flex-wrap gap-3 mb-4">
                        {images.map((img, i) => (
                            <div key={i} className="w-20 h-20 rounded-md overflow-hidden border border-line">
                                <img src={img.image_url} alt="" className="w-full h-full object-cover" />
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
                            <video key={i} src={vid.video_url} controls
                                className="w-40 h-24 rounded-md border border-line object-cover" />
                        ))}
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
                        {audio.map((clip, i) => (
                            <audio key={i} src={clip.audio_url} controls className="w-full" />
                        ))}
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
        </div>
    );
}
