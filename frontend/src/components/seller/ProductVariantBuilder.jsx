import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import Button from "../ui/Button";

// Builds every combination of the given option axes (cartesian product).
// e.g. [{name:"Size",values:["S","M"]},{name:"Color",values:["Red"]}]
// -> [{Size:"S",Color:"Red"}, {Size:"M",Color:"Red"}]
const buildCombinations = (options) => {
    if (!options.length) return [];
    return options.reduce(
        (acc, option) =>
            acc.flatMap((combo) =>
                option.values.map((value) => ({ ...combo, [option.name]: value }))
            ),
        [{}]
    );
};

const comboKey = (combo) =>
    Object.keys(combo).sort().map((k) => `${k}:${combo[k]}`).join("|");

/**
 * ProductVariantBuilder - Phase 2 continuation (UI/UX remediation).
 *
 * Collapsed behind a "This product has options" toggle so sellers who
 * don't need variants never see this - rendered only once a product has
 * been saved (savedId), the same gating SellerProductForm.jsx already
 * applies to its photo/video/audio sections, since variants attach to a
 * real product id via PUT /products/:id/variants.
 */
export default function ProductVariantBuilder({ productId }) {
    const [enabled, setEnabled] = useState(false);
    const [options, setOptions] = useState([]); // [{ name, values: [] }]
    const [rows, setRows] = useState([]); // combo rows with stock/price_delta/sku, keyed by comboKey
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [savedMessage, setSavedMessage] = useState("");

    useEffect(() => {
        api.get(`/products/${productId}/variants`)
            .then(({ data }) => {
                const { options: savedOptions, variants } = data.data;
                if (savedOptions.length) {
                    setEnabled(true);
                    setOptions(savedOptions.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })));

                    const rowsByKey = new Map(
                        variants.map((v) => [comboKey(v.options), v])
                    );
                    const combos = buildCombinations(savedOptions.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })));
                    setRows(combos.map((combo) => {
                        const existing = rowsByKey.get(comboKey(combo));
                        return {
                            options: combo,
                            key: comboKey(combo),
                            sku: existing?.sku || "",
                            price_delta: existing?.price_delta ?? 0,
                            stock: existing?.stock ?? 0
                        };
                    }));
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [productId]);

    // Whenever the option axes/values change, regenerate the combination
    // grid, carrying over any row data that still matches an unchanged
    // combination (so editing one option's values doesn't wipe stock
    // numbers already entered for combinations that didn't change).
    const regenerateRows = (nextOptions) => {
        const validOptions = nextOptions.filter((o) => o.name.trim() && o.values.length > 0);
        const combos = buildCombinations(validOptions);
        setRows((prevRows) => {
            const prevByKey = new Map(prevRows.map((r) => [r.key, r]));
            return combos.map((combo) => {
                const key = comboKey(combo);
                const existing = prevByKey.get(key);
                return existing || { options: combo, key, sku: "", price_delta: 0, stock: 0 };
            });
        });
    };

    const addOption = () => {
        const next = [...options, { name: "", values: [] }];
        setOptions(next);
    };

    const updateOptionName = (index, name) => {
        const next = options.map((o, i) => (i === index ? { ...o, name } : o));
        setOptions(next);
        regenerateRows(next);
    };

    const addOptionValue = (index, rawValue) => {
        const value = rawValue.trim();
        if (!value) return;
        const next = options.map((o, i) =>
            i === index && !o.values.includes(value) ? { ...o, values: [...o.values, value] } : o
        );
        setOptions(next);
        regenerateRows(next);
    };

    const removeOptionValue = (index, value) => {
        const next = options.map((o, i) =>
            i === index ? { ...o, values: o.values.filter((v) => v !== value) } : o
        );
        setOptions(next);
        regenerateRows(next);
    };

    const removeOption = (index) => {
        const next = options.filter((_, i) => i !== index);
        setOptions(next);
        regenerateRows(next);
    };

    const updateRow = (key, field, value) => {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    };

    const handleToggle = (checked) => {
        setEnabled(checked);
        if (!checked) {
            setOptions([]);
            setRows([]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError("");
        setSavedMessage("");
        try {
            const payloadOptions = options
                .filter((o) => o.name.trim() && o.values.length > 0)
                .map((o) => ({ name: o.name.trim(), values: o.values }));

            const payloadVariants = rows.map((r) => ({
                options: r.options,
                sku: r.sku || undefined,
                price_delta: Number(r.price_delta) || 0,
                stock: Math.max(0, Number(r.stock) || 0)
            }));

            await api.put(`/products/${productId}/variants`, {
                options: enabled ? payloadOptions : [],
                variants: enabled ? payloadVariants : []
            });
            setSavedMessage("Variants saved.");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return null;

    return (
        <div className="mt-10 border-t border-line pt-6">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer mb-4">
                <input type="checkbox" checked={enabled} onChange={(e) => handleToggle(e.target.checked)} />
                This product has options (size, color, etc.)
            </label>

            {enabled && (
                <div className="space-y-6">
                    <div className="space-y-4">
                        {options.map((option, i) => (
                            <div key={i} className="border border-line rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <input
                                        type="text"
                                        placeholder="Option name (e.g. Size)"
                                        value={option.name}
                                        onChange={(e) => updateOptionName(i, e.target.value)}
                                        className="flex-1 border border-line rounded-md px-2 py-1 text-sm focus-ring"
                                    />
                                    <button type="button" onClick={() => removeOption(i)} className="text-coral text-xs hover:underline">
                                        Remove
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {option.values.map((val) => (
                                        <span key={val} className="inline-flex items-center gap-1 bg-line/40 rounded px-2 py-0.5 text-xs">
                                            {val}
                                            <button type="button" onClick={() => removeOptionValue(i, val)} className="text-ash hover:text-coral">×</button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    placeholder="Type a value and press Enter (e.g. Small)"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addOptionValue(i, e.currentTarget.value);
                                            e.currentTarget.value = "";
                                        }
                                    }}
                                    className="w-full border border-line rounded-md px-2 py-1 text-sm focus-ring"
                                />
                            </div>
                        ))}
                        <button type="button" onClick={addOption} className="text-sm text-teal hover:underline">
                            + Add option
                        </button>
                    </div>

                    {rows.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-left text-xs text-ash uppercase tracking-wide border-b border-line">
                                        <th className="py-2 pr-3">Combination</th>
                                        <th className="py-2 pr-3">SKU</th>
                                        <th className="py-2 pr-3">Price adjustment</th>
                                        <th className="py-2 pr-3">Stock</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.key} className="border-b border-line/60">
                                            <td className="py-2 pr-3">
                                                {Object.entries(row.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <input
                                                    type="text"
                                                    value={row.sku}
                                                    onChange={(e) => updateRow(row.key, "sku", e.target.value)}
                                                    className="w-28 border border-line rounded-md px-2 py-1 text-sm focus-ring"
                                                />
                                            </td>
                                            <td className="py-2 pr-3">
                                                <input
                                                    type="number"
                                                    value={row.price_delta}
                                                    onChange={(e) => updateRow(row.key, "price_delta", e.target.value)}
                                                    className="w-24 border border-line rounded-md px-2 py-1 text-sm focus-ring"
                                                />
                                            </td>
                                            <td className="py-2 pr-3">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={row.stock}
                                                    onChange={(e) => updateRow(row.key, "stock", e.target.value)}
                                                    className="w-20 border border-line rounded-md px-2 py-1 text-sm focus-ring"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {error && <p role="alert" className="text-coral text-sm mt-3">{error}</p>}
            {savedMessage && <p className="text-teal text-sm mt-3">{savedMessage}</p>}

            <Button type="button" variant="secondary" size="sm" onClick={handleSave} disabled={saving} className="mt-4">
                {saving ? "Saving…" : "Save variants"}
            </Button>
        </div>
    );
}
