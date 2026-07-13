import { Link } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";

export default function ProductCard({ product }) {
    const { format } = useCurrency();
    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);

    return (
        <Link
            to={`/products/${product.slug}`}
            className="tag-string group block bg-paper border border-line rounded-lg pt-4 px-3 pb-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            <div className="aspect-square bg-line/40 rounded-md overflow-hidden mb-3">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-ash text-xs">
                        No image
                    </div>
                )}
            </div>

            <p className="text-xs text-ash uppercase tracking-wide mb-1 truncate">{product.store_name}</p>
            <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{product.name}</h3>

            <div className="flex items-baseline gap-2">
                <span className="price text-base font-medium text-ink">
                    {format(hasDiscount ? product.discount_price : product.price)}
                </span>
                {hasDiscount && (
                    <span className="price text-xs text-ash line-through">
                        {format(product.price)}
                    </span>
                )}
            </div>

            {product.average_rating && (
                <p className="text-xs text-ash mt-1">
                    ★ {Number(product.average_rating).toFixed(1)} ({product.review_count})
                </p>
            )}

            {Number(product.stock) === 0 && (
                <p className="text-xs text-coral mt-1 font-medium">Out of stock</p>
            )}
        </Link>
    );
}
