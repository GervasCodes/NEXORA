import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";

// Phase 7C - Seller Collections. Lets a seller group their own products
// into named shelves (e.g. "New Arrivals", "Bestsellers") that show up
// as their own row on the public store page (see StorePage.jsx). Follows
// SellerDeliveryTeam.jsx's existing shape for "a seller's own roster of
// something": a create form, a list with a remove/delete action, and the
// same loading/error/busyId conventions - applied here to two levels
// (collections themselves, then products within a selected collection)
// instead of one.
export default function SellerCollections() {
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    const [selectedId, setSelectedId] = useState(null);
    const [collectionProducts, setCollectionProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [myProducts, setMyProducts] = useState([]);
    const [addProductId, setAddProductId] = useState("");
    const [addingProduct, setAddingProduct] = useState(false);
    const [busyProductId, setBusyProductId] = useState(null);

    const loadCollections = () => {
        api.get("/seller/collections")
            .then(({ data }) => setCollections(data.data))
            .finally(() => setLoading(false));
    };

    useEffect(loadCollections, []);

    // The full catalog, fetched once - used to populate the "add a
    // product" dropdown for whichever collection is selected below.
    useEffect(() => {
        api.get("/products/mine/list").then(({ data }) => setMyProducts(data.data));
    }, []);

    const loadCollectionProducts = (collectionId) => {
        setProductsLoading(true);
        api.get(`/seller/collections/${collectionId}/products`)
            .then(({ data }) => setCollectionProducts(data.data))
            .catch(() => setCollectionProducts([]))
            .finally(() => setProductsLoading(false));
    };

    const handleSelect = (collectionId) => {
        setSelectedId(collectionId);
        setAddProductId("");
        setError("");
        loadCollectionProducts(collectionId);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        try {
            await api.post("/seller/collections", { name });
            setName("");
            loadCollections();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteCollection = async (collectionId) => {
        setBusyId(collectionId);
        setError("");
        try {
            await api.delete(`/seller/collections/${collectionId}`);
            if (selectedId === collectionId) {
                setSelectedId(null);
                setCollectionProducts([]);
            }
            loadCollections();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const handleAddProduct = async (e) => {
        e.preventDefault();
        if (!addProductId) return;

        setAddingProduct(true);
        setError("");
        try {
            await api.post(`/seller/collections/${selectedId}/products`, { product_id: addProductId });
            setAddProductId("");
            loadCollectionProducts(selectedId);
            loadCollections();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setAddingProduct(false);
        }
    };

    const handleRemoveProduct = async (productId) => {
        setBusyProductId(productId);
        setError("");
        try {
            await api.delete(`/seller/collections/${selectedId}/products/${productId}`);
            loadCollectionProducts(selectedId);
            loadCollections();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyProductId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading your collections…</p>;

    // Only products not already in the selected collection are offered -
    // there's no point letting a seller pick one that's already there
    // when the API would just reject it as a duplicate anyway.
    const availableProducts = myProducts.filter(
        (p) => !collectionProducts.some((cp) => cp.id === p.id)
    );

    return (
        <div>
            <h1 className="font-display text-2xl mb-2">Collections</h1>
            <p className="text-sm text-ash mb-6">
                Group your products into named shelves - like "New Arrivals" or
                "Bestsellers" - that show up as their own row on your store page.
            </p>

            <form onSubmit={handleCreate} className="flex gap-2 mb-8 max-w-md">
                <input
                    type="text"
                    required
                    maxLength={80}
                    placeholder="Collection name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                />
                <button
                    type="submit"
                    disabled={creating}
                    className="bg-mango text-abyss px-5 py-2 rounded-md text-sm font-semibold hover:bg-mango-dark transition-colors disabled:opacity-60"
                >
                    {creating ? "Creating…" : "Create"}
                </button>
            </form>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            {collections.length === 0 ? (
                <p className="text-ash text-sm">You haven't created any collections yet.</p>
            ) : (
                <div className="grid md:grid-cols-[220px_1fr] gap-6">
                    <ul className="divide-y divide-line border-y border-line">
                        {collections.map((collection) => (
                            <li key={collection.id} className="py-3">
                                <button
                                    onClick={() => handleSelect(collection.id)}
                                    className={`text-sm font-medium text-left w-full ${
                                        selectedId === collection.id ? "text-teal" : "text-ink"
                                    }`}
                                >
                                    {collection.name}
                                </button>
                                <div className="flex items-center justify-between mt-0.5">
                                    <p className="text-xs text-ash">
                                        {collection.product_count === 1
                                            ? "1 product"
                                            : `${collection.product_count} products`}
                                    </p>
                                    <button
                                        onClick={() => handleDeleteCollection(collection.id)}
                                        disabled={busyId === collection.id}
                                        className="text-xs text-coral hover:underline disabled:opacity-50"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="min-w-0">
                        {!selectedId && (
                            <p className="text-ash text-sm">Select a collection to manage its products.</p>
                        )}

                        {selectedId && (
                            <>
                                <form onSubmit={handleAddProduct} className="flex gap-2 mb-4">
                                    <select
                                        value={addProductId}
                                        onChange={(e) => setAddProductId(e.target.value)}
                                        className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                                    >
                                        <option value="">Add a product…</option>
                                        {availableProducts.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="submit"
                                        disabled={addingProduct || !addProductId}
                                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-60"
                                    >
                                        {addingProduct ? "Adding…" : "Add"}
                                    </button>
                                </form>

                                {productsLoading ? (
                                    <p className="text-ash text-sm">Loading products…</p>
                                ) : collectionProducts.length === 0 ? (
                                    <p className="text-ash text-sm">No products in this collection yet.</p>
                                ) : (
                                    <ul className="divide-y divide-line border-y border-line">
                                        {collectionProducts.map((p) => (
                                            <li key={p.id} className="py-3 flex items-center gap-4">
                                                <div className="w-12 h-12 bg-line/40 rounded-md overflow-hidden shrink-0">
                                                    {p.image_url && <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{p.name}</p>
                                                    <p className="price text-xs text-ash">{formatMoney(p.discount_price || p.price)}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveProduct(p.id)}
                                                    disabled={busyProductId === p.id}
                                                    className="text-xs text-coral hover:underline disabled:opacity-50"
                                                >
                                                    Remove
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
