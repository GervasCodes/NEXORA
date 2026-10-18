import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import { formatMoney } from "../../utils/format";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import StatusBadge from "../../components/ui/StatusBadge";
import { useLanguage } from "../../context/LanguageContext";

export default function SellerGroupBuys() {
    const { t } = useLanguage();
    const [products, setProducts] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ productId: "", groupPrice: "", minParticipants: 5, deadline: "" });
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");

    const load = () => {
        Promise.all([
            api.get("/products/mine/list").then(({ data }) => data.data).catch(() => []),
            api.get("/group-buys/seller/mine").then(({ data }) => data.data)
        ]).then(([productsData, groupsData]) => {
            setProducts(productsData);
            setGroups(groupsData);
        }).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submit = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        try {
            await api.post("/group-buys/seller", {
                productId: Number(form.productId),
                groupPrice: Number(form.groupPrice),
                minParticipants: Number(form.minParticipants),
                deadline: new Date(form.deadline).toISOString()
            });
            setForm({ productId: "", groupPrice: "", minParticipants: 5, deadline: "" });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title={t("seller.groupBuys.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.groupBuys.title")}</h1>
            <p className="text-ash text-sm mb-6">{t("seller.groupBuys.intro")}</p>

            <form onSubmit={submit} className="border border-line rounded-lg p-4 mb-8 space-y-3">
                <h2 className="font-display text-lg">{t("seller.groupBuys.startTitle")}</h2>
                <select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} aria-label={t("seller.groupBuys.chooseProductAria")} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                    <option value="" disabled>{t("seller.groupBuys.chooseProduct")}</option>
                    {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — {formatMoney(p.price)}</option>
                    ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                    <Input required type="number" inputMode="decimal" min="1" step="0.01" placeholder={t("seller.groupBuys.groupPrice")} aria-label={t("seller.groupBuys.groupPrice")} value={form.groupPrice} onChange={(e) => setForm({ ...form, groupPrice: e.target.value })} />
                    <Input required type="number" inputMode="numeric" min="2" placeholder={t("seller.groupBuys.minParticipants")} aria-label={t("seller.groupBuys.minParticipants")} value={form.minParticipants} onChange={(e) => setForm({ ...form, minParticipants: e.target.value })} />
                </div>
                <Input required type="datetime-local" aria-label={t("seller.groupBuys.deadlineAria")} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />

                {error && <p role="alert" className="text-sm text-coral">{error}</p>}

                <button type="submit" disabled={creating} className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                    {creating ? t("seller.groupBuys.creating") : t("seller.groupBuys.start")}
                </button>
            </form>

            <h2 className="font-display text-lg mb-3">{t("seller.groupBuys.yours")}</h2>
            {groups.length === 0 ? (
                <EmptyState title={t("seller.groupBuys.empty")} />
            ) : (
                <ul className="space-y-2">
                    {groups.map((g) => (
                        <li key={g.id} className="border border-line rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-medium text-sm">{g.product_name}</p>
                                <p className="text-ash text-xs">{t("seller.groupBuys.joinedCount", { count: g.participant_count, min: g.min_participants })} · {formatMoney(g.group_price)}</p>
                            </div>
                            <StatusBadge domain="groupBuy" status={g.status} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
