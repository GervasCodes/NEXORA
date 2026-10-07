import { useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import { useToast } from "../context/ToastContext";

// Opens one verification / KYC document. The page never holds a file URL:
// clicking asks the backend for a signed link that expires within minutes
// (and is written to the audit log), then opens it in a new tab.
//   kind: "verification" | "kyc"
export default function PrivateDocumentLink({ kind, doc, children, className = "text-azure hover:underline" }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    if (doc.purged) {
        return <span className="text-ash text-xs">removed (retention policy)</span>;
    }
    if (!doc.has_file) {
        return <span className="text-ash text-xs">no file</span>;
    }

    const open = async () => {
        // Open the tab inside the click so popup blockers allow it, then
        // point it at the signed URL once we have it.
        const tab = window.open("about:blank", "_blank");
        if (tab) tab.opener = null;
        setBusy(true);
        try {
            const { data } = await api.get(`/admin/documents/${kind}/${doc.id}/url`);
            if (tab) {
                tab.location.href = data.data.url;
            } else {
                window.location.assign(data.data.url);
            }
        } catch (err) {
            tab?.close();
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <button type="button" onClick={open} disabled={busy} className={`${className} disabled:opacity-50`}>
            {busy ? "Opening…" : children}
        </button>
    );
}
