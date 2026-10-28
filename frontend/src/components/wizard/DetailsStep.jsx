import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import Input from "../ui/Input";
import NexoraCopyAssist from "../ai/NexoraCopyAssist";

// Step 3: the product details, extracted from SellerProductForm. Advanced
// options (variants, etc.) stay on the full form, linked at the bottom.
export default function DetailsStep({ form, setForm, categories, onEdited, productId, madeToOrderAllowed = true }) {
    const { t } = useLanguage();
    const [categoryQuery, setCategoryQuery] = useState("");
    const update = (field) => (e) => {
        setForm((f) => ({ ...f, [field]: e.target.value }));
        onEdited();
    };
    const updateChecked = (field) => (e) => {
        setForm((f) => ({ ...f, [field]: e.target.checked }));
        onEdited();
    };

    return (
        <section aria-labelledby="wizard-details-title" className="space-y-4 max-w-lg">
            <h2 id="wizard-details-title" className="font-display text-xl">{t("wizard.step3Title")}</h2>

            <Input label={t("seller.productForm.name")} required value={form.name} onChange={update("name")} />

            <div className="grid grid-cols-2 gap-3">
                <Input label={t("seller.productForm.price")} required type="number" min="0" step="0.01" value={form.price} onChange={update("price")} className="price" />
                <Input label={t("seller.productForm.discountPrice")} type="number" min="0" step="0.01" value={form.discount_price} onChange={update("discount_price")} className="price" />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Input label={t("seller.productForm.stock")} type="number" min="0" value={form.stock} onChange={update("stock")} />
                <Input label={t("seller.productForm.brand")} value={form.brand} onChange={update("brand")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label htmlFor="wizCondition" className="block text-sm mb-1">{t("seller.productForm.condition")}</label>
                    <select id="wizCondition" value={form.product_condition} onChange={update("product_condition")}
                        className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper min-h-[44px]">
                        <option value="new">{t("seller.productForm.conditionNew")}</option>
                        <option value="used">{t("seller.productForm.conditionUsed")}</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="wizCategory" className="block text-sm mb-1">{t("seller.productForm.category")}</label>
                    <input type="search" aria-label={t("seller.productForm.searchCategories")} placeholder={t("seller.productForm.searchCategories")}
                        value={categoryQuery} onChange={(e) => setCategoryQuery(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-1.5 mb-1 text-sm focus-ring bg-paper min-h-[44px]" />
                    <select id="wizCategory" required value={form.category_id} onChange={update("category_id")}
                        className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper min-h-[44px]">
                        <option value="">{t("seller.productForm.select")}</option>
                        {categories
                            .filter((c) => c.name.toLowerCase().includes(categoryQuery.trim().toLowerCase()) || String(c.id) === String(form.category_id))
                            .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            {madeToOrderAllowed && (
                <div className="border border-line rounded-lg p-4 space-y-3">
                    <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                        <input type="checkbox" className="accent-teal w-5 h-5" checked={form.is_preorder} onChange={updateChecked("is_preorder")} />
                        <span className="text-sm font-medium">{t("wizard.madeToOrder")}</span>
                    </label>
                    <p className="text-xs text-ash">{t("wizard.madeToOrderHelp")}</p>
                    {form.is_preorder && (
                        <>
                            <Input label={t("seller.productForm.leadTime")} type="number" min="1" max="365" value={form.preorder_lead_time_days} onChange={update("preorder_lead_time_days")} />
                            <p className="text-xs text-ash">
                                {t("seller.productForm.preorderHintBefore")}{" "}
                                <Link to="/seller/store" className="underline">{t("seller.productForm.storeSettings")}</Link>{" "}
                                {t("seller.productForm.preorderHintAfter")}
                            </p>
                        </>
                    )}
                </div>
            )}

            <div>
                <Input as="textarea" label={t("seller.productForm.descriptionLabel")} rows={5} value={form.description} onChange={update("description")} />
                <NexoraCopyAssist mode="product" name={form.name}
                    category={categories.find((c) => String(c.id) === String(form.category_id))?.name}
                    onApply={(description) => { setForm((f) => ({ ...f, description })); onEdited(); }} />
            </div>

            {productId && (
                <p className="text-xs text-ash">
                    {t("wizard.moreOptions")}{" "}
                    <Link to={`/seller/products/${productId}/edit?legacy=1`} className="underline">{t("wizard.openFullForm")}</Link>
                </p>
            )}
        </section>
    );
}
