import { useEffect, useState } from "react";
import api from "../api/client";
import { useLanguage } from "../context/LanguageContext";
import ProductRow from "./ProductRow";
import ServiceCard from "./ServiceCard";

// Same per-request timeout discipline as ProductGrid.jsx: a stalled request
// on a flaky connection must not leave a rail stuck on its skeleton.
const TIMEOUT_MS = 10000;
const RAIL_SIZE = 12;

function RailSkeleton() {
    return (
        <div className="mb-10 animate-pulse">
            <div className="h-5 w-48 bg-line/50 rounded mb-4" />
            <div className="flex gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="w-40 sm:w-48 shrink-0">
                        <div className="aspect-square bg-line/50 rounded-md mb-3" />
                        <div className="h-3.5 w-full bg-line/50 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// Home rails built from the existing sorted listings (newest, rating), so
// no new backend endpoint is needed. Each rail fails independently: one
// broken request just drops that rail instead of blanking the page.
export default function HomeRails() {
    const { t } = useLanguage();
    const [newArrivals, setNewArrivals] = useState(null);
    const [topRated, setTopRated] = useState(null);
    const [topServices, setTopServices] = useState(null);
    const [onSale, setOnSale] = useState(null);

    useEffect(() => {
        let ignore = false;
        const load = (url, params, set) =>
            api.get(url, { params: { ...params, limit: RAIL_SIZE }, timeout: TIMEOUT_MS })
                .then(({ data }) => { if (!ignore) set(data.data || []); })
                .catch(() => { if (!ignore) set([]); });

        load("/products", { sort: "newest" }, setNewArrivals);
        load("/products", { sort: "rating" }, setTopRated);
        load("/services", { sort: "rating" }, setTopServices);
        load("/products", { on_sale: "1", sort: "newest" }, setOnSale);
        return () => { ignore = true; };
    }, []);

    const loading = newArrivals === null || topRated === null || topServices === null || onSale === null;

    if (loading) return <><RailSkeleton /><RailSkeleton /></>;

    return (
        <>
            <ProductRow title={t("home.railNew")} products={newArrivals} />
            {onSale.length > 0 && <ProductRow title={t("home.railDeals")} products={onSale} />}
            <ProductRow title={t("home.railTopRated")} products={topRated} />
            {topServices.length > 0 && (
                <section className="mb-10 animate-fade-in" aria-labelledby="home-top-services">
                    <h2 id="home-top-services" className="font-display text-xl mb-4">{t("home.railTopServices")}</h2>
                    <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 snap-x snap-mandatory scrollbar-thin">
                        {topServices.map((service) => (
                            <div key={service.id} className="w-40 sm:w-48 shrink-0 snap-start">
                                <ServiceCard service={service} />
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </>
    );
}
