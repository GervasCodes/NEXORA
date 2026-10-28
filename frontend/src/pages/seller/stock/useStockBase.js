import { useLocation } from "react-router-dom";

// The same screens serve marketplace sellers (/seller/stock) and business-tools
// accounts (/business/stock).
export default function useStockBase() {
    const { pathname } = useLocation();
    return pathname.startsWith("/business") ? "/business" : "/seller";
}
