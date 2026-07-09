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
    const [uploading, setUploading] = useState(false);
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
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-white">
                            <option value="new">New</option>
                            <option value="used">Used</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Category</label>
                        <select required value={form.category_id} onChange={update("category_id")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-white">
                            <option value="">Select…</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && <p className="text-coral text-sm">{error}</p>}

                <button type="submit" disabled={submitting}
                    className="bg-mango text-ink px-6 py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
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
