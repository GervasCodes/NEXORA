import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ProductCard from "../components/ProductCard";
import ServiceCard from "../components/ServiceCard";
import { ProductCardSkeleton } from "../components/ProductGrid";
import { ServiceCardSkeleton } from "../components/ServiceGrid";
import MaintenanceScreen from "../components/MaintenanceScreen";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import PageMeta from "../components/PageMeta";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useLanguage } from "../context/LanguageContext";

// (UI/UX remediation): this page previously hand-rolled its own
// "Loading…" text, empty-state markup, and error text instead of reusing
// the shared SkeletonList/EmptyState/ErrorState components that
// Orders.jsx/Bookings.jsx/Cart.jsx already standardized on - so it quietly
// drifted out of sync with the rest of the app's loading/empty/error
// treatment (no retry on failure, no grid-shaped skeleton, no icon or
// role="status"/"alert" for screen readers). This brings it back in line.
//
// (UI/UX remediation): a buyer could previously save a product
// but not a service - this page only ever rendered ProductCard. Both
// lists are fetched together (a saved-items page is exactly the kind of
// page where a buyer wants to see everything they saved, not go looking
// for a second page) and a tab switches which grid is shown, since a
// product grid and a service grid aren't visually interchangeable
// (different card shape, no shared "stock" concept).
export default function Saved() {
    const { t } = useLanguage();
    const { addToCart } = useCart();
    const toast = useToast();
    const [movingId, setMovingId] = useState(null);
    const [products, setProducts] = useState(null);
    const [services, setServices] = useState(null);
    // Separate error flags per list (UI/UX remediation): the two
    // calls can fail independently, and collapsing a services failure
    // into `setServices([])` made a failed load indistinguishable from
    // "you haven't saved any services" - a buyer with saved services
    // would see "No services saved yet" and quietly lose track of them.
    const [productsError, setProductsError] = useState(false);
    const [servicesError, setServicesError] = useState(false);
    const [maintenance, setMaintenance] = useState(null);
    const [tab, setTab] = useState("products");

    const load = () => {
        setProducts(null);
        setServices(null);
        setProductsError(false);
        setServicesError(false);
        setMaintenance(null);
        Promise.allSettled([api.get("/wishlist"), api.get("/wishlist/services")])
            .then(([productsRes, servicesRes]) => {
                if (productsRes.status === "fulfilled") {
                    setProducts(productsRes.value.data.data);
                } else if (productsRes.reason?.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(productsRes.reason.response.data.message);
                } else {
                    setProductsError(true);
                    setProducts([]);
                }

                if (servicesRes.status === "fulfilled") {
                    setServices(servicesRes.value.data.data);
                } else {
                    setServicesError(true);
                    setServices([]);
                }
            });
    };

    useEffect(load, []);

    const moveToCart = async (product) => {
        setMovingId(product.id);
        const result = await addToCart(product.id, 1);
        if (result?.success) toast?.success?.(t("saved.addedToCart"));
        else toast?.error?.(result?.message || t("saved.addFailed"));
        setMovingId(null);
    };

    if (maintenance) {
        return <MaintenanceScreen title="Wishlist is under maintenance" message={maintenance} onRetry={load} />;
    }

    const loading = products === null || services === null;
    const activeItems = tab === "products" ? products : services;
    const error = tab === "products" ? productsError : servicesError;
    const productCount = products?.length ?? 0;
    const serviceCount = services?.length ?? 0;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <PageMeta title="Saved" noIndex />
            <h1 className="font-display text-2xl mb-1">Saved for later</h1>
            <p className="text-ash text-sm mb-6">Products and services you've tapped the heart on.</p>

            {!loading && !error && (productCount > 0 || serviceCount > 0) && (
                <div className="flex gap-1 border-b border-line mb-6">
                    <button
                        onClick={() => setTab("products")}
                        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            tab === "products" ? "border-ink text-ink" : "border-transparent text-ash hover:text-ink"
                        }`}
                    >
                        Products ({productCount})
                    </button>
                    <button
                        onClick={() => setTab("services")}
                        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            tab === "services" ? "border-ink text-ink" : "border-transparent text-ash hover:text-ink"
                        }`}
                    >
                        Services ({serviceCount})
                    </button>
                </div>
            )}

            {loading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {Array.from({ length: 8 }).map((_, i) => (
                        tab === "products" ? <ProductCardSkeleton key={i} /> : <ServiceCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {!loading && error && (
                <ErrorState
                    title={tab === "products" ? "Couldn't load your saved products" : "Couldn't load your saved services"}
                    hint="Check your connection and try again."
                    onRetry={load}
                />
            )}

            {!loading && !error && activeItems.length === 0 && (
                <EmptyState
                    title={tab === "products" ? "No products saved yet" : "No services saved yet"}
                    hint={`Tap the heart icon on any ${tab === "products" ? "product" : "service"} to save it here.`}
                    tone="coral"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
                            <path d="M12 20.5s-7.5-4.6-9.7-9.2C.8 7.7 2.4 4.5 5.6 3.8c2-.4 3.9.5 5 2.1a5 5 0 0 1 1.4 1.6 5 5 0 0 1 1.4-1.6c1.1-1.6 3-2.5 5-2.1 3.2.7 4.8 3.9 3.3 7.5C19.5 15.9 12 20.5 12 20.5Z" strokeLinejoin="round" />
                        </svg>
                    }
                    action={
                        <Link to={tab === "products" ? "/products" : "/services"} className="text-teal hover:underline text-sm">
                            Browse all →
                        </Link>
                    }
                />
            )}

            {!loading && !error && activeItems.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {tab === "products"
                        ? activeItems.map((product) => {
                            const soldOut = Number(product.stock) <= 0;
                            return (
                                <div key={product.id} className="flex flex-col gap-2">
                                    <div className="relative">
                                        <ProductCard product={product} />
                                        {!soldOut && product.price_dropped && Number(product.price_drop_pct) > 0 && (
                                            <span className="absolute top-2 right-2 bg-teal text-paper text-xs font-medium px-2 py-0.5 rounded">
                                                {t("saved.priceDropped", { pct: Number(product.price_drop_pct) })}
                                            </span>
                                        )}
                                        {soldOut && (
                                            <span className="absolute top-2 left-2 bg-coral text-white text-xs font-medium px-2 py-0.5 rounded">
                                                {t("saved.soldOut")}
                                            </span>
                                        )}
                                        {!soldOut && Number(product.stock) <= 5 && (
                                            <span className="absolute top-2 left-2 bg-mango text-abyss text-xs font-medium px-2 py-0.5 rounded">
                                                {t("saved.lowStock", { count: Number(product.stock) })}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => moveToCart(product)}
                                        disabled={soldOut || movingId === product.id}
                                        className="text-sm border border-line rounded-md py-2 hover:border-ink transition-colors disabled:opacity-50"
                                    >
                                        {movingId === product.id ? t("saved.adding") : t("saved.moveToCart")}
                                    </button>
                                </div>
                            );
                        })
                        : activeItems.map((service) => <ServiceCard key={service.id} service={service} />)}
                </div>
            )}
        </div>
    );
}
