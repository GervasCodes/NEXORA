import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import Input from "../../components/ui/Input";
import { useLanguage } from "../../context/LanguageContext";


export default function SellerCollections() {
    const { t } = useLanguage();
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const toast = useToast();
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
        loadCollectionProducts(collectionId);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            await api.post("/seller/collections", { name });
            setName("");
            loadCollections();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteCollection = async (collectionId) => {
        setBusyId(collectionId);
        try {
            await api.delete(`/seller/collections/${collectionId}`);
            if (selectedId === collectionId) {
                setSelectedId(null);
                setCollectionProducts([]);
            }
            loadCollections();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const handleAddProduct = async (e) => {
        e.preventDefault();
        if (!addProductId) return;

        setAddingProduct(true);
        try {
            await api.post(`/seller/collections/${selectedId}/products`, { product_id: addProductId });
            setAddProductId("");
            loadCollectionProducts(selectedId);
            loadCollections();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setAddingProduct(false);
        }
    };

    const handleRemoveProduct = async (productId) => {
        setBusyProductId(productId);
        try {
            await api.delete(`/seller/collections/${selectedId}/products/${productId}`);
            loadCollectionProducts(selectedId);
            loadCollections();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyProductId(null);
        }
    };

    if (loading) return <PageLoader />;

    // Only products not already in the selected collection are offered -
    // there's no point letting a seller pick one that's already there
    // when the API would just reject it as a duplicate anyway.
    const availableProducts = myProducts.filter(
        (p) => !collectionProducts.some((cp) => cp.id === p.id)
    );

    return (
        <div>
            <PageMeta title={t("seller.collections.title")} noIndex />
            <h1 className="font-display text-2xl mb-2">{t("seller.collections.title")}</h1>
            <p className="text-sm text-ash mb-6">
                {t("seller.collections.intro")}
            </p>

            <form onSubmit={handleCreate} className="flex gap-2 mb-8 max-w-md">
                <div className="flex-1">
                    <Input
                        type="text"
                        required
                        maxLength={80}
                        placeholder={t("seller.collections.namePlaceholder")}
                        aria-label={t("seller.collections.namePlaceholder")}
                        autoComplete="off"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <Button
                    type="submit"
                    disabled={creating}
                >
                    {creating ? t("seller.collections.creating") : t("seller.collections.create")}
                </Button>
            </form>


            {collections.length === 0 ? (
                <EmptyState title={t("seller.collections.empty")} />
            ) : (
                <div className="grid md:grid-cols-[220px_1fr] gap-6">
                    <ul className="divide-y divide-line border-y border-line">
                        {collections.map((collection) => (
                            <li key={collection.id} className="py-3">
                                <button
                                    onClick={() => handleSelect(collection.id)}
                                    aria-current={selectedId === collection.id ? "true" : undefined}
                                    className={`text-sm font-medium text-left w-full ${
                                        selectedId === collection.id ? "text-teal" : "text-ink"
                                    }`}
                                >
                                    {collection.name}
                                </button>
                                <div className="flex items-center justify-between mt-0.5">
                                    <p className="text-xs text-ash">
                                        {collection.product_count === 1
                                            ? t("seller.collections.productCount.one")
                                            : t("seller.collections.productCount.other", { count: collection.product_count })}
                                    </p>
                                    <button
                                        onClick={() => handleDeleteCollection(collection.id)}
                                        disabled={busyId === collection.id}
                                        aria-label={t("seller.collections.deleteAria", { name: collection.name })}
                                        className="text-xs text-coral hover:underline disabled:opacity-50"
                                    >
                                        {t("seller.collections.delete")}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="min-w-0">
                        {!selectedId && (
                            <p className="text-ash text-sm">{t("seller.collections.selectHint")}</p>
                        )}

                        {selectedId && (
                            <>
                                <form onSubmit={handleAddProduct} className="flex gap-2 mb-4">
                                    <select
                                        value={addProductId}
                                        onChange={(e) => setAddProductId(e.target.value)}
                                        aria-label={t("seller.collections.addProductAria")}
                                        className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                                    >
                                        <option value="">{t("seller.collections.addProductPlaceholder")}</option>
                                        {availableProducts.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="submit"
                                        disabled={addingProduct || !addProductId}
                                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-60"
                                    >
                                        {addingProduct ? t("seller.collections.adding") : t("seller.collections.add")}
                                    </button>
                                </form>

                                {productsLoading ? (
                                    <LoadingState label={t("seller.collections.loadingProducts")} />
                                ) : collectionProducts.length === 0 ? (
                                    <p className="text-ash text-sm">{t("seller.collections.noProducts")}</p>
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
                                                    aria-label={t("seller.collections.removeAria", { name: p.name })}
                                                    className="text-xs text-coral hover:underline disabled:opacity-50"
                                                >
                                                    {t("seller.collections.remove")}
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
