import ProductCard from "./ProductCard";


export default function ProductRow({ title, products }) {
    if (!products || products.length === 0) return null;

    return (
        <div className="mb-10">
            <h2 className="font-display text-xl mb-4">{title}</h2>
            <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 snap-x snap-mandatory">
                {products.map((product) => (
                    <div key={product.id} className="w-40 sm:w-48 shrink-0 snap-start">
                        <ProductCard product={product} />
                    </div>
                ))}
            </div>
        </div>
    );
}
