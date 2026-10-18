import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import MobileBottomNav from "./MobileBottomNav";
import { AccountIcon, BrowseIcon, CartIcon, DashboardIcon, HomeIcon, MessagesIcon, OrdersIcon, SignInIcon, StoreIcon } from "./NavIcons";

// Role-aware phone bottom bar (Phase 8). Rendered from Header.jsx, which
// already owns the cart and unread-message counts, so there is no second
// poll for them. Header itself is not rendered on /admin or an open
// conversation, so the bar is absent there too.
//
//   guest   Home - Browse - Sell - Sign in   (Services stays a homepage tile, by design)
//   buyer   Home - Browse - Cart - Orders - Account
//   seller  Home - Browse - Dashboard - Messages - Account
//
// Admins and delivery agents have their own shells and get no bar. The bar
// is also left off full-screen or focus flows: the swipe feed, checkout,
// the auth forms and the delivery area.
const HIDDEN_ROUTE = /^\/(feed|checkout|login|register|forgot-password|delivery|admin)(\/|$)|^\/messages\/[^/]+\/?$/;

function badge(count, tone) {
    if (!count) return null;
    return (
        <span
            className={`absolute -top-1.5 -right-2.5 ${tone} text-[10px] font-sans font-semibold tabular-nums rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center`}
        >
            {count > 9 ? "9+" : count}
        </span>
    );
}

export function useBottomNavItems({ cartCount = 0, unreadMessages = 0 } = {}) {
    const { user } = useAuth();
    const { t } = useLanguage();

    const home = { to: "/", label: t("nav.home"), icon: HomeIcon, end: true };
    const browse = { to: "/feed", label: t("nav.browseShort"), icon: BrowseIcon };
    const account = { to: "/account", label: t("nav.account"), icon: AccountIcon };

    if (!user) {
        return [
            home,
            browse,
            { to: "/sell", label: t("nav.sell"), icon: StoreIcon },
            { to: "/login", label: t("nav.signIn"), icon: SignInIcon }
        ];
    }
    if (user.role === "buyer") {
        return [
            home,
            browse,
            { to: "/cart", label: t("nav.cart"), icon: CartIcon, badge: badge(cartCount, "bg-mango text-abyss") },
            { to: "/orders", label: t("nav.orders"), icon: OrdersIcon },
            account
        ];
    }
    if (user.role === "seller") {
        return [
            home,
            browse,
            { to: "/seller", label: t("nav.dashboard"), icon: DashboardIcon },
            { to: "/messages", label: t("nav.messages"), icon: MessagesIcon, badge: badge(unreadMessages, "bg-coral text-frost") },
            account
        ];
    }
    return null;
}

export default function AppBottomNav({ cartCount, unreadMessages }) {
    const location = useLocation();
    const items = useBottomNavItems({ cartCount, unreadMessages });
    const visible = Boolean(items) && !HIDDEN_ROUTE.test(location.pathname);

    // index.css reads this flag to reserve room for the bar (page padding)
    // and to lift fixed bottom-anchored UI (floating buttons, banners,
    // toasts, sticky action bars) clear of it. Phones only: the bar and the
    // offset both switch off from md up.
    useEffect(() => {
        if (!visible) return undefined;
        const root = document.documentElement;
        root.setAttribute("data-bottom-nav", "");
        return () => root.removeAttribute("data-bottom-nav");
    }, [visible]);

    if (!visible) return null;
    return <MobileBottomNav items={items} />;
}
