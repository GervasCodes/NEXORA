import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/client";

const STORAGE_KEY = "nexora_affiliate_click_token";

// Mounted once at the app root (see App.jsx) - fires whenever the URL
// carries a ?ref=CODE, on any page (a shared product link, not just the
// homepage). Stores the resulting click_token in localStorage; Checkout
// reads it back and sends it along as affiliate_click_token, see
// Checkout.jsx and order.service.js#checkout's affiliate attribution
// call. Renders nothing - this is a pure side-effect component.
export default function AffiliateClickTracker() {
    const location = useLocation();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const code = params.get("ref");
        if (!code) return;

        api.post("/affiliate/click", { code, path: location.pathname })
            .then(({ data }) => {
                if (data.data?.clickToken) {
                    localStorage.setItem(STORAGE_KEY, data.data.clickToken);
                }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    return null;
}

export const getStoredAffiliateClickToken = () => localStorage.getItem(STORAGE_KEY);
