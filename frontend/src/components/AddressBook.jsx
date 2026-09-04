import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import PhoneInput from "./PhoneInput";
import Input from "./ui/Input";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";

const emptyForm = {
    label: "",
    recipient_name: "",
    address: "",
    city: "",
    region: "",
    phone: ""
};

/**
 * AddressBook - Phase 1 (UI/UX remediation).
 *
 * Buyer's saved address list, rendered as its own section inside
 * Account.jsx (kept as a separate component rather than inlined, the
 * same way Avatar/PhoneInput already are, so this genuinely standalone
 * CRUD feature doesn't grow Account.jsx's own already-large file
 * further). Checkout.jsx reuses the same GET /addresses list to power
 * its saved-address selector.
 */
export default function AddressBook() {
    const [addresses, setAddresses] = useState(null);
    const [error, setError] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState("");
    const [actioningId, setActioningId] = useState(null);

    const load = () => {
        setError(false);
        api.get("/addresses")
            .then(({ data }) => setAddresses(data.data))
            .catch(() => setError(true));
    };

    useEffect(load, []);

    const openAddForm = () => {
        setEditingId(null);
        setForm(emptyForm);
        setFormError("");
        setFormOpen(true);
    };

    const openEditForm = (addr) => {
        setEditingId(addr.id);
        setForm({
            label: addr.label || "",
            recipient_name: addr.recipient_name || "",
            address: addr.address || "",
            city: addr.city || "",
            region: addr.region || "",
            phone: addr.phone || ""
        });
        setFormError("");
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditingId(null);
        setForm(emptyForm);
        setFormError("");
    };

    const submitForm = async (e) => {
        e.preventDefault();
        setBusy(true);
        setFormError("");
        try {
            if (editingId) {
                await api.put(`/addresses/${editingId}`, form);
            } else {
                await api.post("/addresses", form);
            }
            closeForm();
            load();
        } catch (err) {
            setFormError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const removeAddress = async (id) => {
        setActioningId(id);
        try {
            await api.delete(`/addresses/${id}`);
            load();
        } catch {
            // A failed delete just leaves the address in place - the list
            // reflecting reality (nothing silently vanished) is enough
            // feedback here without a dedicated error state for a
            // secondary destructive action.
        } finally {
            setActioningId(null);
        }
    };

    const makeDefault = async (id) => {
        setActioningId(id);
        try {
            await api.put(`/addresses/${id}/default`);
            load();
        } catch {
            // Same reasoning as removeAddress above.
        } finally {
            setActioningId(null);
        }
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg">Addresses</h2>
                {!formOpen && (
                    <button
                        type="button"
                        onClick={openAddForm}
                        className="text-sm text-teal hover:underline"
                    >
                        + Add address
                    </button>
                )}
            </div>

            {formOpen && (
                <form onSubmit={submitForm} className="space-y-3 border border-line rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input
                            label="Label"
                            placeholder="Home, Office…"
                            value={form.label}
                            onChange={(e) => setForm({ ...form, label: e.target.value })}
                        />
                        <Input
                            label="Recipient name"
                            value={form.recipient_name}
                            onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                        />
                    </div>
                    <Input
                        label="Street address"
                        required
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input
                            label="City"
                            required
                            value={form.city}
                            onChange={(e) => setForm({ ...form, city: e.target.value })}
                        />
                        <Input
                            label="Region"
                            required
                            value={form.region}
                            onChange={(e) => setForm({ ...form, region: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">Phone</label>
                        <PhoneInput
                            value={form.phone}
                            onChange={(phone) => setForm({ ...form, phone })}
                            required
                        />
                    </div>

                    {formError && <p role="alert" className="text-coral text-sm">{formError}</p>}

                    <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={busy}>
                            {busy ? "Saving…" : editingId ? "Save changes" : "Save address"}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={closeForm} disabled={busy}>
                            Cancel
                        </Button>
                    </div>
                </form>
            )}

            {error && (
                <p className="text-coral text-sm">Couldn't load your saved addresses.</p>
            )}

            {!error && addresses === null && (
                <p className="text-ash text-sm">Loading…</p>
            )}

            {!error && addresses?.length === 0 && !formOpen && (
                <EmptyState
                    title="No saved addresses yet"
                    hint="Add one so you don't have to retype it at checkout."
                    tone="teal"
                />
            )}

            {!error && addresses?.length > 0 && (
                <ul className="space-y-2">
                    {addresses.map((addr) => (
                        <li key={addr.id} className="border border-line rounded-lg p-4 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold">{addr.label || "Address"}</p>
                                    {addr.is_default ? (
                                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-teal/10 text-teal px-1.5 py-0.5 rounded">
                                            Default
                                        </span>
                                    ) : null}
                                </div>
                                {addr.recipient_name && <p className="text-sm text-ink/80">{addr.recipient_name}</p>}
                                <p className="text-sm text-ash">{addr.address}, {addr.city}, {addr.region}</p>
                                <p className="text-xs text-ash mt-0.5">{addr.phone}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0 text-xs">
                                <button type="button" onClick={() => openEditForm(addr)} className="text-teal hover:underline">
                                    Edit
                                </button>
                                {!addr.is_default && (
                                    <button
                                        type="button"
                                        onClick={() => makeDefault(addr.id)}
                                        disabled={actioningId === addr.id}
                                        className="text-ash hover:text-ink disabled:opacity-50"
                                    >
                                        Set as default
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeAddress(addr.id)}
                                    disabled={actioningId === addr.id}
                                    className="text-coral hover:underline disabled:opacity-50"
                                >
                                    Remove
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
