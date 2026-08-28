import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import PageMeta from "../../components/PageMeta";

const PAGE_SIZE = 20;

export default function AdminProducts() {
    const [products, setProducts] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    // Search box is free text over name/store - debounced so every
    // keystroke doesn't fire a request (same pattern AdminAuditLogs uses).
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);

    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkBusy, setBulkBusy] = useState(false);

    useEffect(() => {
        const handle = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
        return () => clearTimeout(handle);
    }, [searchInput]);

    useEffect(() => {
        api.get("/categories/admin/all").then(({ data }) => setCategories(data.data)).catch(() => {});
    }, []);

    const load = () => {
        setLoading(true);
        setError("");
        const params = { page, limit: PAGE_SIZE };
        if (search.trim()) params.search = search.trim();
        if (categoryId) params.category_id = categoryId;
        if (status) params.status = status;

        api.get("/admin/products", { params })
            .then(({ data }) => {
                setProducts(data.data);
                setPagination(data.pagination || { page: 1, totalPages: 1, total: data.data.length });
                setSelectedIds([]);
            })
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [search, categoryId, status, page]);

    const toggleActive = async (product) => {
        setBusyId(product.id);
        setError("");
        try {
            await api.put(`/admin/products/${product.id}/${product.is_active ? "deactivate" : "activate"}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const toggleSponsored = async (product) => {
        setBusyId(product.id);
        setError("");
        try {
            await api.put(`/admin/products/${product.id}/${product.is_sponsored ? "unsponsor" : "sponsor"}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const toggleSelectAll = () => {
        const allOnPageSelected = products.length > 0 && products.every((p) => selectedIds.includes(p.id));
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
        setError("");
        try {
            await api.put("/admin/products/bulk-status", { ids: selectedIds, is_active: isActive });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
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
            <PageMeta title="Products" noIndex />
            <h1 className="font-display text-2xl mb-6">Products</h1>

            <div className="border border-line rounded-lg p-4 mb-6">
                <div className="flex flex-wrap gap-3">
                    <input
                        type="text"
                        placeholder="Search product or store name…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="flex-1 min-w-[180px] sm:min-w-[220px] border border-line rounded-md px-3 py-1.5 text-sm"
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
                        <option value="active">Live</option>
                        <option value="inactive">Removed</option>
                    </select>
                    <button
                        onClick={resetFilters}
                        className="text-xs text-ash underline hover:text-ink transition-colors"
                    >
                        Clear filters
                    </button>
                </div>
            </div>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <DataTable
                items={products}
                loading={loading}
                emptyTitle="No products match these filters."
                selectable
                selectedIds={selectedIds}
                onToggleSelectAll={toggleSelectAll}
                onToggleSelectOne={toggleSelectOne}
                selectAllLabel="Select all products on this page"
                getSelectLabel={(p) => `Select ${p.name}`}
                bulkActions={selectedIds.length > 0 && (
                    <>
                        <p className="text-xs font-medium">{selectedIds.length} selected</p>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => bulkSetActive(true)}
                            disabled={bulkBusy}
                            className="bg-paper"
                        >
                            Restore selected
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => bulkSetActive(false)}
                            disabled={bulkBusy}
                            className="bg-paper"
                        >
                            Remove selected
                        </Button>
                        <button
                            onClick={() => setSelectedIds([])}
                            disabled={bulkBusy}
                            className="text-xs text-ash underline hover:text-ink transition-colors ml-auto"
                        >
                            Clear selection
                        </button>
                    </>
                )}
                renderRow={(p) => (
                    <>
                        <div className="w-11 h-11 bg-line/40 rounded-md overflow-hidden shrink-0">
                            {p.image_url && (
                                <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            )}
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-ash truncate">{p.store_name}</p>
                        </div>

                        <p className="price text-sm">{formatMoney(p.price)}</p>
                        <p className="text-xs text-ash">stock {p.stock}</p>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${p.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                            {p.is_active ? "Live" : "Removed"}
                        </span>
                        {p.is_sponsored ? (
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-mango/10 text-mango-dark">
                                Sponsored
                            </span>
                        ) : null}

                        <Button
                            onClick={() => toggleSponsored(p)}
                            disabled={busyId === p.id}
                            variant="secondary"
                            size="sm"
                        >
                            {p.is_sponsored ? "Unsponsor" : "Sponsor"}
                        </Button>

                        <Button
                            onClick={() => toggleActive(p)}
                            disabled={busyId === p.id}
                            variant="secondary"
                            size="sm"
                        >
                            {p.is_active ? "Remove" : "Restore"}
                        </Button>
                    </>
                )}
                pagination={{
                    page: pagination.page,
                    totalPages: pagination.totalPages,
                    total: pagination.total,
                    itemLabel: "products",
                    onPageChange: setPage
                }}
            />
        </div>
    );
}
