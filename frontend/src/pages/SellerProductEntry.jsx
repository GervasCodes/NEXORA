import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";

const SellerProductWizard = lazy(() => import("./SellerProductWizard"));
const SellerProductForm = lazy(() => import("./SellerProductForm"));

// Phase 5: the new upload wizard is the default. The previous single-page
// form stays for one release behind a flag: set VITE_LEGACY_PRODUCT_FORM=true
// at build time to make it the default again, or open any product with
// ?legacy=1 (the wizard links there for advanced options like variants).
export default function SellerProductEntry() {
    const [params] = useSearchParams();
    const legacy = import.meta.env.VITE_LEGACY_PRODUCT_FORM === "true" || params.get("legacy") === "1";
    return (
        <Suspense fallback={null}>
            {legacy ? <SellerProductForm /> : <SellerProductWizard />}
        </Suspense>
    );
}
