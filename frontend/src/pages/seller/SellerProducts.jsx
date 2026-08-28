import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import { useLanguage } from "../../context/LanguageContext";

const PAGE_SIZE = 20;

export default function SellerProducts() {
    const { t } = useLanguage();
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
                <h1 className="font-display text-2xl">{t("seller.products.title")}</h1>
                <Button as={Link} to="/seller/products/new" size="sm">
                    {t("seller.products.newProduct")}
                </Button>
            </div>

            <div className="border border-line rounded-lg p-4 mb-6">
                <div className="flex flex-wrap gap-3">
                    <input
                        type="text"
                        placeholder={t("seller.products.searchPlaceholder")}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="flex-1 min-w-[180px] sm:min-w-[220px] border border-line rounded-md px-3 py-1.5 text-sm"
                    />
                    <select
                        value={categoryId}
                        onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
                        className="border border-line rounded-md px-3 py-1.5 text-sm"
                    >
                        <option value="">{t("seller.products.allCategories")}</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                        className="border border-line rounded-md px-3 py-1.5 text-sm"
                    >
                        <option value="">{t("seller.products.allStatuses")}</option>
                        <option value="active">{t("seller.products.active")}</option>
                        <option value="inactive">{t("seller.products.inactive")}</option>
                    </select>
                    <button
                        onClick={resetFilters}
                        className="text-xs text-ash underline hover:text-ink transition-colors"
                    >
                        {t("filters.clear")}
                    </button>
                </div>
            </div>

            <DataTable
                items={products}
                loading={loading}
                emptyTitle={hasNoFiltersApplied ? t("seller.products.emptyNoListings") : t("seller.products.emptyNoMatch")}
                selectable
                selectedIds={selectedIds}
                onToggleSelectAll={toggleSelectAll}
                onToggleSelectOne={toggleSelectOne}
                selectAllLabel={t("seller.products.selectAllAria")}
                getSelectLabel={(p) => t("seller.products.selectOneAria", { name: p.name })}
                rowClassName="py-4 flex flex-wrap items-center gap-3"
                bulkActions={selectedIds.length > 0 && (
                    <>
                        <p className="text-xs font-medium">{t("seller.products.selectedCount", { count: selectedIds.length })}</p>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => bulkSetActive(true)}
                            disabled={bulkBusy}
                            className="bg-paper"
                        >
                            {t("seller.products.activateSelected")}
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => bulkSetActive(false)}
                            disabled={bulkBusy}
                            className="bg-paper"
                        >
                            {t("seller.products.deactivateSelected")}
                        </Button>
                        <button
                            onClick={() => setSelectedIds([])}
                            disabled={bulkBusy}
                            className="text-xs text-ash underline hover:text-ink transition-colors ml-auto"
                        >
                            {t("seller.products.clearSelection")}
                        </button>
                    </>
                )}
                renderRow={(p) => (
                    <>
                        <div className="w-14 h-14 bg-line/40 rounded-md overflow-hidden shrink-0">
                            {p.image_url && <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="price text-xs text-ash">{formatMoney(p.discount_price || p.price)} · {t("seller.products.stockSuffix", { count: p.stock })}</p>
                        </div>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${p.is_active ? "bg-teal/10 text-teal" : "bg-line text-ash"}`}>
                            {p.is_active ? t("seller.products.active") : t("seller.products.inactive")}
                        </span>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Link
                                to={`/seller/products/${p.id}/edit`}
                                className="flex-1 sm:flex-initial text-center text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors"
                            >
                                {t("common.edit")}
                            </Link>

                            <Button
                                onClick={() => toggleActive(p)}
                                disabled={busyId === p.id}
                                variant="secondary"
                                size="sm"
                                className="flex-1 sm:flex-initial"
                            >
                                {p.is_active ? t("seller.products.deactivate") : t("seller.products.activate")}
                            </Button>
                        </div>
                    </>
                )}
                pagination={{
                    page: pagination.page,
                    totalPages: pagination.totalPages,
                    total: pagination.total,
                    itemLabel: t("seller.products.itemLabel"),
                    onPageChange: setPage
                }}
            />
        </div>
    );
}
