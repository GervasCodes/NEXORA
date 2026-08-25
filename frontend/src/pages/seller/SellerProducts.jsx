import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";

const PAGE_SIZE = 20;

export default function SellerProducts() {
    const [products, setProducts] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const toast = useToast();

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);

    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkBusy, setBulkBusy] = useState(false);

    // True only when this seller has never listed anything at all (no
    // filters active, first page, zero results) - distinct from "no
    // results for these filters", which gets its own message below.
    const hasNoFiltersApplied = !search && !categoryId && !status;

    useEffect(() => {
        const handle = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
        return () => clearTimeout(handle);
    }, [searchInput]);

    useEffect(() => {
        api.get("/categories").then(({ data }) => setCategories(data.data)).catch(() => {});
    }, []);

    const load = () => {
        setLoading(true);
        const params = { page, limit: PAGE_SIZE };
        if (search.trim()) params.search = search.trim();
        if (categoryId) params.category_id = categoryId;
        if (status) params.status = status;

        api.get("/products/mine/list", { params })
            .then(({ data }) => {
                setProducts(data.data);
                setPagination(data.pagination || { page: 1, totalPages: 1, total: data.data.length });
                setSelectedIds([]);
            })
            .catch((err) => toast?.error(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [search, categoryId, status, page]);

    const toggleActive = async (product) => {
        setBusyId(product.id);
        try {
            await api.put(`/products/${product.id}/${product.is_active ? "deactivate" : "activate"}`);
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const allOnPageSelected = products.length > 0 && products.every((p) => selectedIds.includes(p.id));

    const toggleSelectAll = () => {
        if (allOnPageSelected) {
            setSelectedIds((ids) => ids.filter((id) => !products.some((p) => p.id === id)));
        } else {
            setSelectedIds((ids) => [...new Set([...ids, ...products.map((p) => p.id)])]);
        }
    };

    const toggleSelectOne = (id) => {
        setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    };

    const bulkSetActive = async (isActive) => {
        setBulkBusy(true);
        try {
            await api.put("/products/bulk/status", { ids: selectedIds, is_active: isActive });
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBulkBusy(false);
        }
    };

    const resetFilters = () => {
        setSearchInput("");
        setSearch("");
        setCategoryId("");
        setStatus("");
        setPage(1);
    };

    return (
        <div>
            <PageMeta title="My Products" noIndex />
            <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-2xl">Your products</h1>
                <Button as={Link} to="/seller/products/new" size="sm">
                    + New product
                </Button>
            </div>

            <div className="border border-line rounded-lg p-4 mb-6">
                <div className="flex flex-wrap gap-3">
                    <input
                        type="text"
                        placeholder="Search your products…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="flex-1 min-w-[220px] border border-line rounded-md px-3 py-1.5 text-sm"
                    />
                    <select
                        value={categoryId}
                        onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
                        className="border border-line rounded-md px-3 py-1.5 text-sm"
                    >
                        <option value="">All categories</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                        className="border border-line rounded-md px-3 py-1.5 text-sm"
                    >
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <button
                        onClick={resetFilters}
                        className="text-xs text-ash underline hover:text-ink transition-colors"
                    >
                        Clear filters
                    </button>
                </div>
            </div>


            {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 border border-line bg-line/20 rounded-lg px-4 py-2.5 mb-4">
                    <p className="text-xs font-medium">{selectedIds.length} selected</p>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => bulkSetActive(true)}
                        disabled={bulkBusy}
                        className="bg-paper"
                    >
                        Activate selected
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => bulkSetActive(false)}
                        disabled={bulkBusy}
                        className="bg-paper"
                    >
                        Deactivate selected
                    </Button>
                    <button
                        onClick={() => setSelectedIds([])}
                        disabled={bulkBusy}
                        className="text-xs text-ash underline hover:text-ink transition-colors ml-auto"
                    >
                        Clear selection
                    </button>
                </div>
            )}

            {loading ? (
                <PageLoader />
            ) : products.length === 0 ? (
                <p className="text-ash text-sm">
                    {hasNoFiltersApplied ? "You haven't listed any products yet." : "No products match these filters."}
                </p>
            ) : (
                <>
                    <div className="border-y border-line divide-y divide-line">
                        <div className="py-2 flex items-center gap-3 text-xs text-ash">
                            <input
                                type="checkbox"
                                checked={allOnPageSelected}
                                onChange={toggleSelectAll}
                                aria-label="Select all products on this page"
                            />
                            Select all on page
                        </div>

                        {products.map((p) => (
                            <div key={p.id} className="py-4 flex flex-wrap items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(p.id)}
                                    onChange={() => toggleSelectOne(p.id)}
                                    aria-label={`Select ${p.name}`}
                                />

                                <div className="w-14 h-14 bg-line/40 rounded-md overflow-hidden shrink-0">
                                    {p.image_url && <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{p.name}</p>
                                    <p className="price text-xs text-ash">{formatMoney(p.discount_price || p.price)} · stock {p.stock}</p>
                                </div>

                                <span className={`text-xs font-medium px-2 py-1 rounded-full ${p.is_active ? "bg-teal/10 text-teal" : "bg-line text-ash"}`}>
                                    {p.is_active ? "Active" : "Inactive"}
                                </span>

                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <Link
                                        to={`/seller/products/${p.id}/edit`}
                                        className="flex-1 sm:flex-initial text-center text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors"
                                    >
                                        Edit
                                    </Link>

                                    <Button
                                        onClick={() => toggleActive(p)}
                                        disabled={busyId === p.id}
                                        variant="secondary"
                                        size="sm"
                                        className="flex-1 sm:flex-initial"
                                    >
                                        {p.is_active ? "Deactivate" : "Activate"}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-between mt-6 text-sm">
                        <p className="text-ash text-xs">{pagination.total} total products</p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={pagination.page <= 1}
                                className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <span className="text-xs text-ash">Page {pagination.page} of {pagination.totalPages}</span>
                            <button
                                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                                disabled={pagination.page >= pagination.totalPages}
                                className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
